"""Nodos de conversación dinámicos: personalización, catálogo con carrito
real, checkout e historial. Todo lo que respuestas.json no puede expresar
por sí solo porque depende de quién eres y qué has comprado.

chatbot.py sigue siendo el motor genérico basado en el árbol estático de
respuestas.json; este módulo se consulta primero para cada nodo, y solo
cuando no aplica (regresa None) se usa el árbol estático como respaldo.
"""

import db
from formatting import EMOJI_DIGITS, money, numbered_options

CATEGORY_NODES = {
    "opciones_spotify": "Spotify",
    "opciones_youtube_music": "YouTube Music",
    "opciones_amazon_music": "Amazon Music",
    "opciones_crunchyroll": "Crunchyroll",
    "opciones_amazon_prime_video": "Amazon Prime Video",
    "opciones_netflix": "Netflix",
}

DYNAMIC_NODE_IDS = {
    "menu_principal",
    "carrito",
    "quitar_productos",
    "realizar_compra",
    "identificarme",
    "identificarme_no_encontrado",
    "mi_cuenta",
    "producto_agregado",
    "pedido_confirmado",
    *CATEGORY_NODES,
}


def is_dynamic(node_id):
    return node_id in DYNAMIC_NODE_IDS


def _payload(node_id, lines, options, free_text=False):
    return {"node": node_id, "lines": lines, "options": options, "freeText": free_text}


def _necesita_cuenta(node_id):
    return _payload(
        node_id,
        ["Para eso primero necesito identificarte. 🙂", "1️⃣ Registrarme", "2️⃣ Ya tengo cuenta"],
        numbered_options(2),
    )


# ---- render ---------------------------------------------------------------

def render(node_id, ctx):
    cliente = db.find_cliente_by_id(ctx.get("cliente_id"))

    if node_id == "menu_principal":
        return _render_menu_principal(cliente) if cliente else None
    if node_id in CATEGORY_NODES:
        return _render_categoria(node_id, CATEGORY_NODES[node_id])
    if node_id in ("carrito", "quitar_productos"):
        return _render_carrito(node_id, cliente)
    if node_id == "realizar_compra":
        return _render_realizar_compra(cliente)
    if node_id == "identificarme":
        return _payload(node_id, ["Escribe el teléfono con el que te registraste:"], [], free_text=True)
    if node_id == "identificarme_no_encontrado":
        return _payload(
            node_id,
            ["No encontramos ninguna cuenta con ese teléfono. 🤔", "1️⃣ Registrarme", "2️⃣ Intentar de nuevo", "0️⃣ Menú principal"],
            numbered_options(2, extra=["0"]),
        )
    if node_id == "mi_cuenta":
        return _render_mi_cuenta(cliente)
    if node_id == "producto_agregado":
        return _render_producto_agregado(ctx.get("data", {}))
    if node_id == "pedido_confirmado":
        return _render_pedido_confirmado(cliente, ctx.get("data", {}))
    return None


def _render_menu_principal(cliente):
    carrito = db.ver_carrito(cliente["id"])
    carrito_label = f"({len(carrito)})" if carrito else "(vacío)"
    lines = [
        f"👋 ¡Qué bueno verte de nuevo, {cliente['nombre']}! 🍪",
        "¿Qué te gustaría hacer hoy?",
        "1️⃣ Ver catálogo",
        f"2️⃣ Mi carrito {carrito_label}",
        "3️⃣ Mi cuenta e historial",
        "0️⃣ Salir",
    ]
    return _payload("menu_principal", lines, numbered_options(3, extra=["0"]))


def _render_categoria(node_id, servicio):
    productos = db.productos_por_servicio(servicio)
    emoji = "🎵" if productos and productos[0]["categoria"] == "musica" else "🎬"
    lines = [f"{emoji} Planes de {servicio}:"]
    lines += [f"{EMOJI_DIGITS[str(i)]} {p['plan']} — {money(p['precio_mxn'])}" for i, p in enumerate(productos, 1)]
    lines += ["0️⃣ Volver al menú anterior", "*️⃣ Volver al menú principal"]
    return _payload(node_id, lines, numbered_options(len(productos), extra=["0", "*"]))


