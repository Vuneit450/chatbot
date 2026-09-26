# AGENTS.md — Loop de construcción de "Bolsillo"

Eres el agente que construye **Bolsillo**, una app personal de finanzas y bóveda de enlaces/imágenes. Trabajas en ciclos (loop) de **planear → construir → probar → verificar → corregir**, y **no te detienes hasta que toda la lista "Definición de terminado" esté en verde**. Cada ciclo termina con un commit.

---

## 1. Objetivo

Una PWA (app web instalable) que:

- Vive en este repositorio de GitHub y se publica con **GitHub Pages** (sin servidor, sin backend).
- Guarda **todos los datos localmente en el teléfono** (IndexedDB). Nada se sube a internet.
- Funciona **sin conexión** después de la primera visita (service worker).
- Se instala en el teléfono con "Agregar a pantalla de inicio" (Android e iPhone).
- Es intuitiva: cualquier acción principal se hace en máximo 3 toques.
- Todo el texto de la interfaz está en **español**.

## 2. Restricciones técnicas

- HTML + CSS + JavaScript puro (vanilla, ES2020+). **Sin frameworks, sin paso de build**, para que GitHub Pages lo sirva directo.
- Sin dependencias externas en tiempo de ejecución, salvo Google Fonts (con fuentes de respaldo del sistema). Gráficas hechas a mano con SVG.
- Rutas relativas (`./`) en todo, porque la app vive en `https://USUARIO.github.io/REPO/`.
- Almacenamiento: IndexedDB con dos stores: `kv` (estado JSON de la app) y `blobs` (imágenes). No usar localStorage para datos.
- Imágenes: comprimir al guardar (lado mayor ≤ 1600 px, JPEG calidad 0.85) con `createImageBitmap` + `canvas`, con fallback al archivo original si falla.
- Pedir almacenamiento persistente (`navigator.storage.persist()`) al guardar la primera imagen.
- Mobile-first, ancho máximo 560 px centrado en escritorio. Respetar `env(safe-area-inset-*)` y `viewport-fit=cover`.
- Accesible: foco visible, `aria-label` en botones de ícono, contraste AA, `prefers-reduced-motion` respetado.

## 3. Estructura de archivos

```
/
├── index.html          # estructura, estilos y lógica (o separar en css/ y js/ si supera ~1500 líneas)
├── css/app.css         # opcional
├── js/                 # opcional: db.js, state.js, views/*.js, charts.js, vault.js, backup.js
├── manifest.json       # nombre, íconos, theme_color #1D5B4B, display standalone, start_url "./"
├── sw.js               # cache-first de los assets propios; red para lo demás
├── icons/icon-192.png, icon-512.png, apple-touch-icon.png   # ya existen
├── tests/              # pruebas Playwright
├── package.json        # solo devDependencies para pruebas (playwright, http-server)
├── README.md           # cómo publicar e instalar
└── AGENTS.md           # este archivo
```

## 4. Modelo de datos

```js
state = {
  v: 1,
  settings: { currency: 'MXN', theme: 'auto'|'light'|'dark', alert: 80, expectedIncome: 0 },
  accounts:   [{ id, name, icon, initial }],
  categories: [{ id, name, icon, type: 'gasto'|'ingreso', group: 'necesidad'|'deseo'|'ahorro' }],
  tx:         [{ id, type: 'gasto'|'ingreso'|'transfer', amount, cat, acc, toAcc, date: 'YYYY-MM-DD', note, recId }],
  recurring:  [{ id, type, amount, cat, acc, toAcc, note, freq: 'semanal'|'quincenal'|'mensual'|'anual', next, day, active }],
  budgets:    { [categoryId]: limiteMensual },
  goals:      [{ id, name, icon, target, saved, deadline }],
  vault:      [{ id, kind: 'link'|'image', title, url, note, tags: [], imgKey, created, fav }]
}
```

- Fechas siempre en hora local (nunca `toISOString()` para fechas del usuario).
- Montos redondeados a 2 decimales. El parser acepta `1,234.50`, `1.234,50` y `1234,5`.
- Moneda por defecto según la región de `navigator.language` (MX→MXN, CO→COP, AR→ARS, CL→CLP, PE→PEN, ES→EUR, EC/SV/PA/US→USD, etc.). Formato con `Intl.NumberFormat` usando el locale de ese país.
- Saldo de cuenta = saldo inicial + ingresos − gastos − transferencias salientes + transferencias entrantes.
- Categorías por defecto con ícono (emoji):
  - Gasto: Comida 🍽️, Súper 🛒, Transporte 🚌, Vivienda 🏠, Servicios 💡, Salud 💊, Educación 📚, Mascotas 🐾 (necesidad); Ropa 👕, Ocio 🎬, Suscripciones 📺, Regalos 🎁, Viajes ✈️, Otros 📦 (deseo); Deudas 💳, Ahorro 🐖 (ahorro).
  - Ingreso: Sueldo 💼, Freelance 💻, Ventas 🏷️, Inversiones 📈, Regalos 🎀, Otros ingresos ➕.
