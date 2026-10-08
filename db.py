"""Capa de datos de Bot Oreo: clientes, catálogo, carrito y pedidos.

Usa libsql (compatible con sqlite3) contra Turso en producción
(TURSO_DATABASE_URL + TURSO_AUTH_TOKEN) o un archivo local en desarrollo,
para que el bot recuerde clientes entre visitas y dispositivos en vez de
depender solo de la cookie de sesión.
"""

from __future__ import annotations

import os
import secrets
import time
from pathlib import Path
from typing import Any

import libsql
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
TURSO_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")
LOCAL_DB_PATH = os.environ.get("LOCAL_DB_PATH", str(BASE_DIR / "bot_oreo.db"))

# Bloqueo por cliente tras PIN incorrectos seguidos (además del límite por IP).
MAX_INTENTOS_PIN = 5
BLOQUEO_SEGUNDOS = 15 * 60
# Hash de relleno: se compara contra él cuando el teléfono no existe o la
# cuenta está bloqueada, para que el tiempo de respuesta no delate cuál fue el caso.
_HASH_RELLENO = generate_password_hash("relleno-sin-uso")


def now() -> int:
    """Reloj en segundos epoch (aislado para poder simular el paso del tiempo)."""
    return int(time.time())


SCHEMA = """
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  correo TEXT,
  usuario TEXT,
  telefono TEXT UNIQUE NOT NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  pin_hash TEXT,
  intentos_pin INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER
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


def get_connection() -> Any:
    if not TURSO_URL:
        conn = libsql.connect(LOCAL_DB_PATH)
        # Peticiones concurrentes (gunicorn/hilos, Playwright en paralelo)
        # esperan el candado de escritura en vez de fallar con "database is locked".
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("PRAGMA journal_mode = WAL")  # lectores y escritor no se bloquean entre sí
        return conn
    # Turso puede tardar en la primera conexión tras estar inactivo; un
    # solo reintento evita que un bache pasajero tumbe la petición.
    last_error = None
    for attempt in range(2):
        try:
            return libsql.connect(TURSO_URL, auth_token=TURSO_TOKEN)
        except Exception as exc:  # noqa: BLE001 - reintento ante cualquier falla de conexión
            last_error = exc
            if attempt == 0:
                time.sleep(1)
    raise last_error


def init_db() -> None:
    if not TURSO_URL and os.environ.get("RENDER"):
        # En Render el disco no es persistente: sin Turso, cada deploy o
        # reinicio del servicio borra clientes, carritos e historial.
        print("ADVERTENCIA: TURSO_DATABASE_URL no está configurada; usando SQLite local que no sobrevive un redeploy.")
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
        # Migración ligera para bases ya desplegadas (CREATE TABLE IF NOT
        # EXISTS no altera tablas existentes). PRAGMA table_info funciona
        # igual en SQLite local y en Turso.
        for tabla, columna, ddl in (
            ("pedidos", "token", "token TEXT"),
            ("clientes", "pin_hash", "pin_hash TEXT"),
            ("clientes", "intentos_pin", "intentos_pin INTEGER NOT NULL DEFAULT 0"),
            ("clientes", "bloqueado_hasta", "bloqueado_hasta INTEGER"),
        ):
            columnas = [r[1] for r in conn.execute(f"PRAGMA table_info({tabla})").fetchall()]
            if columna not in columnas:
                conn.execute(f"ALTER TABLE {tabla} ADD COLUMN {ddl}")
                conn.commit()
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


def find_cliente_by_telefono(telefono: str) -> dict[str, Any] | None:
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


def find_cliente_by_id(cliente_id: int | None) -> dict[str, Any] | None:
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


def crear_cliente(nombre: str, correo: str, usuario: str, telefono: str, pin: str) -> tuple[int | None, str]:
    """Registra un cliente nuevo con su PIN (solo se guarda el hash).

    Regresa (cliente_id, estado):
    - "creado": cliente nuevo.
    - "legacy": el teléfono era de un cliente anterior al PIN y aún no tenía
      uno; se le fija este PIN SIN tocar nombre/correo/usuario (riesgo
      residual documentado en el README).
    - "existe": el teléfono ya tiene PIN; no se hace nada (cliente_id None).
    """
    pin_hash = generate_password_hash(pin)  # antes de abrir la conexión (~100 ms)
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, pin_hash FROM clientes WHERE telefono = ?", (telefono,))
        existing = cur.fetchone()
        if existing:
            if existing[1]:
                return None, "existe"
            conn.execute(
                "UPDATE clientes SET pin_hash = ?, intentos_pin = 0, bloqueado_hasta = NULL WHERE id = ?",
                (pin_hash, existing[0]),
            )
            conn.commit()
            return existing[0], "legacy"
        conn.execute(
            "INSERT INTO clientes (nombre, correo, usuario, telefono, pin_hash) VALUES (?, ?, ?, ?, ?)",
            (nombre, correo, usuario, telefono, pin_hash),
        )
        cliente_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.commit()
        return cliente_id, "creado"
    finally:
        conn.close()


def estado_pin(telefono: str) -> bool | None:
    """None si el teléfono no existe; False si existe pero sin PIN (cliente
    anterior a esta función); True si ya tiene PIN."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT pin_hash FROM clientes WHERE telefono = ?", (telefono,)).fetchone()
        return None if row is None else bool(row[0])
    finally:
        conn.close()


