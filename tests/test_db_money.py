"""Dinero y datos de clientes: totales de pedidos, carrito y perfiles."""

import re

import db


def _cliente(tel="5511111111", nombre="Ana"):
    return db.upsert_cliente(nombre, f"{nombre}@x.mx", nombre.lower(), tel)


def _producto(servicio, plan=None):
    return next(p for p in db.productos_por_servicio(servicio) if plan is None or p["plan"] == plan)


def test_catalogo_semilla_tiene_precios_positivos():
    for servicio in ("Spotify", "YouTube Music", "Amazon Music", "Crunchyroll", "Amazon Prime Video", "Netflix"):
        productos = db.productos_por_servicio(servicio)
        assert productos, servicio
        assert all(p["precio_mxn"] > 0 for p in productos)


def test_total_del_pedido_es_la_suma_de_los_items_y_vacia_el_carrito():
    cid = _cliente()
    a, b = _producto("Spotify", "1 perfil (1 mes)"), _producto("Netflix", "1 perfil")
    db.agregar_al_carrito(cid, a["id"])
    db.agregar_al_carrito(cid, b["id"])
    db.agregar_al_carrito(cid, a["id"])  # mismo producto dos veces
    pedido = db.confirmar_pedido(cid)
    assert pedido["total_mxn"] == 2 * a["precio_mxn"] + b["precio_mxn"] == 185
    assert db.ver_carrito(cid) == []
    guardado = db.pedido_por_token(pedido["token"])
    assert guardado["total_mxn"] == pedido["total_mxn"]
    assert sum(i["precio_mxn"] * i["cantidad"] for i in guardado["items"]) == guardado["total_mxn"]
    assert len(guardado["items"]) == 3


def test_pedido_con_carrito_vacio_no_crea_nada():
    cid = _cliente()
    assert db.confirmar_pedido(cid) is None
    assert db.historial_pedidos(cid) == []


def test_pedido_con_carrito_viejo_no_crea_pedido_fantasma(monkeypatch):
    """Doble envío / dos pestañas: si el carrito ya se vació entre que se
    leyó y que se confirmó, NO debe quedar un pedido con total pero sin
    items (que además se avisaría a Bolsillo como venta)."""
    cid = _cliente()
    db.agregar_al_carrito(cid, _producto("Netflix", "1 perfil")["id"])
    viejo = db.ver_carrito(cid)
    assert db.confirmar_pedido(cid) is not None  # primera confirmación
    monkeypatch.setattr(db, "ver_carrito", lambda _cid: viejo)  # lectura rancia
    assert db.confirmar_pedido(cid) is None
    pedidos = db.historial_pedidos(cid)
    assert len(pedidos) == 1 and pedidos[0]["items"]


def test_precio_del_pedido_queda_congelado_si_cambia_el_catalogo():
    cid = _cliente()
    p = _producto("Spotify", "1 perfil (1 mes)")
    db.agregar_al_carrito(cid, p["id"])
    pedido = db.confirmar_pedido(cid)
    conn = db.get_connection()
    conn.execute("UPDATE productos SET precio_mxn = 999 WHERE id = ?", (p["id"],))
    conn.commit()
    conn.close()
    assert db.pedido_por_token(pedido["token"])["total_mxn"] == 50


def test_quitar_del_carrito_no_toca_carritos_ajenos():
    a, b = _cliente("5511111111", "Ana"), _cliente("5522222222", "Beto")
    db.agregar_al_carrito(a, _producto("Netflix", "1 perfil")["id"])
    item_de_ana = db.ver_carrito(a)[0]["item_id"]
    db.quitar_del_carrito(b, item_de_ana)
    assert len(db.ver_carrito(a)) == 1


def test_orden_del_carrito_es_estable_con_la_misma_marca_de_tiempo():
    cid = _cliente()
    ids = [_producto("Spotify", "1 perfil (1 mes)")["id"], _producto("Netflix", "1 perfil")["id"], _producto("Crunchyroll", "Cuenta compartida (1 mes)")["id"]]
    conn = db.get_connection()
    for pid in ids:  # misma marca de tiempo exacta
        conn.execute("INSERT INTO carrito_items (cliente_id, producto_id, agregado_en) VALUES (?, ?, '2026-01-01 00:00:00')", (cid, pid))
    conn.commit()
    conn.close()
    assert [i["item_id"] for i in db.ver_carrito(cid)] == sorted(i["item_id"] for i in db.ver_carrito(cid))


def test_historial_devuelve_primero_el_pedido_mas_reciente_aunque_empaten_en_fecha():
    cid = _cliente()
    for nombre in ("Spotify", "Netflix"):
        db.agregar_al_carrito(cid, _producto(nombre)["id"])
        db.confirmar_pedido(cid)
    conn = db.get_connection()
    conn.execute("UPDATE pedidos SET creado_en = '2026-01-01 00:00:00'")
    conn.commit()
    conn.close()
    ultimo = db.historial_pedidos(cid, limit=1)[0]
    assert ultimo["items"][0]["servicio"] == "Netflix"


def test_token_de_recibo_no_es_adivinable_y_desconocido_da_none():
    cid = _cliente()
    db.agregar_al_carrito(cid, _producto("Netflix")["id"])
    token = db.confirmar_pedido(cid)["token"]
    assert len(token) >= 20 and re.fullmatch(r"[A-Za-z0-9_-]+", token)
    assert db.pedido_por_token("1") is None
    assert db.pedido_por_token("' OR '1'='1") is None
    assert db.pedido_por_token("") is None


def test_sql_injection_en_telefono_y_datos_se_trata_como_texto():
    malo = "5500000000'; DROP TABLE clientes; --"
    assert db.find_cliente_by_telefono(malo) is None
    cid = db.upsert_cliente("Robert'); DROP TABLE clientes;--", "a@b.c", "x", "5533333333")
    assert db.find_cliente_by_id(cid)["nombre"].startswith("Robert'")
    assert db.find_cliente_by_telefono("5533333333")["id"] == cid


def test_re_registro_con_telefono_existente_no_pisa_los_datos_del_dueno():
    """Registrarse con el teléfono de otra persona no debe reescribir su
    nombre/correo/usuario (nadie ha probado ser el dueño)."""
    cid = db.upsert_cliente("Ana", "ana@x.mx", "ana", "5544444444")
    cid2 = db.upsert_cliente("Intruso", "i@x.mx", "intruso", "5544444444")
    assert cid2 == cid
    c = db.find_cliente_by_id(cid)
    assert (c["nombre"], c["correo"], c["usuario"]) == ("Ana", "ana@x.mx", "ana")


def test_actualizar_cliente_rechaza_telefono_de_otro_y_permite_el_propio():
    a, b = _cliente("5511111111", "Ana"), _cliente("5522222222", "Beto")
    assert db.actualizar_cliente(a, "Ana", "a@x", "ana", "5522222222") == (False, "telefono_en_uso")
    assert db.find_cliente_by_id(a)["telefono"] == "5511111111"
    assert db.actualizar_cliente(a, "Ana 2", "a@x", "ana", "5511111111") == (True, None)
    assert db.find_cliente_by_id(b)["telefono"] == "5522222222"
