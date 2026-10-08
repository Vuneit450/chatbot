"""Capa de datos de Bot Oreo: clientes, catálogo, carrito y pedidos.

Usa libsql (compatible con sqlite3) contra Turso en producción
(TURSO_DATABASE_URL + TURSO_AUTH_TOKEN) o un archivo local en desarrollo,
para que el bot recuerde clientes entre visitas y dispositivos en vez de
depender solo de la cookie de sesión.
"""

import os
import secrets
import time
from pathlib import Path

import libsql

BASE_DIR = Path(__file__).resolve().parent
TURSO_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")
LOCAL_DB_PATH = os.environ.get("LOCAL_DB_PATH", str(BASE_DIR / "bot_oreo.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  correo TEXT,
  usuario TEXT,
  telefono TEXT UNIQUE NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL,
  servicio TEXT NOT NULL,
  plan TEXT NOT NULL,
  precio_mxn REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS carrito_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL DEFAULT 1,
  agregado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  total_mxn REAL NOT NULL,
  token TEXT UNIQUE,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pedido_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  servicio TEXT NOT NULL,
  plan TEXT NOT NULL,
  precio_mxn REAL NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1
);
"""

# Catálogo estructurado migrado de los precios ya presentes en
# respuestas.json (opciones_spotify, opciones_netflix, etc.) para poder
# armar carrito y checkout reales en vez de solo texto informativo.
CATALOGO_SEED = [
    ("musica", "Spotify", "1 perfil (1 mes)", 50),
    ("musica", "Spotify", "2 perfiles (1 mes)", 80),
    ("musica", "Spotify", "Perfil adicional", 20),
    ("musica", "YouTube Music", "1 perfil (1 mes)", 50),
    ("musica", "YouTube Music", "2 perfiles (1 mes)", 80),
    ("musica", "YouTube Music", "Perfil adicional", 20),
    ("musica", "Amazon Music", "1 perfil (1 mes)", 50),
    ("peliculas", "Crunchyroll", "Cuenta completa (1 perfil)", 85),
    ("peliculas", "Crunchyroll", "Cuenta compartida (1 mes)", 50),
    ("peliculas", "Amazon Prime Video", "1 cuenta (1 mes)", 65),
    ("peliculas", "Amazon Prime Video", "Cuenta compartida", 50),
    ("peliculas", "Netflix", "1 perfil", 85),
    ("peliculas", "Netflix", "Cuenta adicional", 60),
]


def get_connection():
    if not TURSO_URL:
        return libsql.connect(LOCAL_DB_PATH)
    # Turso puede tardar en la primera conexión tras estar inactivo; un
    # solo reintento evita que un bache pasajero tumbe la petición.
    last_error = None
    for attempt in range(2):
        try:
            return libsql.connect(TURSO_URL, auth_token=TURSO_TOKEN)
        except Exception as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(1)
    raise last_error


def init_db():
    if not TURSO_URL and os.environ.get("RENDER"):
        # En Render el disco no es persistente: sin Turso, cada deploy o
        # reinicio del servicio borra clientes, carritos e historial.
        print("ADVERTENCIA: TURSO_DATABASE_URL no está configurada; usando SQLite local que no sobrevive un redeploy.")
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
        # Migración ligera para bases ya desplegadas antes de que `token`
        # existiera en pedidos (CREATE TABLE IF NOT EXISTS no altera tablas
        # que ya existen).
        try:
            conn.execute("ALTER TABLE pedidos ADD COLUMN token TEXT")
            conn.commit()
        except Exception:
            pass  # la columna ya existe
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM productos")
        if cur.fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO productos (categoria, servicio, plan, precio_mxn) VALUES (?, ?, ?, ?)",
                CATALOGO_SEED,
            )
            conn.commit()
    finally:
        conn.close()


# ---- Clientes ---------------------------------------------------------

def find_cliente_by_telefono(telefono):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, nombre, correo, usuario, telefono FROM clientes WHERE telefono = ?",
            (telefono,),
        )
        row = cur.fetchone()
        return _row_to_cliente(row)
    finally:
        conn.close()


def find_cliente_by_id(cliente_id):
    if cliente_id is None:
        return None
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, nombre, correo, usuario, telefono FROM clientes WHERE id = ?",
            (cliente_id,),
        )
        row = cur.fetchone()
        return _row_to_cliente(row)
    finally:
        conn.close()


def upsert_cliente(nombre, correo, usuario, telefono):
    """Crea el cliente o, si el teléfono ya existía, regresa el existente
    SIN modificar sus datos: el teléfono es la única credencial del bot, y
    quien lo teclea no ha demostrado ser su dueño, así que no puede
    reescribirle nombre/correo/usuario (para eso está "Actualizar
    información", que exige estar ya identificado)."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM clientes WHERE telefono = ?", (telefono,))
        existing = cur.fetchone()
        if existing:
            cliente_id = existing[0]
        else:
            conn.execute(
                "INSERT INTO clientes (nombre, correo, usuario, telefono) VALUES (?, ?, ?, ?)",
                (nombre, correo, usuario, telefono),
            )
            cliente_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.commit()
        return cliente_id
    finally:
        conn.close()


def actualizar_cliente(cliente_id, nombre, correo, usuario, telefono):
    """Actualiza el perfil de un cliente YA IDENTIFICADO (distinto de
    upsert_cliente, que busca por teléfono y puede crear uno nuevo). Si el
    teléfono nuevo ya le pertenece a OTRO cliente, no se guarda nada —
    regresa (False, "telefono_en_uso") para no robarle la cuenta a nadie."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM clientes WHERE telefono = ? AND id != ?", (telefono, cliente_id))
        if cur.fetchone():
            return False, "telefono_en_uso"
        conn.execute(
            "UPDATE clientes SET nombre = ?, correo = ?, usuario = ?, telefono = ? WHERE id = ?",
            (nombre, correo, usuario, telefono, cliente_id),
        )
        conn.commit()
        return True, None
    finally:
        conn.close()


def _row_to_cliente(row):
    if not row:
        return None
    return {"id": row[0], "nombre": row[1], "correo": row[2], "usuario": row[3], "telefono": row[4]}


# ---- Catálogo -----------------------------------------------------------

def productos_por_servicio(servicio):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, categoria, servicio, plan, precio_mxn FROM productos WHERE servicio = ? ORDER BY precio_mxn",
            (servicio,),
        )
        return [_row_to_producto(r) for r in cur.fetchall()]
    finally:
        conn.close()


def _row_to_producto(row):
    if not row:
        return None
    return {"id": row[0], "categoria": row[1], "servicio": row[2], "plan": row[3], "precio_mxn": row[4]}


# ---- Carrito ------------------------------------------------------------

def agregar_al_carrito(cliente_id, producto_id):
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO carrito_items (cliente_id, producto_id, cantidad) VALUES (?, ?, 1)",
            (cliente_id, producto_id),
        )
        conn.commit()
    finally:
        conn.close()


def ver_carrito(cliente_id):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT ci.id, p.servicio, p.plan, p.precio_mxn
            FROM carrito_items ci
            JOIN productos p ON p.id = ci.producto_id
            WHERE ci.cliente_id = ?
            ORDER BY ci.agregado_en, ci.id
            """,
            (cliente_id,),
        )
        return [
            {"item_id": r[0], "servicio": r[1], "plan": r[2], "precio_mxn": r[3]}
            for r in cur.fetchall()
        ]
    finally:
        conn.close()


def quitar_del_carrito(cliente_id, item_id):
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM carrito_items WHERE id = ? AND cliente_id = ?",
            (item_id, cliente_id),
        )
        conn.commit()
    finally:
        conn.close()