def _verificar_pin(columna: str, valor: Any, pin: str) -> dict[str, Any] | None:
    """Verifica el PIN con comparación de tiempo constante y aplica el
    bloqueo por cliente. `columna` es siempre una constante interna.

    La lectura y las escrituras usan conexiones distintas y el hash se
    calcula entre ambas: así no se mantiene una lectura abierta durante
    ~100 ms de scrypt, lo que con SQLite haría fallar con "database is
    locked" a la escritura que sigue si otra petición escribió mientras."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            f"SELECT id, nombre, correo, usuario, telefono, pin_hash, bloqueado_hasta, intentos_pin FROM clientes WHERE {columna} = ?",
            (valor,),
        )
        rows = cur.fetchall()
    finally:
        conn.close()
    row = rows[0] if rows else None
    if row is None or not row[5] or (row[6] or 0) > now():
        check_password_hash(_HASH_RELLENO, pin)  # mismo costo que un intento real
        return None
    acierto = check_password_hash(row[5], pin)
    if acierto and not (row[7] or row[6]):
        return _row_to_cliente(row)  # camino común: sin escrituras
    conn = get_connection()
    try:
        if acierto:
            conn.execute("UPDATE clientes SET intentos_pin = 0, bloqueado_hasta = NULL WHERE id = ?", (row[0],))
            conn.commit()
            return _row_to_cliente(row)
        conn.execute("UPDATE clientes SET intentos_pin = intentos_pin + 1 WHERE id = ?", (row[0],))
        conn.execute(
            "UPDATE clientes SET intentos_pin = 0, bloqueado_hasta = ? WHERE id = ? AND intentos_pin >= ?",
            (now() + BLOQUEO_SEGUNDOS, row[0], MAX_INTENTOS_PIN),
        )
        conn.commit()
        return None
    finally:
        conn.close()


def verificar_pin(telefono: str, pin: str) -> dict[str, Any] | None:
    """Cliente si teléfono+PIN son correctos y la cuenta no está bloqueada;
    None en cualquier otro caso (sin distinguir cuál: no enumera teléfonos)."""
    return _verificar_pin("telefono", telefono, pin)


def verificar_pin_cliente(cliente_id: int, pin: str) -> bool:
    """Reconfirma el PIN de un cliente ya identificado (cambios sensibles).
    Comparte contador y bloqueo con verificar_pin."""
    return _verificar_pin("id", cliente_id, pin) is not None


def fijar_pin_legacy(telefono: str, pin: str) -> dict[str, Any] | None:
    """Fija el PIN de un cliente que aún no tiene (solo si sigue sin PIN)."""
    conn = get_connection()
    try:
        cur = conn.execute(
            "UPDATE clientes SET pin_hash = ?, intentos_pin = 0, bloqueado_hasta = NULL WHERE telefono = ? AND pin_hash IS NULL",
            (generate_password_hash(pin), telefono),
        )
        conn.commit()
        if cur.rowcount != 1:
            return None
    finally:
        conn.close()
    return find_cliente_by_telefono(telefono)


def cambiar_pin(cliente_id: int, pin: str) -> None:
    conn = get_connection()
    try:
        conn.execute(
            "UPDATE clientes SET pin_hash = ?, intentos_pin = 0, bloqueado_hasta = NULL WHERE id = ?",
            (generate_password_hash(pin), cliente_id),
        )
        conn.commit()
    finally:
        conn.close()


def actualizar_cliente(
    cliente_id: int, nombre: str, correo: str, usuario: str, telefono: str
) -> tuple[bool, str | None]:
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


def productos_por_servicio(servicio: str) -> list[dict[str, Any]]:
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


def agregar_al_carrito(cliente_id: int, producto_id: int) -> None:
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO carrito_items (cliente_id, producto_id, cantidad) VALUES (?, ?, 1)",
            (cliente_id, producto_id),
        )
        conn.commit()
    finally:
        conn.close()


def ver_carrito(cliente_id: int) -> list[dict[str, Any]]:
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
        return [{"item_id": r[0], "servicio": r[1], "plan": r[2], "precio_mxn": r[3]} for r in cur.fetchall()]
    finally:
        conn.close()


def quitar_del_carrito(cliente_id: int, item_id: int) -> None:
    conn = get_connection()
    try:
        conn.execute(
            "DELETE FROM carrito_items WHERE id = ? AND cliente_id = ?",
            (item_id, cliente_id),
        )
        conn.commit()
    finally:
        conn.close()


def vaciar_carrito(cliente_id: int) -> None:
    conn = get_connection()
    try:
        conn.execute("DELETE FROM carrito_items WHERE cliente_id = ?", (cliente_id,))
        conn.commit()
    finally:
        conn.close()


# ---- Pedidos --------------------------------------------------------------


def confirmar_pedido(cliente_id: int) -> dict[str, Any] | None:
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


def pedido_por_token(token: str) -> dict[str, Any] | None:
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
            {"servicio": r[0], "plan": r[1], "precio_mxn": r[2], "cantidad": r[3]} for r in cur.fetchall()
        ]
        return pedido
    finally:
        conn.close()


def historial_pedidos(cliente_id: int, limit: int = 10) -> list[dict[str, Any]]:
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


def categorias_compradas(cliente_id: int) -> set[str]:
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


def sugerencia_producto(cliente_id: int) -> dict[str, Any] | None:
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
            cur.execute("SELECT id, categoria, servicio, plan, precio_mxn FROM productos ORDER BY precio_mxn LIMIT 1")
        return _row_to_producto(cur.fetchone())
    finally:
        conn.close()