- Cuentas por defecto: Efectivo 💵, Banco 🏦, Tarjeta 💳.

## 5. Funciones (inspiradas en Monefy, YNAB, Goodbudget, Wallet, Spendee y Money Manager)

### 5.1 Inicio (estado financiero)
- Selector de mes (‹ Septiembre 2026 ›), compartido con Movimientos y Presupuesto.
- Bloque principal: **saldo total** grande; debajo ingresos, gastos y tasa de ahorro del mes.
- Alertas de presupuesto (categorías ≥ % de alerta o excedidas).
- Cuentas en carrusel horizontal con ícono y saldo (negativo en rojo).
- Dona SVG de gastos por categoría (top 5 + "Otras") con leyenda y porcentajes.
- Barras SVG de ingresos vs gastos de los últimos 6 meses.
- Últimos 5 movimientos + botón "Ver todos".
- Estados vacíos con botón de acción ("Registrar gasto").

### 5.2 Registrar movimiento (botón central "+", siempre visible)
- Hoja inferior (bottom sheet) con: tipo (Gasto / Ingreso / Transferencia), monto grande con teclado decimal, cuadrícula de categorías con ícono, cuenta (y cuenta destino en transferencias), fecha (hoy por defecto), nota.
- "Repetir": no se repite / cada semana / cada 15 días / cada mes / cada año → crea un movimiento fijo.
- Tocar un movimiento existente abre la misma hoja para editar o eliminar.
- Validar: monto > 0, cuentas distintas en transferencias.

### 5.3 Movimientos
- Lista del mes agrupada por día con total neto del día.
- Buscador (nota, categoría, cuenta, monto) que filtra sin perder el foco del input.
- Filtros: Todos / Gastos / Ingresos / Transferencias. Totales del filtro.
- Exportar CSV (con BOM para Excel).

### 5.4 Presupuesto (todo lo de presupuesto)
Pestañas internas: **Sobres · Metas · 50/30/20 · Fijos**.
- **Sobres (estilo Goodbudget):** límite mensual por categoría, tarjeta con forma de sobre, barra de progreso (verde / ámbar al llegar al % de alerta / rojo excedido), gastado de límite, disponible o excedido.
  - Resumen: presupuestado, gastado, disponible.
  - **Presupuesto base cero (estilo YNAB):** ingreso mensual esperado − presupuestado = "Por asignar".
  - Mes actual: "Te quedan N días: puedes gastar X al día" y proyección de cierre al ritmo actual comparada con el presupuesto.
  - "Sugerir con mi promedio de 3 meses" (redondear hacia arriba a 10).
  - Lista de categorías con gasto pero sin presupuesto, con botón "Asignar".
  - Al editar un sobre, mostrar lo gastado en esa categoría los 3 meses anteriores.
- **Metas de ahorro:** nombre, ícono, objetivo, ahorrado, fecha límite; cuánto aportar por mes para llegar; Aportar / Retirar; opción "registrar como gasto en Ahorro".
- **Regla 50/30/20:** con los ingresos del mes, meta vs real de necesidades, deseos y ahorro (ahorro = gastos del grupo ahorro + sobrante del mes).
- **Fijos:** movimientos recurrentes con próxima fecha, equivalente mensual total, pausar/reanudar, editar, eliminar. Al abrir la app se registran automáticamente los pendientes (con tope de seguridad) y se avisa con un toast. Los mensuales conservan el día original (el 31 no se va corriendo).

### 5.5 Bóveda (enlaces e imágenes, 100% local)
- Filtros: Todo / Enlaces / Imágenes / Favoritos; buscador; chips de etiquetas.
- Guardar enlace: URL (agregar `https://` si falta), botón "Pegar" (portapapeles), título (dominio si queda vacío), nota, etiquetas separadas por coma.
- Agregar imágenes: selector múltiple (`accept="image/*"`), compresión, guardado como Blob en IndexedDB.
- Cuadrícula de 2 columnas: imágenes cuadradas con título; enlaces en fila completa con insignia de la inicial del dominio.
- Visor de imagen: ver grande, editar título/nota/etiquetas, favorito, compartir (Web Share con archivo, o descarga como respaldo), eliminar.
- Liberar `URL.createObjectURL` al eliminar.

