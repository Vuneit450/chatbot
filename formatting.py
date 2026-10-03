"""Utilidades de formato compartidas entre el árbol estático de
respuestas.json (chatbot.py) y los nodos dinámicos de comercio (commerce.py)."""

import re

EMOJI_DIGITS = {str(d): f"{d}\N{VARIATION SELECTOR-16}\N{COMBINING ENCLOSING KEYCAP}" for d in range(10)}
EMOJI_DIGITS["*"] = "*\N{VARIATION SELECTOR-16}\N{COMBINING ENCLOSING KEYCAP}"


def money(amount):
    return f"${amount:,.0f} MXN"


def clean_phone(raw):
    """Deja solo dígitos (quita espacios, guiones, +52, paréntesis...) para
    que el mismo teléfono escrito de formas distintas identifique siempre
    al mismo cliente, en vez de tratarse como números distintos."""
    return re.sub(r"\D", "", raw or "")


def numbered_options(n, extra=()):
    """Botones 1️⃣..n️⃣ más los que se pasen en `extra` (p.ej. "0")."""
    options = [{"value": str(i), "label": EMOJI_DIGITS[str(i)]} for i in range(1, n + 1)]
    options += [{"value": v, "label": EMOJI_DIGITS.get(v, v)} for v in extra]
    return options
