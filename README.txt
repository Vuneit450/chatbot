Bot Oreo — chatbot de suscripciones
====================================

App Flask con una interfaz de chat propia (HTML/CSS/JS, sin frameworks)
que conduce la conversación definida en respuestas.json como una
máquina de estados por sesión (cookie firmada de Flask).

Ejecutar en local:
  python -m venv .venv && . .venv/bin/activate
  pip install -r requirements.txt
  python chatbot.py
  Abrir http://127.0.0.1:5000

Pruebas end-to-end (Playwright):
  npm install
  npm test

Estructura:
  chatbot.py        Motor de conversación (Flask + máquina de estados)
  respuestas.json    Árbol de nodos del menú (texto, opciones, captura)
  templates/         HTML de la interfaz de chat
  static/css, js      Estilos e interacción del chat
  tests/              Pruebas Playwright
