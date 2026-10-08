"""Limitador de peticiones en memoria (ventana deslizante).

Suficiente para el despliegue actual (un solo proceso gunicorn en Render
free): frena a alguien que prueba teléfonos al azar contra "Ya tengo
cuenta" o que inunda el bot. Si algún día hay varios procesos/instancias,
el contador sería por proceso y habría que moverlo a Redis/Turso."""

import threading
import time
from collections import deque

MAX_KEYS = 10000  # tope de memoria: evita que IPs únicas llenen el diccionario


class RateLimiter:
    def __init__(self, limit, window_seconds, clock=time.monotonic):
        self.limit = limit
        self.window = window_seconds
        self._clock = clock
        self._hits = {}
        self._lock = threading.Lock()

    def hit(self, key):
        """Registra un intento de `key`. True si está dentro del límite."""
        now = self._clock()
        with self._lock:
            if len(self._hits) >= MAX_KEYS and key not in self._hits:
                self._purge(now)
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] >= self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            return True

    def _purge(self, now):
        for k in [k for k, q in self._hits.items() if not q or now - q[-1] >= self.window]:
            del self._hits[k]

    def reset(self):
        with self._lock:
            self._hits.clear()