def vaciar_carrito(cliente_id):
    conn = get_connection()
    try:
        conn.execute("DELETE FROM carrito_items WHERE cliente_id = ?", (cliente_id,))
        conn.commit()
    finally:
        conn.close()


# ---- Pedidos --------------------------------------------------------------

def confirmar_pedido(cliente_id):
    """Convierte el carrito actual en un pedido. Regresa None si el
    carrito estaba vacío (nada que confirmar).

    Todo ocurre en una sola transacción y se verifica que el carrito leído
    sea el que de verdad se vació: si otra petición (doble clic, dos
    pestañas) ya lo confirmó, se revierte en vez de dejar un pedido con
    total pero sin productos."""
    token = secrets.token_urlsafe(16)
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT ci.id, p.servicio, p.plan, p.precio_mxn
            FROM carrito_items ci
            JOIN productos p ON p.id = ci.producto_id
            WHERE ci.cliente_id = ?
            ORDER BY ci.agregado_en, ci.id
            """,
            (cliente_id,),
        )
        items = [{"item_id": r[0], "servicio": r[1], "plan": r[2], "precio_mxn": r[3]} for r in cur.fetchall()]
        if not items:
            return None
        total = sum(i["precio_mxn"] for i in items)
        conn.execute(
            "INSERT INTO pedidos (cliente_id, total_mxn, token) VALUES (?, ?, ?)",
            (cliente_id, total, token),
        )
        pedido_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        copiados = 0
        for item in items:
            copiados += conn.execute(
                """
                INSERT INTO pedido_items (pedido_id, producto_id, servicio, plan, precio_mxn, cantidad)
                SELECT ?, ci.producto_id, p.servicio, p.plan, p.precio_mxn, ci.cantidad
                FROM carrito_items ci JOIN productos p ON p.id = ci.producto_id
                WHERE ci.id = ? AND ci.cliente_id = ?
                """,
                (pedido_id, item["item_id"], cliente_id),
            ).rowcount
        borrados = conn.execute("DELETE FROM carrito_items WHERE cliente_id = ?", (cliente_id,)).rowcount
        if copiados != len(items) or borrados != len(items):
            conn.rollback()
            return None
        conn.commit()
        return {"pedido_id": pedido_id, "items": items, "total_mxn": total, "token": token}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def pedido_por_token(token):
    """Para la página pública de recibo: el token (no el id secuencial)
    es lo que controla el acceso, para que no se puedan enumerar pedidos
    ajenos solo subiendo un número."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT pe.id, pe.total_mxn, pe.creado_en, c.nombre
            FROM pedidos pe JOIN clientes c ON c.id = pe.cliente_id
            WHERE pe.token = ?
            """,
            (token,),
        )
        row = cur.fetchone()
        if not row:
            return None
        pedido = {"id": row[0], "total_mxn": row[1], "creado_en": row[2], "cliente_nombre": row[3]}
        cur.execute(
            "SELECT servicio, plan, precio_mxn, cantidad FROM pedido_items WHERE pedido_id = ?",
            (pedido["id"],),
        )
        pedido["items"] = [
            {"servicio": r[0], "plan": r[1], "precio_mxn": r[2], "cantidad": r[3]}
            for r in cur.fetchall()
        ]
        return pedido
    finally:
        conn.close()


def historial_pedidos(cliente_id, limit=10):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, total_mxn, creado_en FROM pedidos WHERE cliente_id = ? ORDER BY creado_en DESC, id DESC LIMIT ?",
            (cliente_id, limit),
        )
        pedidos = [{"id": r[0], "total_mxn": r[1], "creado_en": r[2]} for r in cur.fetchall()]
        for pedido in pedidos:
            cur.execute(
                "SELECT producto_id, servicio, plan, precio_mxn, cantidad FROM pedido_items WHERE pedido_id = ?",
                (pedido["id"],),
            )
            pedido["items"] = [
                {"producto_id": r[0], "servicio": r[1], "plan": r[2], "precio_mxn": r[3], "cantidad": r[4]}
                for r in cur.fetchall()
            ]
        return pedidos
    finally:
        conn.close()


def categorias_compradas(cliente_id):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT DISTINCT p.categoria FROM pedido_items pi
            JOIN pedidos pe ON pe.id = pi.pedido_id
            JOIN productos p ON p.id = pi.producto_id
            WHERE pe.cliente_id = ?
            """,
            (cliente_id,),
        )
        return {r[0] for r in cur.fetchall()}
    finally:
        conn.close()


def sugerencia_producto(cliente_id):
    """Sugiere un producto de una categoría que el cliente todavía no ha
    comprado, para el clásico "ya que te gustó X, prueba Y" post-compra."""
    compradas = categorias_compradas(cliente_id)
    conn = get_connection()
    try:
        cur = conn.cursor()
        if compradas:
            placeholders = ",".join("?" for _ in compradas)
            cur.execute(
                f"SELECT id, categoria, servicio, plan, precio_mxn FROM productos "
                f"WHERE categoria NOT IN ({placeholders}) ORDER BY precio_mxn LIMIT 1",
                tuple(compradas),
            )
        else:
            cur.execute(
                "SELECT id, categoria, servicio, plan, precio_mxn FROM productos ORDER BY precio_mxn LIMIT 1"
            )
        return _row_to_producto(cur.fetchone())
    finally:
        conn.close()
