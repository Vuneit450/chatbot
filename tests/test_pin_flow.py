"""Identificación con teléfono + PIN a través de la API del chat."""

from conftest import PIN, registrar, say

import chatbot
import db

TEL = "5512345678"
GENERICO = "No pudimos identificarte con ese teléfono y PIN"


def _login(client, tel, pin):
    client.post("/api/start")
    say(client, "5")  # Ya tengo cuenta
    _, p = say(client, tel)
    if p["node"] == "identificarme_pin":
        _, p = say(client, pin)
    return p


def test_registro_pide_pin_con_confirmacion_y_lo_guarda_hasheado(client):
    client.post("/api/start")
    say(client, "1")
    for v in ("Ana", "ana@x.mx", "ana_01", TEL):
        say(client, v)
    _, p = say(client, "12")  # muy corto
    assert p["node"] == "pin_crear" and "4 a 6 dígitos" in p["lines"][0] and p["secret"] is True
    _, p = say(client, "1234")
    assert p["node"] == "pin_confirmar" and p["secret"] is True
    _, p = say(client, "4321")  # no coincide
    assert p["node"] == "pin_crear" and "no coinciden" in p["lines"][0]
    say(client, "1234")
    _, p = say(client, "1234")
    assert p["node"] == "registro_confirmacion"
    pin_hash = db.get_connection().execute("SELECT pin_hash FROM clientes").fetchone()[0]
    assert pin_hash and "1234" not in pin_hash


def test_el_pin_nunca_aparece_en_la_cookie_de_sesion(client):
    client.post("/api/start")
    say(client, "1")
    for v in ("Ana", "ana@x.mx", "ana_01", TEL, "7391", "7391"):
        say(client, v)
        with client.session_transaction() as s:
            assert "7391" not in repr(dict(s))
    raw = client.get_cookie("session").value
    assert "7391" not in raw


def test_pin_incorrecto_no_identifica_y_correcto_si(client):
    registrar(client)
    otro = chatbot.app.test_client()
    p = _login(otro, TEL, "9999")
    assert p["node"] == "identificarme_no_encontrado"
    _, p = say(otro, "2")
    assert p["node"] == "identificarme"
    p = _login(otro, TEL, PIN)
    assert p["node"] == "menu_principal" and "Ana" in " ".join(p["lines"])


def test_respuesta_identica_para_telefono_inexistente_y_pin_incorrecto(client):
    registrar(client)
    a = _login(chatbot.app.test_client(), "5500000000", PIN)
    b = _login(chatbot.app.test_client(), TEL, "9999")
    assert a == b and GENERICO in a["lines"][0]


def test_cinco_pin_incorrectos_bloquean_aunque_luego_se_acierte(client, monkeypatch):
    monkeypatch.setattr(chatbot, "auth_limiter", chatbot.RateLimiter(1000, 600))
    registrar(client)
    t = [5_000_000]
    monkeypatch.setattr(db, "now", lambda: t[0])
    otro = chatbot.app.test_client()
    for _ in range(5):
        assert _login(otro, TEL, "0000")["node"] == "identificarme_no_encontrado"
    bloqueado = _login(otro, TEL, PIN)
    assert bloqueado["node"] == "identificarme_no_encontrado" and bloqueado["lines"] == a_generico(otro)
    t[0] += 15 * 60 + 1
    assert _login(otro, TEL, PIN)["node"] == "menu_principal"


def a_generico(client):
    return _login(client, "5500000000", PIN)["lines"]


def test_sesion_antigua_solo_con_telefono_deja_de_identificar(client):
    registrar(client)
    with client.session_transaction() as s:
        s.pop("pin_ok")  # cookie de antes de los PIN
    client.post("/api/start")
    _, p = say(client, "2")  # menú no identificado: Inicio
    assert "Qué bueno verte" not in " ".join(p["lines"])
    with client.session_transaction() as s:
        s["node"] = "carrito"
    _, p = say(client, "hola")
    assert "identificarte" in " ".join(p["lines"])


