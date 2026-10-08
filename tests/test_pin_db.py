"""PIN de cliente: hash en la base, bloqueo por intentos y migración."""

import os
import sqlite3
import tempfile

import db

TEL = "5511112222"


def _crear(pin="1234", tel=TEL):
    return db.crear_cliente("Ana", "ana@x.mx", "ana", tel, pin)[0]


def _fila(tel=TEL):
    conn = db.get_connection()
    try:
        return conn.execute(
            "SELECT pin_hash, intentos_pin, bloqueado_hasta FROM clientes WHERE telefono = ?", (tel,)
        ).fetchone()
    finally:
        conn.close()


def test_pin_se_guarda_como_hash_nunca_en_claro():
    _crear("246810")
    pin_hash, _, _ = _fila()
    assert pin_hash and "246810" not in pin_hash and pin_hash != "246810"
    assert pin_hash.startswith(("scrypt:", "pbkdf2:"))
    cliente = db.find_cliente_by_telefono(TEL)
    assert "pin_hash" not in cliente and "246810" not in str(cliente)


def test_pin_correcto_identifica_e_incorrecto_no():
    cid = _crear()
    assert db.verificar_pin(TEL, "1234")["id"] == cid
    assert db.verificar_pin(TEL, "1235") is None
    assert db.verificar_pin(TEL, "") is None
    assert db.verificar_pin("5500000000", "1234") is None  # teléfono inexistente


def test_cinco_fallos_bloquean_15_minutos_y_el_bloqueo_expira(monkeypatch):
    _crear()
    t = [1_000_000]
    monkeypatch.setattr(db, "now", lambda: t[0])
    for _ in range(5):
        assert db.verificar_pin(TEL, "0000") is None
    assert _fila()[2] == t[0] + 15 * 60
    assert db.verificar_pin(TEL, "1234") is None  # correcto, pero bloqueado
    t[0] += 15 * 60 - 1
    assert db.verificar_pin(TEL, "1234") is None
    t[0] += 2
    assert db.verificar_pin(TEL, "1234") is not None  # expiró
    assert _fila()[1:] == (0, None)


def test_un_acierto_reinicia_el_contador_de_fallos():
    _crear()
    for _ in range(4):
        db.verificar_pin(TEL, "0000")
    assert db.verificar_pin(TEL, "1234") is not None
    for _ in range(4):
        db.verificar_pin(TEL, "0000")
    assert db.verificar_pin(TEL, "1234") is not None  # nunca llegó a 5 seguidos


def test_verificar_pin_cliente_comparte_el_bloqueo():
    cid = _crear()
    for _ in range(5):
        assert db.verificar_pin_cliente(cid, "0000") is False
    assert db.verificar_pin_cliente(cid, "1234") is False
    assert db.verificar_pin(TEL, "1234") is None


def test_cliente_legado_sin_pin_no_se_identifica_y_puede_fijarlo():
    conn = db.get_connection()
    conn.execute("INSERT INTO clientes (nombre, correo, usuario, telefono) VALUES ('Viejo', 'v@x', 'viejo', ?)", (TEL,))
    conn.commit()
    conn.close()
    assert db.estado_pin(TEL) is False
    assert db.estado_pin("5500000000") is None
    assert db.verificar_pin(TEL, "") is None and db.verificar_pin(TEL, "1234") is None
    assert db.fijar_pin_legacy(TEL, "4321")["nombre"] == "Viejo"
    assert db.estado_pin(TEL) is True
    assert db.fijar_pin_legacy(TEL, "9999") is None  # ya no se puede pisar
    assert db.verificar_pin(TEL, "4321") is not None


def test_registrar_con_telefono_legado_fija_pin_sin_tocar_datos():
    conn = db.get_connection()
    conn.execute("INSERT INTO clientes (nombre, correo, usuario, telefono) VALUES ('Viejo', 'v@x', 'viejo', ?)", (TEL,))
    conn.commit()
    conn.close()
    cid, estado = db.crear_cliente("Otro", "o@x", "otro", TEL, "1234")
    assert estado == "legacy" and db.find_cliente_by_id(cid)["nombre"] == "Viejo"


def test_cambiar_pin_invalida_el_anterior():
    cid = _crear()
    db.cambiar_pin(cid, "6789")
    assert db.verificar_pin(TEL, "1234") is None
    assert db.verificar_pin(TEL, "6789") is not None


def test_migracion_agrega_columnas_a_una_base_vieja_y_es_idempotente(monkeypatch):
    ruta = os.path.join(tempfile.mkdtemp(), "vieja.db")
    c = sqlite3.connect(ruta)
    c.execute(
        "CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, correo TEXT, usuario TEXT, telefono TEXT UNIQUE NOT NULL, creado_en TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    c.execute("INSERT INTO clientes (nombre, telefono) VALUES ('Viejo', '5500001111')")
    c.commit()
    c.close()
    monkeypatch.setattr(db, "LOCAL_DB_PATH", ruta)
    db.init_db()
    db.init_db()
    cols = [r[1] for r in sqlite3.connect(ruta).execute("PRAGMA table_info(clientes)")]
    assert {"pin_hash", "intentos_pin", "bloqueado_hasta"} <= set(cols)
    assert db.estado_pin("5500001111") is False
