# Progreso — Bolsillo

## Datos
- [x] IndexedDB con stores `kv` y `blobs`; el estado sobrevive a recargas.
- [x] Migración: un estado viejo sin campos nuevos se completa con los valores por defecto.
- [x] Parser de montos acepta los tres formatos; fechas en hora local.

## Movimientos y finanzas
- [x] Crear, editar y eliminar gasto, ingreso y transferencia.
- [x] Saldos por cuenta y saldo total correctos (prueba con números conocidos).
- [x] Inicio: dona, barras de 6 meses, cuentas, recientes, alertas y estados vacíos.
- [x] Movimientos: agrupado por día, buscador sin perder foco, filtros, CSV.

## Presupuesto
- [x] Sobres con los tres estados de color y el % de alerta configurable.
- [x] Base cero ("Por asignar"), gasto diario disponible y proyección de cierre.
- [x] Sugerencia por promedio de 3 meses.
- [x] Metas con aporte mensual necesario, aportar/retirar y registro opcional como gasto.
- [x] 50/30/20 con meta vs real.
- [x] Fijos: se generan los pendientes al abrir, el día 31 no se corre, pausar/editar/eliminar.

## Bóveda
- [x] Guardar, editar, buscar, etiquetar, marcar favorito y eliminar enlaces.
- [x] Agregar varias imágenes, comprimir, ver, compartir/descargar y eliminar.
- [x] Las imágenes siguen ahí después de recargar y sin red.

## Ajustes y respaldo
- [x] Moneda, tema y % de alerta se aplican al instante y se guardan.
- [x] CRUD de cuentas y categorías con selector de íconos y protección si están en uso.
- [x] Exportar e importar JSON con imágenes (ida y vuelta sin pérdida).
- [x] Datos de ejemplo y borrar todo.

## PWA y publicación
- [x] `manifest.json` válido y service worker que cachea los assets; la app abre sin red.
- [x] Instalable en Android (Chrome) y en iPhone (Safari → Agregar a inicio, con `apple-touch-icon`). *(manifest + apple-touch-icon verificados; instalación real en dispositivo no se pudo probar dentro de este entorno headless)*
- [x] Todas las rutas relativas; funciona servida desde una subcarpeta (`/bolsillo/`).
- [x] `README.md` con pasos de GitHub Pages e instalación en el teléfono.

## Diseño y calidad
- [x] Sistema de diseño de la sección 6 aplicado a toda la app, incluidos todos los botones.
- [x] Claro y oscuro revisados con capturas; sin scroll horizontal a 360 px.
- [x] Foco visible, `aria-label` en botones de ícono, movimiento reducido respetado.
- [x] Cero errores en consola; suite de pruebas en verde dos veces seguidas.

## Bitácora de ciclos

**Ciclo 1** — Núcleo de datos (`db.js`, `format.js`, `state.js`), sistema de diseño (`css/app.css`), núcleo de la app y hoja de registrar movimiento (`app.js`), y las cinco vistas (Inicio, Movimientos, Presupuesto, Bóveda, Ajustes) más PWA (`manifest.json`, `sw.js`). Se construyó todo el alcance en un solo ciclo extendido dado que las piezas están fuertemente interrelacionadas (el modelo de datos y la hoja de movimiento son compartidos por las cinco vistas).

**Ciclo 2** — Pruebas y verificación adversarial. Se escribieron 25 pruebas Playwright (Chromium, 390×844 y 360px) cubriendo: CRUD de movimientos, saldos por cuenta y totales, buscador sin perder foco, presupuesto (sobres/metas/50-30-20/fijos), bóveda (enlaces e imágenes reales con compresión), ajustes (moneda/tema/alerta/CRUD protegido), respaldo JSON con imágenes en base64, migración de estado viejo, recurrentes con día 31, capturas claro/oscuro sin scroll horizontal, y funcionamiento sin red vía service worker.

Bugs encontrados y corregidos durante la verificación:
- Al cambiar de tipo o categoría dentro de la hoja de "Fijo" o de "Categoría" (editando uno existente), el borrador reconstruido perdía el `id` original, lo que causaba una excepción al guardar (`editing` se detectaba por verdad del objeto, no por `id` presente). Corregido en `presupuesto.js` y `ajustes.js` preservando el `id` a través de los manejadores `fijo-type`/`fijo-cat`/`cat-set-type`/`cat-set-group`.
- Pruebas con `reload()` inmediatamente después de una acción que guarda en IndexedDB eran intermitentes bajo carga de CPU (el guardado es asíncrono y el clic de Playwright no espera a que termine el manejador). Se corrigió esperando una señal observable (el toast de confirmación o el propio valor guardado en IndexedDB) antes de recargar en cada prueba afectada.

Sin bugs abiertos conocidos al cierre. Suite completa (25 pruebas) corrida en verde 5 veces seguidas con concurrencia por defecto.

**WebKit**: el entorno de este contenedor sólo tiene el binario de Chromium preinstalado (no se pudo instalar WebKit sin acceso a la descarga de navegadores de Playwright), así que toda la suite corrió únicamente en Chromium a 390×844. El código no usa ninguna API exclusiva de Chromium, así que debería comportarse igual en WebKit/Safari, pero queda pendiente de verificación manual en un iPhone real o con WebKit instalado.
