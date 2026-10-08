"""Pruebas unitarias/integración (pytest) de la lógica crítica: dinero,
datos de clientes y controles de acceso. Corren contra una base SQLite
temporal; nunca tocan bot_oreo.db ni Turso."""

import os
import sys
import tempfile
from pathlib import Path

# Antes de importar la app: sin Turso, sin Bolsillo, y con una base de
# datos desechable para el init_db() que corre al importar chatbot.
os.environ.pop("TURSO_DATABASE_URL", None)
os.environ.pop("TURSO_AUTH_TOKEN", None)
os.environ.pop("BOLSILLO_SYNC_URL", None)
os.environ.pop("BOLSILLO_SYNC_KEY", None)
os.environ.pop("RENDER", None)
os.environ["LOCAL_DB_PATH"] = str(Path(tempfile.mkdtemp(prefix="oreo-import-")) / "import.db")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

import chatbot
import db


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "LOCAL_DB_PATH", str(tmp_path / "test.db"))
    db.init_db()
    getattr(chatbot, "reset_rate_limits", lambda: None)()
    yield


@pytest.fixture
def client():
    chatbot.app.config["TESTING"] = True
    return chatbot.app.test_client()


def say(client, message):
    res = client.post("/api/message", json={"message": message})
    return res, res.get_json()


def registrar(client, nombre="Ana", correo="ana@x.mx", usuario="ana", telefono="5512345678"):
    client.post("/api/start")
    say(client, "1")  # Registro
    for valor in (nombre, correo, usuario, telefono):
        say(client, valor)
    return telefono
