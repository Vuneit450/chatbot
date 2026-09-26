# Bolsillo

App personal de finanzas y bóveda de enlaces/imágenes. Vive por completo en tu teléfono: no tiene servidor, no tiene cuentas, no sube nada a internet. Todo se guarda con IndexedDB en el propio navegador.

## Publicar en GitHub Pages

1. Sube el contenido de esta carpeta (`bolsillo/`) a un repositorio de GitHub, o publica el repo completo si `bolsillo/` vive dentro de uno más grande.
2. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Elige la rama (por ejemplo `main`) y, si `bolsillo/` es una subcarpeta del repo, selecciónala como carpeta de publicación (o publica desde la raíz si el repo es exclusivamente esta app).
4. Espera un par de minutos y abre la URL que GitHub te da, algo como `https://TU-USUARIO.github.io/TU-REPO/` (o `https://TU-USUARIO.github.io/TU-REPO/bolsillo/` si quedó en una subcarpeta).
5. No hace falta ningún paso de build: es HTML/CSS/JS puro, GitHub Pages lo sirve tal cual.

## Instalar en tu teléfono

**Android (Chrome):**
1. Abre la URL de tu Bolsillo.
2. Toca el menú (⋮) → **Agregar a pantalla de inicio** (o espera a que Chrome te lo sugiera solo).
3. Confirma. Se instala como app normal, con su propio ícono.

**iPhone (Safari):**
1. Abre la URL de tu Bolsillo en Safari (tiene que ser Safari, no Chrome, para que funcione la instalación).
2. Toca el botón de compartir (el cuadrito con la flecha hacia arriba).
3. Elige **Agregar a pantalla de inicio**.
4. Confirma. Queda instalada con el ícono de Bolsillo y abre a pantalla completa, sin barra de navegador.

Una vez instalada, la app funciona sin conexión: la primera visita descarga y guarda los archivos con un service worker, así que después puedes abrirla en modo avión.

## Tus datos

- Todo (movimientos, presupuestos, metas, enlaces, imágenes) se guarda en IndexedDB, dentro de tu propio teléfono o navegador. Nada se envía a ningún servidor.
- Si borras los datos del sitio en el navegador (o desinstalas la app), se pierde todo lo que no hayas respaldado.
- En **Ajustes → Respaldo** puedes exportar una copia en JSON (incluye tus imágenes) y guardarla donde quieras (correo, nube, etc.), y volver a importarla cuando la necesites.

## Desarrollo local

Requiere Node.js.

```bash
npm install       # instala playwright y http-server (sólo para desarrollo/pruebas)
npm run serve     # sirve la app en http://127.0.0.1:8080
npm test          # corre la suite de pruebas Playwright (Chromium, 390×844)
```

No hay paso de compilación: `index.html`, `css/` y `js/` se sirven directo tal como están.

## Estructura

```
index.html          estructura de la app
css/app.css          sistema de diseño
js/                   db.js, format.js, state.js, charts.js, backup.js, app.js y js/views/*.js
manifest.json         metadatos de instalación (PWA)
sw.js                 service worker (caché de assets propios)
icons/                íconos de la app
tests/                pruebas Playwright
PROGRESS.md            bitácora de construcción
AGENTS.md               especificación original del proyecto
```