def _render_carrito(node_id, cliente):
    if not cliente:
        return _necesita_cuenta(node_id)
    items = db.ver_carrito(cliente["id"])
    if not items:
        lines = ["🛒 Tu carrito está vacío.", "1️⃣ Ver catálogo", "0️⃣ Volver al menú principal"]
        return _payload(node_id, lines, numbered_options(1, extra=["0"]))
    lines = ["🛒 Tu carrito:"]
    lines += [f"{EMOJI_DIGITS[str(i)]} {it['servicio']} — {it['plan']} ({money(it['precio_mxn'])})" for i, it in enumerate(items, 1)]
    total = sum(it["precio_mxn"] for it in items)
    lines += [
        f"Total: {money(total)}",
        "✅ Escribe \"comprar\" para confirmar tu pedido",
        "❌ Toca el número de un producto para quitarlo del carrito",
        "0️⃣ Volver al menú principal",
    ]
    options = numbered_options(len(items)) + [{"value": "comprar", "label": "✅ Comprar"}, {"value": "0", "label": EMOJI_DIGITS["0"]}]
    return _payload(node_id, lines, options)


def _render_realizar_compra(cliente):
    if not cliente:
        return _necesita_cuenta("realizar_compra")
    items = db.ver_carrito(cliente["id"])
    if not items:
        lines = ["Tu carrito está vacío, no hay nada que comprar todavía.", "1️⃣ Ver catálogo", "0️⃣ Menú principal"]
        return _payload("realizar_compra", lines, numbered_options(1, extra=["0"]))
    total = sum(it["precio_mxn"] for it in items)
    lines = ["🧾 Vas a confirmar este pedido:"]
    lines += [f"• {it['servicio']} {it['plan']} — {money(it['precio_mxn'])}" for it in items]
    lines += [f"Total: {money(total)}", "1️⃣ Confirmar compra", "0️⃣ Cancelar"]
    return _payload("realizar_compra", lines, numbered_options(1, extra=["0"]))


def _render_mi_cuenta(cliente):
    if not cliente:
        return _necesita_cuenta("mi_cuenta")
    historial = db.historial_pedidos(cliente["id"], limit=5)
    lines = [
        f"👤 {cliente['nombre']}",
        f"Usuario: {cliente['usuario']}  ·  Correo: {cliente['correo']}",
        f"Teléfono: {cliente['telefono']}",
        "",
    ]
    if historial:
        lines.append("🧾 Tus últimos pedidos:")
        for p in historial:
            items_txt = ", ".join(f"{it['servicio']} {it['plan']}" for it in p["items"])
            fecha = p["creado_en"][:10]
            lines.append(f"#{p['id']} · {fecha} · {money(p['total_mxn'])} · {items_txt}")
        lines += ["1️⃣ Repetir mi último pedido", "0️⃣ Volver al menú principal"]
    else:
        lines += ["Todavía no tienes pedidos.", "1️⃣ Ver catálogo", "0️⃣ Volver al menú principal"]
    return _payload("mi_cuenta", lines, numbered_options(1, extra=["0"]))


def _render_producto_agregado(data):
    p = data.get("_ultimo_producto") or {}
    lines = [
        f"✅ Agregado a tu carrito: {p.get('servicio', '')} — {p.get('plan', '')} ({money(p.get('precio_mxn', 0))})",
        "¿Qué quieres hacer ahora?",
        "1️⃣ Seguir viendo el catálogo",
        "2️⃣ Ver mi carrito",
        "0️⃣ Volver al menú principal",
    ]
    return _payload("producto_agregado", lines, numbered_options(2, extra=["0"]))


def _render_pedido_confirmado(cliente, data):
    pedido = data.get("_ultimo_pedido") or {}
    lines = [f"🎉 ¡Pedido #{pedido.get('pedido_id', '?')} confirmado! Total: {money(pedido.get('total_mxn', 0))}", "Te compartiremos los datos de acceso en breve."]
    sugerido = db.sugerencia_producto(cliente["id"]) if cliente else None
    if sugerido:
        lines += [
            f"💡 Ya que te gustó eso, ¿qué tal {sugerido['servicio']} ({sugerido['plan']}) por {money(sugerido['precio_mxn'])}?",
            "1️⃣ Sí, agrégalo a mi carrito",
            "0️⃣ No, volver al menú principal",
        ]
        return _payload("pedido_confirmado", lines, numbered_options(1, extra=["0"]))
    lines.append("0️⃣ Volver al menú principal")
    return _payload("pedido_confirmado", lines, numbered_options(0, extra=["0"]))


