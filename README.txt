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

Lint y formato (ruff, configurado en pyproject.toml):
  pip install ruff
  ruff check .          # lint
  ruff format --check . # formato (ruff format . para aplicarlo)

CI: .github/workflows/ci.yml corre ruff, pytest y Playwright en cada push/PR.
Solo prueba; no despliega (Render despliega por su cuenta).

Límites por IP (variables opcionales): RATE_LIMIT_MESSAGES (120/min) y
RATE_LIMIT_AUTH (10 intentos de identificación / 10 min).

Identificación de clientes (teléfono + PIN):
  - Registro: el bot pide elegir un PIN de 4 a 6 dígitos y confirmarlo. Se
    guarda solo el hash (werkzeug/scrypt) en clientes.pin_hash; nunca en
    claro, ni en logs, ni en la cookie de sesión (el PIN a medio confirmar
    viaja como HMAC con SECRET_KEY, no recuperable por fuerza bruta).
  - Identificarse ("Ya tengo cuenta"): teléfono + PIN. El mensaje de falla
    es el mismo para teléfono inexistente, PIN incorrecto y cuenta
    bloqueada, para no permitir enumerar teléfonos.
  - 5 PIN incorrectos seguidos bloquean la cuenta 15 minutos (columnas
    intentos_pin y bloqueado_hasta); se suma al límite por IP.
  - "Actualizar información" y "Cambiar mi PIN" (Mi cuenta) piden el PIN
    actual. "Salir" cierra la sesión del cliente.
  - Las sesiones anteriores a los PIN (cookie con solo teléfono) dejan de
    identificar: hay que volver a identificarse.
  - El PIN se oculta en el chat: la caja de texto pasa a tipo password y
    el historial (pantalla y sessionStorage) muestra ••••.
  - Migración: las columnas nuevas se agregan solas al iniciar (PRAGMA
    table_info; funciona igual en SQLite local y en Turso).
  - Clientes existentes sin PIN: en su próxima identificación el bot les
    pide crear uno antes de mostrar ningún dato.
    RIESGO RESIDUAL: quien conozca el teléfono de un cliente antiguo y
    llegue antes que él puede fijarle su propio PIN (y quedar dentro de la
    cuenta). Mitigaciones: crear el PIN no revela datos hasta terminar,
    límite de intentos por IP, y conviene avisar a los clientes antiguos
    para que lo creen pronto. Se cierra por completo solo con un segundo
    canal (OTP por WhatsApp/SMS), que queda fuera de este alcance.
  - Si alguien olvida su PIN no hay recuperación automática (requiere OTP
    u operador): hoy se resuelve a mano en la base de datos.

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
