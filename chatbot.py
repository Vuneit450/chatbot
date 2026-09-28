import json
import os
import secrets
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session

BASE_DIR = Path(__file__).resolve().parent
START_NODE = "menu_principal"
# Los datos capturados viven en la cookie de sesión (firmada, ~4KB de
# límite del navegador): un valor sin tope podría desbordarla y tirar la
# sesión entera en silencio.
MAX_INPUT_LEN = 200

# Comandos reconocidos en cualquier punto de la conversación (excepto mientras
# se está capturando texto libre, p.ej. el registro), para que el usuario
# nunca quede atorado en un nodo sin salida como "salir".
GLOBAL_COMMANDS = {
    "activar": "activar",
    "menu": "menu_principal",
}

with open(BASE_DIR / "respuestas.json", encoding="utf-8") as f:
    NODES = json.load(f)


class SafeDict(dict):
    def __missing__(self, key):
        return ""


def format_lines(lines, data):
    safe = SafeDict(data)
    return [line.format_map(safe) for line in lines]


EMOJI_DIGITS = {str(d): f"{d}\N{VARIATION SELECTOR-16}\N{COMBINING ENCLOSING KEYCAP}" for d in range(10)}
EMOJI_DIGITS["*"] = "*\N{VARIATION SELECTOR-16}\N{COMBINING ENCLOSING KEYCAP}"


def node_payload(node_id, data):
    node = NODES.get(node_id) or NODES[START_NODE]
    opciones = node.get("opciones", {})
    is_capture = bool(node.get("captura"))
    options = [
        {"value": key, "label": EMOJI_DIGITS.get(key, key)}
        for key in opciones
        # El comodín "*" solo se muestra como botón cuando de verdad
        # representa "volver al menú" y no un campo de texto libre.
        if key != "*" or not is_capture
    ]
    return {
        "node": node_id,
        "lines": format_lines(node["texto"], data),
        "options": options,
        "freeText": is_capture,
    }


def advance(current_node, raw_message):
    """Aplica un mensaje del usuario al estado actual y regresa
    (siguiente_nodo, valores_a_guardar)."""
    node = NODES.get(current_node) or NODES[START_NODE]
    options = node.get("opciones", {})
    capture_key = node.get("captura")
    message = raw_message.strip()

    if not capture_key:
        lowered = message.lower()
        if lowered in GLOBAL_COMMANDS:
            return GLOBAL_COMMANDS[lowered], {}

    if message in options:
        return options[message], {}

    if "*" in options:
        captured = {capture_key: message[:MAX_INPUT_LEN]} if capture_key else {}
        return options["*"], captured

    # Nodo sin salida (p.ej. "salir") y el mensaje no matchea ningún comando
    # global: nos quedamos donde estamos en vez de tronar.
    return current_node, {}


app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/start", methods=["POST"])
def api_start():
    session["node"] = START_NODE
    session["data"] = {}
    return jsonify(node_payload(START_NODE, session["data"]))


@app.route("/api/state", methods=["GET"])
def api_state():
    """Recupera dónde se quedó la conversación (p.ej. tras recargar la
    página) sin reiniciarla, arrancándola si todavía no existía."""
    if "node" not in session:
        session["node"] = START_NODE
        session["data"] = {}
    return jsonify(node_payload(session["node"], session["data"]))


@app.route("/api/message", methods=["POST"])
def api_message():
    body = request.get_json(silent=True) or {}
    message = str(body.get("message", ""))

    if "node" not in session:
        session["node"] = START_NODE
        session["data"] = {}

    if not message.strip():
        return jsonify(node_payload(session["node"], session["data"]))

    next_node, captured = advance(session["node"], message)
    data = dict(session.get("data", {}))
    data.update(captured)
    session["node"] = next_node
    session["data"] = data
    return jsonify(node_payload(next_node, data))


if __name__ == "__main__":
    # El debugger interactivo de Werkzeug permite ejecutar código arbitrario
    # desde el navegador: solo se activa a propósito con FLASK_DEBUG=1.
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")
