"""Autenticación/autorización, entradas hostiles, cabeceras y límites."""

from conftest import PIN, registrar, say

import chatbot
import db


def test_menu_publico_ofrece_identificarse(client):
    client.post("/api/start")
    _, p = say(client, "5")  # identificarme sin cuenta
    assert p["node"] == "identificarme"


def test_no_se_puede_agregar_ni_comprar_sin_identificarse(client):
    client.post("/api/start")
    for m in ("2", "1", "1", "1"):  # Inicio > Catálogo > Música > Spotify
        say(client, m)
    _, p = say(client, "1")  # intenta agregar un plan sin cuenta
    assert "identificarte" in " ".join(p["lines"])
    assert db.ver_carrito(1) == []
    assert db.historial_pedidos(1) == []


def test_flujo_de_compra_total_correcto_de_punta_a_punta(client):
    registrar(client)
    say(client, "*")
    say(client, "1")  # catálogo
    say(client, "1")  # música
    say(client, "1")  # Spotify
    _, p = say(client, "3")  # plan más caro de Spotify (2 perfiles) = $80
    assert p["node"] == "producto_agregado"
    say(client, "2")  # ver carrito
    _, p = say(client, "comprar")
    assert "Total: $80 MXN" in " ".join(p["lines"])
    _, p = say(client, "1")
    assert p["node"] == "pedido_confirmado" and "$80 MXN" in p["lines"][0]
    assert db.historial_pedidos(1)[0]["total_mxn"] == 80


