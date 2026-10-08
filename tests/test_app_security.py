"""Autenticación/autorización, entradas hostiles, cabeceras y límites."""

import chatbot
import db
from conftest import registrar, say


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
        res, p = say(client, m)
    token = next(l for l in p["lines"] if "/recibo/" in l).split("(/recibo/")[1].rstrip(")")
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
        res, p = say(client, f"55000000{i:02d}")
        estados.append(res.status_code)
        if p["node"] == "identificarme_no_encontrado":
            say(client, "2")  # intentar de nuevo
    assert estados[:3] == [200, 200, 200]
    assert estados[3:] == [429, 429, 429]


def test_identificarse_con_telefono_ajeno_requiere_conocerlo_y_no_filtra_datos(client):
    db.upsert_cliente("Víctima", "v@x.mx", "vic", "5599999999")
    client.post("/api/start")
    say(client, "5")
    _, p = say(client, "5500000000")
    assert p["node"] == "identificarme_no_encontrado"
    assert "Víctima" not in " ".join(p["lines"])


def test_ratelimiter_ventana_deslizante():
    t = [0.0]
    rl = chatbot.RateLimiter(2, 10, clock=lambda: t[0])
    assert rl.hit("a") and rl.hit("a") and not rl.hit("a")
    assert rl.hit("b")
    t[0] = 11
    assert rl.hit("a")