### 5.6 Ajustes (ícono de engrane en el encabezado)
- Moneda, tema (Auto / Claro / Oscuro), % de alerta de presupuesto (70/80/90).
- Cuentas: agregar, editar (nombre, ícono, saldo inicial), eliminar solo si no tiene movimientos.
- Categorías: agregar, editar (nombre, ícono con selector de emojis, tipo, grupo), eliminar solo si no se usa.
- Respaldo: exportar copia JSON (incluye imágenes en base64), importar copia (con confirmación), exportar CSV.
- Espacio usado (`navigator.storage.estimate()`).
- "Probar con datos de ejemplo" (solo si no hay movimientos) y "Borrar todos los datos" (confirmación doble).

## 6. Sistema de diseño (obligatorio)

Concepto: **cartera física**. Fondo verde salvia, verde pino como color de marca, dorado de moneda para acciones principales. Botones como **teclas físicas** que se hunden al tocarlos. Lo memorable es el saldo grande y los botones-tecla; el resto se mantiene sobrio.

| Token | Claro | Oscuro |
|---|---|---|
| `--bg` | `#E4ECE6` | `#0D1C19` |
| `--surface` | `#F6F9F6` | `#152A25` |
| `--surface2` | `#EDF3EE` | `#1B332D` |
| `--ink` | `#123029` | `#E3EEE8` |
| `--muted` | `#557068` | `#8EA79E` |
| `--line` | `#C5D4CB` | `#29453E` |
| `--pine` | `#1D5B4B` | `#123D33` |
| `--gold` | `#EDB33C` | `#EDB33C` |
| `--in` (ingresos) | `#1B8656` | `#4CC38A` |
| `--out` (gastos) | `#C0463A` | `#F07A6B` |
| `--warn` | `#C98314` | `#E9A93A` |
| `--edge` (bordes/sombra de teclas) | `#123029` | `#03100D` |