def test_cookie_de_sesion_httponly_y_samesite(client):
    res = client.post("/api/start")
    cookie = res.headers["Set-Cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=Lax" in cookie


def test_cookie_secure_y_vida_corta_en_produccion():
    assert chatbot.app.config["SESSION_COOKIE_HTTPONLY"] is True
    assert chatbot.app.config["PERMANENT_SESSION_LIFETIME"].days <= 30


def test_cabeceras_de_seguridad(client):
    res = client.get("/")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    csp = res.headers["Content-Security-Policy"]
    assert "script-src 'self'" in csp and "frame-ancestors 'none'" in csp and "object-src 'none'" in csp


def test_api_y_recibo_no_se_cachean(client):
    assert "no-store" in client.post("/api/start").headers["Cache-Control"]
    assert client.get("/recibo/xyz").status_code == 404


def test_cuerpo_json_que_no_es_objeto_no_tumba_el_servidor(client):
    for cuerpo in ([1, 2], "hola", 5, None):
        res = client.post("/api/message", json=cuerpo)
        assert res.status_code == 200, cuerpo
        assert res.get_json()["node"] != "error"


def test_mensaje_enorme_se_acota(client):
    client.post("/api/start")
    res, p = say(client, "9" * 5000)
    assert res.status_code == 200 and p["node"] != "error"
    res = client.post("/api/message", data="x" * (70 * 1024), content_type="application/json")
    assert res.status_code == 413


def test_digitos_unicode_no_rompen_el_catalogo(client):
    registrar(client)
    for m in ("*", "1", "1", "1"):
        say(client, m)
    for raro in ("²", "①", "٣", "１"):
        _, p = say(client, raro)
        assert p["node"] != "error", raro


def test_recibo_escapa_html_del_nombre(client):
    registrar(client, nombre="<script>alert(1)</script>")
    say(client, "*")
    for m in ("1", "1", "1", "1", "2", "comprar", "1"):
        _, p = say(client, m)
    token = next(linea for linea in p["lines"] if "/recibo/" in linea).split("(/recibo/")[1].rstrip(")")
    html = client.get(f"/recibo/{token}").get_data(as_text=True)
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html
    assert "noindex" in client.get(f"/recibo/{token}").headers.get("X-Robots-Tag", "")


def test_limite_de_mensajes_por_ip(client, monkeypatch):
    monkeypatch.setattr(chatbot, "message_limiter", chatbot.RateLimiter(5, 60))
    client.post("/api/start")
    codigos = [say(client, "hola")[0].status_code for _ in range(8)]
    assert codigos[:5] == [200] * 5
    assert codigos[5:] == [429] * 3
    assert say(client, "hola")[1]["lines"]  # sigue siendo una respuesta de chat válida


def test_limite_de_intentos_al_identificarse_frena_la_enumeracion_de_telefonos(client, monkeypatch):
    monkeypatch.setattr(chatbot, "auth_limiter", chatbot.RateLimiter(3, 600))
    client.post("/api/start")
    say(client, "5")  # identificarme
    estados = []
    for i in range(6):
        res, p = say(client, f"55000000{i:02d}")  # teléfono
        estados.append(res.status_code)
        if p["node"] == "identificarme_pin":
            say(client, "0000")
            say(client, "2")  # intentar de nuevo
    assert estados[0] == 200 and 429 in estados


def test_ratelimiter_ventana_deslizante():
    t = [0.0]
    rl = chatbot.RateLimiter(2, 10, clock=lambda: t[0])
    assert rl.hit("a") and rl.hit("a") and not rl.hit("a")
    assert rl.hit("b")
    t[0] = 11
    assert rl.hit("a")


def test_nodos_dinamicos_tapan_al_arbol_estatico():
    """respuestas.json no define estos nodos: los atiende commerce.py
    (si alguien los vuelve a agregar al JSON, nunca se mostrarían)."""
    import commerce

    for nodo in ("carrito", "realizar_compra", "mi_cuenta", "identificarme"):
        assert nodo not in chatbot.NODES
        assert commerce.render(nodo, {"cliente_id": None, "data": {}}) is not None


def test_aviso_a_bolsillo_manda_el_total_real_y_no_rompe_el_checkout(client, monkeypatch, caplog):
    import json as _json

    import commerce

    enviados = []

    def falso_urlopen(req, timeout=None):
        enviados.append((_json.loads(req.data), dict(req.header_items())))
        raise OSError("sin red")

    monkeypatch.setattr(commerce, "BOLSILLO_SYNC_URL", "http://bolsillo.test/api/income")
    monkeypatch.setattr(commerce, "BOLSILLO_SYNC_KEY", "k-secreta")
    monkeypatch.setattr(commerce.urllib.request, "urlopen", falso_urlopen)
    registrar(client)
    for m in ("*", "1", "1", "1", "3", "2", "comprar"):
        say(client, m)
    with caplog.at_level("WARNING"):
        _, p = say(client, "1")
    assert p["node"] == "pedido_confirmado"
    assert enviados[0][0]["amount"] == 80
    assert "k-secreta" not in caplog.text
    assert db.historial_pedidos(1)[0]["total_mxn"] == 80


def test_salir_cierra_la_sesion_del_cliente(client):
    registrar(client)
    say(client, "*")
    _, p = say(client, "0")  # Salir
    assert p["node"] == "salir"
    with client.session_transaction() as s:
        assert "cliente_id" not in s


def test_registro_rechaza_correo_y_usuario_invalidos(client):
    client.post("/api/start")
    say(client, "1")
    say(client, "Ana")
    for malo in ("no-es-correo", "a@b", "a b@c.com", "a@@b.com"):
        _, p = say(client, malo)
        assert p["node"] == "registro_nombre" and "correo no parece válido" in p["lines"][0]
    _, p = say(client, "ana@x.mx")
    assert p["node"] == "registro_correo"
    for malo in ("ab", "con espacio", "x" * 40):
        _, p = say(client, malo)
        assert p["node"] == "registro_correo" and "usuario debe tener" in p["lines"][0]
    _, p = say(client, "ana_01")
    assert p["node"] == "registro_usuario"


def test_actualizar_informacion_valida_correo_y_usuario(client):
    registrar(client)
    say(client, "*")
    for m in ("4", "3", "5", "2"):  # Inicio > Ayuda > Buscar info > Actualizar
        say(client, m)
    say(client, PIN)  # reconfirma el PIN actual
    say(client, "Ana")
    _, p = say(client, "malcorreo")
    assert "correo no parece válido" in p["lines"][0]
    say(client, "ana2@x.mx")
    _, p = say(client, "a b")
    assert "usuario debe tener" in p["lines"][0]
