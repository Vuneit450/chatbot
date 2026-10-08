Bot Oreo — chatbot de suscripciones
====================================

App Flask con una interfaz de chat propia (HTML/CSS/JS, sin frameworks).
La conversación informativa vive en respuestas.json (menús, ayuda,
horarios, etc.); todo lo que depende de quién eres y qué has comprado
(carrito, historial, recomendaciones) lo maneja commerce.py contra una
base de datos real (Turso/libSQL), así que el bot recuerda al cliente
entre visitas y dispositivos, no solo dentro de una sesión de navegador.

Ejecutar en local:
  python -m venv .venv && . .venv/bin/activate
  pip install -r requirements.txt
  python chatbot.py
  Abrir http://127.0.0.1:5000

  Sin variables de entorno usa un archivo SQLite local (bot_oreo.db,
  ignorado por git). En producción, define TURSO_DATABASE_URL y
  TURSO_AUTH_TOKEN (ver render.yaml) para usar Turso.

Pruebas unitarias/integración (pytest, base SQLite temporal):
  pip install -r requirements-dev.txt
  python -m pytest

Límites por IP (variables opcionales): RATE_LIMIT_MESSAGES (120/min) y
RATE_LIMIT_AUTH (10 intentos de identificación / 10 min).

Pruebas end-to-end (Playwright):
  npm install
  npm test

Estructura:
  chatbot.py          Rutas Flask + motor genérico de respuestas.json
  commerce.py          Nodos dinámicos: personalización, carrito, checkout
  ratelimit.py          Limitador de peticiones por IP en memoria
  db.py                 Capa de datos (clientes, catálogo, carrito, pedidos)
  formatting.py         Utilidades de formato compartidas
  respuestas.json       Árbol de nodos del menú (texto, opciones, captura)
  templates/            HTML de la interfaz de chat
  static/css, js         Estilos e interacción del chat
  tests/                 Pruebas Playwright