- Tema: tokens en `:root`, redefinidos en `@media (prefers-color-scheme: dark)` con `:root:not([data-theme="light"])` y en `:root[data-theme="dark"]`.
- Tipografía: **Bricolage Grotesque** (Google Fonts) con respaldo `ui-rounded, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Números con `font-variant-numeric: tabular-nums`. Saldo principal: `clamp(2.4rem, 11vw, 3.4rem)`, peso 800, tracking −0.035em.
- **Botones (`.btn`)**: borde 2px `--edge`, radio 14px, alto mínimo 48px, peso 700, `box-shadow: 0 4px 0 var(--edge)`; en `:active` → `translateY(4px)` y sombra 0 (efecto tecla). Variantes: `.primary` dorado, `.pine`, `.danger` rojo, `.ghost` sin borde, `.sm` (38px, sombra 3px). Botón "+" central: 62px, radio 20px, dorado, sobresale de la barra inferior.
- Barra inferior fija: Inicio, Movimientos, [+], Presupuesto, Bóveda. Íconos SVG de trazo; la pestaña activa lleva una píldora dorada detrás del ícono.
- Controles segmentados tipo píldora; la opción activa en `--ink` con texto `--bg`.
- Sobres de presupuesto con solapa triangular (`clip-path`) en la parte superior.
- Hojas inferiores con animación de subida (0.22s), fondo oscurecido, cierre con fondo, Escape o botón.
- Evitar: etiquetas en MAYÚSCULAS, flechas "→" en botones, degradados decorativos, sombras grises genéricas iguales en todo.
- Textos: verbos claros y en oración ("Guardar movimiento", "Agregar imágenes"); un toast confirma con la misma palabra ("Movimiento guardado").

## 7. El loop

Repite estas fases. Cada vuelta = un ciclo. Máximo 12 ciclos; si llegas al tope, detente y reporta qué falta y por qué.

**Ciclo 0 — Arranque (solo una vez)**
1. Lee este archivo completo y el estado del repo.
2. Crea `PROGRESS.md` con la lista de la sección 8 como casillas `[ ]`.
3. Configura `package.json` con `playwright` y `http-server` como devDependencies y los scripts `serve` y `test`.

**Cada ciclo**
1. **Planear:** elige las casillas pendientes de mayor prioridad (orden: datos → registrar movimiento → inicio → movimientos → presupuesto → bóveda → ajustes/respaldo → PWA → pulido visual). Escribe en `PROGRESS.md` qué harás en este ciclo.
2. **Construir:** implementa solo eso. Código legible, funciones pequeñas, escapar siempre el texto del usuario (`esc()`) antes de meterlo en HTML.
3. **Probar:** `npm test` (Playwright en Chromium y WebKit, viewport 390×844). Escribe o actualiza las pruebas de lo que construiste en este ciclo.
4. **Verificación adversarial:** revisa tu propio trabajo como si fueras un revisor que quiere encontrar errores. Como mínimo:
   - ¿Qué pasa con datos vacíos, montos gigantes, textos largos, fechas del 29–31, meses sin movimientos?
   - ¿Los totales de Inicio, Movimientos y Presupuesto coinciden para el mismo mes?
   - ¿Recargar la página conserva todo? ¿Funciona sin red?
   - Toma capturas (`page.screenshot`) de cada vista en claro y oscuro, míralas y corrige lo que se vea roto, amontonado o con scroll horizontal.
5. **Corregir** lo encontrado y volver a correr las pruebas hasta que pasen.
6. **Registrar:** marca `[x]` en `PROGRESS.md` solo lo que pasó pruebas y verificación; anota bugs abiertos. Commit con mensaje `ciclo N: <resumen>`.
7. Si quedan casillas `[ ]`, inicia el siguiente ciclo. Si todas están `[x]`, ejecuta la **verificación final**.

**Verificación final**
- Corre toda la suite dos veces seguidas (sin pruebas intermitentes).
- Recorrido completo manual con Playwright: cargar ejemplo → registrar gasto, ingreso y transferencia → crear presupuesto → aportar a meta → crear fijo → guardar enlace e imagen → exportar JSON → borrar todo → importar JSON → confirmar que todo volvió, incluidas las imágenes.
- Revisa que no haya errores en consola.
- Actualiza `README.md` y haz el commit final `release: v1.0`.

## 8. Definición de terminado

**Datos**
- [ ] IndexedDB con stores `kv` y `blobs`; el estado sobrevive a recargas.
- [ ] Migración: un estado viejo sin campos nuevos se completa con los valores por defecto.
- [ ] Parser de montos acepta los tres formatos; fechas en hora local.

**Movimientos y finanzas**
- [ ] Crear, editar y eliminar gasto, ingreso y transferencia.
- [ ] Saldos por cuenta y saldo total correctos (prueba con números conocidos).
- [ ] Inicio: dona, barras de 6 meses, cuentas, recientes, alertas y estados vacíos.
- [ ] Movimientos: agrupado por día, buscador sin perder foco, filtros, CSV.

**Presupuesto**
- [ ] Sobres con los tres estados de color y el % de alerta configurable.
- [ ] Base cero ("Por asignar"), gasto diario disponible y proyección de cierre.
- [ ] Sugerencia por promedio de 3 meses.
- [ ] Metas con aporte mensual necesario, aportar/retirar y registro opcional como gasto.
- [ ] 50/30/20 con meta vs real.
- [ ] Fijos: se generan los pendientes al abrir, el día 31 no se corre, pausar/editar/eliminar.

**Bóveda**
- [ ] Guardar, editar, buscar, etiquetar, marcar favorito y eliminar enlaces.
- [ ] Agregar varias imágenes, comprimir, ver, compartir/descargar y eliminar.
- [ ] Las imágenes siguen ahí después de recargar y sin red.

**Ajustes y respaldo**
- [ ] Moneda, tema y % de alerta se aplican al instante y se guardan.
- [ ] CRUD de cuentas y categorías con selector de íconos y protección si están en uso.
- [ ] Exportar e importar JSON con imágenes (ida y vuelta sin pérdida).
- [ ] Datos de ejemplo y borrar todo.

**PWA y publicación**
- [ ] `manifest.json` válido y service worker que cachea los assets; la app abre sin red.
- [ ] Instalable en Android (Chrome) y en iPhone (Safari → Agregar a inicio, con `apple-touch-icon`).
- [ ] Todas las rutas relativas; funciona servida desde una subcarpeta (`/bolsillo/`).
- [ ] `README.md` con pasos de GitHub Pages e instalación en el teléfono.

**Diseño y calidad**
- [ ] Sistema de diseño de la sección 6 aplicado a toda la app, incluidos todos los botones.
- [ ] Claro y oscuro revisados con capturas; sin scroll horizontal a 360 px.
- [ ] Foco visible, `aria-label` en botones de ícono, movimiento reducido respetado.
- [ ] Cero errores en consola; suite de pruebas en verde dos veces seguidas.

## 9. Reporte al terminar cada ciclo

Responde siempre con este formato breve:

```
Ciclo N
Hecho: ...
Pruebas: X pasaron / Y fallaron
Bugs encontrados y corregidos: ...
Pendiente: ...
Siguiente ciclo: ...
```