def _legado(tel="5533334444"):
    conn = db.get_connection()
    conn.execute(
        "INSERT INTO clientes (nombre, correo, usuario, telefono) VALUES ('Viejo', 'v@x.mx', 'viejo', ?)", (tel,)
    )
    conn.commit()
    conn.close()
    return tel


def test_cliente_legado_crea_pin_antes_de_ver_datos(client):
    tel = _legado()
    client.post("/api/start")
    say(client, "5")
    _, p = say(client, tel)
    assert p["node"] == "pin_crear" and "anterior al PIN" in p["lines"][0]
    assert "Viejo" not in " ".join(p["lines"])
    with client.session_transaction() as s:
        assert "cliente_id" not in s
    say(client, "2468")
    _, p = say(client, "2468")
    assert p["node"] == "menu_principal" and "Viejo" in " ".join(p["lines"])
    assert db.verificar_pin(tel, "2468") is not None


def test_registrarse_con_telefono_que_ya_tiene_pin_no_identifica_ni_pisa(client):
    registrar(client)
    intruso = chatbot.app.test_client()
    registrar(intruso, nombre="Intruso", usuario="intruso", pin="9876")
    assert intruso.get("/api/state").get_json()["node"] == "registro_existente"
    assert db.find_cliente_by_telefono(TEL)["nombre"] == "Ana"
    assert db.verificar_pin(TEL, "9876") is None


def _a_actualizar(client):
    say(client, "*")
    for m in ("4", "3", "5", "2"):  # Inicio > Ayuda > Buscar info > Actualizar
        say(client, m)


def test_actualizar_informacion_exige_el_pin_actual(client):
    registrar(client)
    _a_actualizar(client)
    _, p = say(client, "Nuevo")  # sin PIN no avanza
    assert p["node"] == "actualizar_informacion" and p["secret"] is True
    _, p = say(client, "0000")
    assert "PIN incorrecto" in p["lines"][0]
    assert db.find_cliente_by_telefono(TEL)["nombre"] == "Ana"
    _, p = say(client, PIN)
    assert "nombre actual" in p["lines"][0] and not p.get("secret")


def test_actualizar_informacion_reconfirma_pin_si_vence(client, monkeypatch):
    registrar(client)
    _a_actualizar(client)
    say(client, PIN)
    monkeypatch.setattr(db, "now", lambda: 2**40)
    _, p = say(client, "Nuevo")
    assert p["secret"] is True


def test_cambiar_pin_exige_el_actual_y_el_viejo_deja_de_servir(client):
    registrar(client)
    say(client, "*")
    say(client, "3")  # Mi cuenta
    _, p = say(client, "2")  # Cambiar mi PIN
    assert p["node"] == "pin_actual" and p["secret"] is True
    _, p = say(client, "0000")
    assert p["node"] == "pin_actual" and "PIN incorrecto" in p["lines"][0]
    _, p = say(client, PIN)
    assert p["node"] == "pin_crear"
    say(client, "555666")
    _, p = say(client, "555666")
    assert p["node"] == "pin_cambiado"
    assert db.verificar_pin(TEL, PIN) is None
    assert db.verificar_pin(TEL, "555666") is not None


def test_cambiar_pin_sin_confirmar_igual_no_lo_cambia(client):
    registrar(client)
    say(client, "*")
    say(client, "3")
    say(client, "2")
    say(client, PIN)
    say(client, "555666")
    _, p = say(client, "111111")
    assert p["node"] == "pin_crear"
    assert db.verificar_pin(TEL, PIN) is not None


def test_pin_actual_comparte_el_bloqueo_de_la_cuenta(client):
    registrar(client)
    say(client, "*")
    say(client, "3")
    say(client, "2")
    for _ in range(5):
        say(client, "0000")
    _, p = say(client, PIN)
    assert p["node"] == "pin_actual"  # bloqueada: ni el PIN correcto sirve


def test_salir_cierra_sesion_y_exige_pin_otra_vez(client):
    registrar(client)
    say(client, "*")
    say(client, "0")
    with client.session_transaction() as s:
        assert "cliente_id" not in s and "pin_ok" not in s