# ---- advance ----------------------------------------------------------------

def advance(node_id, message, ctx):
    cliente_id = ctx.get("cliente_id")
    message = message.strip()

    if node_id == "menu_principal" and cliente_id:
        return _advance_menu_principal(message)
    if node_id in CATEGORY_NODES:
        return _advance_categoria(node_id, CATEGORY_NODES[node_id], message, cliente_id)
    if node_id in ("carrito", "quitar_productos"):
        return _advance_carrito(message, cliente_id)
    if node_id == "realizar_compra":
        return _advance_realizar_compra(message, cliente_id)
    if node_id == "identificarme":
        return _advance_identificarme(message)
    if node_id == "identificarme_no_encontrado":
        mapping = {"1": "registro", "2": "identificarme"}
        return mapping.get(message, "menu_principal"), {}
    if node_id == "mi_cuenta":
        return _advance_mi_cuenta(message, cliente_id)
    if node_id == "producto_agregado":
        mapping = {"1": ctx.get("data", {}).get("_ultima_categoria_node", "catalogo_productos"), "2": "carrito"}
        return mapping.get(message, "menu_principal"), {}
    if node_id == "pedido_confirmado":
        return _advance_pedido_confirmado(message, cliente_id)
    return None


def _advance_menu_principal(message):
    mapping = {"1": "catalogo_productos", "2": "carrito", "3": "mi_cuenta", "0": "salir"}
    return mapping.get(message, "menu_principal"), {}


def _advance_categoria(node_id, servicio, message, cliente_id):
    productos = db.productos_por_servicio(servicio)
    if message.isdigit() and 1 <= int(message) <= len(productos):
        producto = productos[int(message) - 1]
        if not cliente_id:
            return "carrito", {}  # dispara el mensaje "necesita cuenta"
        db.agregar_al_carrito(cliente_id, producto["id"])
        return "producto_agregado", {"data": {"_ultimo_producto": producto, "_ultima_categoria_node": node_id}}
    return None  # deja que respuestas.json resuelva "0"/"*"


def _advance_carrito(message, cliente_id):
    if not cliente_id:
        mapping = {"1": "registro", "2": "identificarme"}
        return mapping.get(message, "carrito"), {}
    if message == "0":
        return "menu_principal", {}
    if message.lower() == "comprar":
        return "realizar_compra", {}
    items = db.ver_carrito(cliente_id)
    if message.isdigit() and 1 <= int(message) <= len(items):
        db.quitar_del_carrito(cliente_id, items[int(message) - 1]["item_id"])
    return "carrito", {}


def _advance_realizar_compra(message, cliente_id):
    if not cliente_id:
        mapping = {"1": "registro", "2": "identificarme"}
        return mapping.get(message, "realizar_compra"), {}
    if message == "1":
        pedido = db.confirmar_pedido(cliente_id)
        if pedido:
            return "pedido_confirmado", {"data": {"_ultimo_pedido": pedido}}
        return "catalogo_productos", {}
    if message == "0":
        return "carrito", {}
    return "realizar_compra", {}


def _advance_identificarme(message):
    cliente = db.find_cliente_by_telefono(message.strip())
    if cliente:
        return "menu_principal", {"cliente_id": cliente["id"]}
    return "identificarme_no_encontrado", {}


def _advance_mi_cuenta(message, cliente_id):
    if message == "1":
        historial = db.historial_pedidos(cliente_id, limit=1)
        if historial:
            for item in historial[0]["items"]:
                db.agregar_al_carrito(cliente_id, item["producto_id"])
            return "carrito", {}
        return "catalogo_productos", {}
    return "menu_principal", {}


def _advance_pedido_confirmado(message, cliente_id):
    if message == "1":
        sugerido = db.sugerencia_producto(cliente_id) if cliente_id else None
        if sugerido:
            db.agregar_al_carrito(cliente_id, sugerido["id"])
        return "carrito", {}
    return "menu_principal", {}
