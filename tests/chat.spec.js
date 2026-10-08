const { test, expect } = require('@playwright/test');

async function clickOption(page, label) {
  await page.getByRole('button', { name: label, exact: true }).click();
}

async function send(page, text) {
  await page.fill('#messageInput', text);
  await page.locator('.send-btn').click();
}

// PIN de prueba: el bot lo pide al registrarse y al identificarse.
const PIN = '4821';

function uniquePhone() {
  // Exactamente 10 dígitos (el registro ahora valida el formato), pero
  // igual único por ejecución para que reintentos y corridas repetidas de
  // la suite nunca choquen con un cliente/carrito que quedó de una corrida
  // anterior en la base de datos local persistente.
  const ts = Date.now().toString().slice(-7);
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${ts}${rand}`;
}

async function registrarCliente(page, { nombre = 'Jonathan', correo = 'jonathan@binatsa.mx', usuario = 'jonab', telefono = uniquePhone(), pin = PIN } = {}) {
  await clickOption(page, 'Registro');
  await send(page, nombre);
  await send(page, correo);
  await send(page, usuario);
  await send(page, telefono);
  await send(page, pin); // elegir PIN
  await send(page, pin); // confirmarlo
  return telefono;
}

test.describe('Bot Oreo', () => {
  test('carga el menú principal sin errores de consola', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto('/');
    await expect(page.locator('.msg.bot').first()).toContainText('Bienvenido a la familia Oreo');
    // Las 5 opciones (Registro/Inicio/Salir/Activar/Ya tengo cuenta) son
    // tarjetas visuales; este menú no tiene botones de navegación 0️⃣/*️⃣.
    await expect(page.locator('.tile')).toHaveCount(5);
    await expect(page.locator('.chip')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('flujo completo de registro captura los 4 campos y no deja variables sin rellenar', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, 'Registro');
    await expect(page.locator('.msg.bot').last()).toContainText('proporciona tu nombre');

    await page.fill('#messageInput', 'Jonathan');
    await page.locator('.send-btn').click();
    await expect(page.locator('.msg.bot').last()).toContainText('Gracias, Jonathan');

    await page.fill('#messageInput', 'jonathan@binatsa.mx');
    await page.locator('.send-btn').click();
    await expect(page.locator('.msg.bot').last()).toContainText('Perfecto, jonathan@binatsa.mx');

    await page.fill('#messageInput', 'jonabinatsa');
    await page.locator('.send-btn').click();
    await expect(page.locator('.msg.bot').last()).toContainText('Genial, jonabinatsa');
    await expect(page.locator('.msg.bot').last()).toContainText('teléfono');

    const telefonoReg = uniquePhone();
    await page.fill('#messageInput', telefonoReg);
    await page.locator('.send-btn').click();
    await expect(page.locator('.msg.bot').last()).toContainText('PIN');
    await send(page, PIN);
    await expect(page.locator('.msg.bot').last()).toContainText('de nuevo tu PIN');
    await send(page, PIN);
    const last = page.locator('.msg.bot').last();
    await expect(last).toContainText('Nombre: Jonathan');
    await expect(last).toContainText('Correo: jonathan@binatsa.mx');
    await expect(last).toContainText('Usuario: jonabinatsa');
    await expect(last).toContainText(`Teléfono: ${telefonoReg}`);
    // Bug original: {telefono} nunca se llenaba porque no existía paso de
    // captura; si reaparece, el texto crudo del placeholder queda visible.
    await expect(last).not.toContainText('{telefono}');
  });

  test('un teléfono inválido en el registro se rechaza y no pisa la cuenta de otro cliente', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, 'Registro');
    await send(page, 'Bruno');
    await send(page, 'bruno@test.com');
    await send(page, 'brunob');

    await send(page, '123'); // muy corto: no son 10 dígitos
    await expect(page.locator('.msg.bot').last()).toContainText('no parece válido');
    await expect(page.locator('.msg.bot').last()).toContainText('teléfono'); // se queda pidiéndolo, no avanza

    // Con guiones/espacios sí debe aceptarlo, limpiando el formato.
    const telefono = uniquePhone();
    const formateado = `${telefono.slice(0, 3)}-${telefono.slice(3, 6)}-${telefono.slice(6)}`;
    await send(page, formateado);
    await send(page, PIN);
    await send(page, PIN);
    const confirmacion = page.locator('.msg.bot').last();
    await expect(confirmacion).toContainText(`Teléfono: ${telefono}`);
  });

  test('salir es un callejón sin salida hasta escribir "Activar"', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, 'Salir');
    await expect(page.locator('.msg.bot').last()).toContainText("Has seleccionado 'Salir'");

    await page.fill('#messageInput', 'cualquier cosa');
    await page.locator('.send-btn').click();
    await expect(page.locator('.msg.bot').last()).toContainText("Has seleccionado 'Salir'");

    await page.fill('#messageInput', 'Activar');
    await page.locator('.send-btn').click();
    await expect(page.locator('.msg.bot').last()).toContainText('bot ha sido activado');
  });

  test('el botón reiniciar limpia el historial y vuelve al menú principal', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, 'Inicio');
    await expect(page.locator('.msg.bot').last()).toContainText("Has seleccionado 'Inicio'");

    await page.click('#restartBtn');
    await expect(page.locator('.msg.bot')).toHaveCount(1);
    await expect(page.locator('.msg.bot').first()).toContainText('Bienvenido a la familia Oreo');
  });

  test('recargar la página conserva el historial visible (sessionStorage)', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, 'Inicio');
    await expect(page.locator('.msg.bot').last()).toContainText("Has seleccionado 'Inicio'");
    await page.reload();
    await expect(page.locator('.msg.bot').last()).toContainText("Has seleccionado 'Inicio'");
  });

  test('un enlace de WhatsApp se renderiza como <a> real, no como texto crudo', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, 'Inicio');
    await clickOption(page, 'Comunidad');
    const link = page.locator('.msg.bot').last().locator('a');
    await expect(link).toHaveAttribute('href', /^https:\/\//);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('el menú de "Inicio" también usa tarjetas visuales para sus 6 opciones', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, 'Inicio');
    const opciones = page.locator('.tile');
    await expect(opciones).toHaveCount(5);
    await expect(opciones.nth(0)).toContainText('Ver productos');
    await expect(opciones.nth(0).locator('img')).toHaveAttribute('src', '/static/icons/catalog/productos.svg');
    await expect(opciones.nth(1)).toContainText('Pedido');
    await expect(opciones.nth(4)).toContainText('Comunidad');
    // 0️⃣/*️⃣ (volver) siguen siendo chips normales, no tarjetas.
    await expect(page.locator('.chip')).toHaveCount(2);
  });

  test('sin scroll horizontal a 360px, claro y oscuro', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(80);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow, `scroll horizontal en ${scheme}`).toBe(false);
      await page.screenshot({ path: `test-results/shot-chat-${scheme}.png`, fullPage: true });
    }
  });

  test('un mensaje vacío no se envía', async ({ page }) => {
    await page.goto('/');
    // Esperar al menú inicial: sin esto, el conteo corría contra la carga
    // asíncrona de /api/state y la prueba fallaba de forma intermitente.
    await expect(page.locator('.msg.bot').first()).toBeVisible();
    const before = await page.locator('.msg').count();
    await page.locator('.send-btn').click();
    await expect(page.locator('.msg')).toHaveCount(before);
  });

  test('tras registrarse, el menú principal saluda por nombre y ya no ofrece "Registro"', async ({ page }) => {
    await page.goto('/');
    await registrarCliente(page, { nombre: 'Ana' });
    await send(page, '*'); // volver al menú principal
    const last = page.locator('.msg.bot').last();
    await expect(last).toContainText('¡Qué bueno verte de nuevo, Ana!');
    await expect(last).toContainText('Mi carrito');
    await expect(last).not.toContainText('Registro');
  });

  test('el menú principal ya identificado usa tarjetas, y el carrito reutiliza el ícono de la plataforma', async ({ page }) => {
    await page.goto('/');
    await registrarCliente(page, { nombre: 'Noe' });
    await send(page, '*');

    const principales = page.locator('.tile');
    await expect(principales).toHaveCount(4); // Ver catálogo, Mi carrito, Mi cuenta, Inicio
    await expect(principales.nth(0)).toContainText('Ver catálogo');
    await expect(principales.nth(2)).toContainText('Mi cuenta');
    await expect(principales.nth(3)).toContainText('Inicio');
    await expect(page.locator('.chip')).toHaveCount(1); // Salir

    await clickOption(page, 'Ver catálogo');
    await clickOption(page, 'Música');
    await clickOption(page, 'Spotify');
    await clickOption(page, '1️⃣'); // agrega el primer plan (la lista de planes no es tarjeta)
    await clickOption(page, 'Ver carrito');

    // El producto en el carrito muestra el mismo ícono que ya vimos en el
    // catálogo para Spotify, no uno genérico sin relación.
    await expect(page.locator('.tile')).toHaveCount(2); // el producto + "Comprar"
    const itemCarrito = page.locator('.tile').nth(0);
    await expect(itemCarrito).toContainText('Spotify');
    await expect(itemCarrito.locator('img')).toHaveAttribute('src', '/static/icons/catalog/spotify.svg');
    await expect(page.locator('.tile').nth(1)).toContainText('Comprar');
  });

  test('el catálogo muestra tarjetas visuales (imagen + título) en vez de solo números', async ({ page }) => {
    await page.goto('/');
    await registrarCliente(page, { nombre: 'Vale' });
    await send(page, '*');
    await clickOption(page, 'Ver catálogo');

    const categorias = page.locator('.tile');
    await expect(categorias).toHaveCount(4);
    await expect(categorias.nth(0)).toContainText('Música');
    await expect(categorias.nth(0).locator('img')).toHaveAttribute('src', '/static/icons/catalog/musica.svg');
    await expect(categorias.nth(3)).toContainText('Películas');
    // Los botones de navegación (0️⃣/*️⃣) siguen siendo chips normales, no tarjetas.
    await expect(page.locator('.chip')).toHaveCount(2);

    await clickOption(page, 'Música');
    const plataformasMusica = page.locator('.tile');
    await expect(plataformasMusica).toHaveCount(3);
    await expect(plataformasMusica.nth(0)).toContainText('Spotify');
    await expect(plataformasMusica.nth(1)).toContainText('YouTube Music');
    await expect(plataformasMusica.nth(2)).toContainText('Amazon Music');

    await clickOption(page, '0️⃣'); // volver a catálogo
    await clickOption(page, 'Películas');
    const plataformasPeliculas = page.locator('.tile');
    await expect(plataformasPeliculas).toHaveCount(3);
    await expect(plataformasPeliculas.nth(0)).toContainText('Crunchyroll');
    await expect(plataformasPeliculas.nth(1)).toContainText('Amazon Prime Video');
    await expect(plataformasPeliculas.nth(2)).toContainText('Netflix');
  });

  test('confirmar una compra no se rompe aunque el aviso a Bolsillo falle', async ({ page }) => {
    // El webServer de esta suite corre con BOLSILLO_SYNC_URL apuntando a un
    // puerto sin nada escuchando (ver playwright.config.js), a propósito:
    // bug real encontrado en producción donde un error de red que no era
    // exactamente urllib.error.URLError (p.ej. uno de TLS) se escapaba del
    // except de _notificar_bolsillo y tronaba todo el checkout con un 500,
    // aunque el pedido ya se había guardado. Aquí confirmamos que la
    // compra se completa con normalidad pese a que ese aviso siempre falla.
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await registrarCliente(page, { nombre: 'Query' });
    await send(page, '*');
    await clickOption(page, 'Ver catálogo');
    await clickOption(page, 'Música');
    await clickOption(page, 'Amazon Music'); // un solo plan
    await clickOption(page, '1️⃣');
    await clickOption(page, 'Ver carrito');
    await send(page, 'comprar');
    await clickOption(page, 'Confirmar compra');
    await expect(page.locator('.msg.bot').last()).toContainText('confirmado');
    await expect(page.locator('.msg.bot').last()).not.toContainText('No pude conectar');
    expect(errors).toEqual([]);
  });

  test('flujo de compra completo: catálogo → carrito → checkout → sugerencia → historial', async ({ page }) => {
    await page.goto('/');
    await registrarCliente(page, { nombre: 'Dana' });
    await send(page, '*');
    await clickOption(page, 'Ver catálogo');
    await clickOption(page, 'Música'); // tarjeta visual
    await clickOption(page, 'Spotify'); // tarjeta visual
    const planes = page.locator('.msg.bot').last();
    await expect(planes).toContainText('MXN');
    await clickOption(page, '1️⃣'); // agrega el primer plan
    await expect(page.locator('.msg.bot').last()).toContainText('Agregado a tu carrito');

    await clickOption(page, 'Ver carrito');
    const carrito = page.locator('.msg.bot').last();
    await expect(carrito).toContainText('Spotify');
    await expect(carrito).toContainText('Total: $');

    await send(page, 'comprar');
    await expect(page.locator('.msg.bot').last()).toContainText('Vas a confirmar este pedido');
    await clickOption(page, 'Confirmar compra');
    const confirmado = page.locator('.msg.bot').last();
    await expect(confirmado).toContainText('confirmado');
    await expect(confirmado).toContainText('Total: $');

    // La sugerencia post-compra es opcional (solo si hay otra categoría sin
    // comprar), pero con un cliente nuevo siempre debería aparecer.
    await expect(confirmado).toContainText('qué tal');

    await clickOption(page, '0️⃣'); // no gracias, volver al menú
    await clickOption(page, 'Mi cuenta');
    const cuenta = page.locator('.msg.bot').last();
    await expect(cuenta).toContainText('Dana');
    await expect(cuenta).toContainText('Tus últimos pedidos');
  });

  test('al confirmar un pedido aparece un link de recibo real y funcional', async ({ page }) => {
    await page.goto('/');
    await registrarCliente(page, { nombre: 'Rita' });
    await send(page, '*');
    await clickOption(page, 'Ver catálogo');
    await clickOption(page, 'Música'); // tarjeta visual
    await clickOption(page, 'Amazon Music'); // tarjeta visual (un solo plan)
    await clickOption(page, '1️⃣'); // agregar
    await clickOption(page, 'Ver carrito');
    await send(page, 'comprar');
    await clickOption(page, 'Confirmar compra');

    const confirmado = page.locator('.msg.bot').last();
    const link = confirmado.locator('a[href^="/recibo/"]');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('target', '_blank');
    const href = await link.getAttribute('href');

    const receiptPage = await page.context().newPage();
    const res = await receiptPage.goto(href);
    expect(res.status()).toBe(200);
    await expect(receiptPage.locator('body')).toContainText('Rita');
    await expect(receiptPage.locator('body')).toContainText('Amazon Music');
    await expect(receiptPage.locator('body')).toContainText('Total');
  });

  test('el carrito recuerda al cliente entre dispositivos al identificarse por teléfono', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto('/');
    const telefono = await registrarCliente(pageA, { nombre: 'Erik' });
    await send(pageA, '*');
    await clickOption(pageA, 'Ver catálogo');
    await clickOption(pageA, 'Música'); // tarjeta visual
    await clickOption(pageA, 'YouTube Music'); // tarjeta visual
    await clickOption(pageA, '1️⃣'); // agregar primer plan
    await expect(pageA.locator('.msg.bot').last()).toContainText('Agregado a tu carrito');
    await ctxA.close();

    // "Otro dispositivo": contexto y cookies completamente nuevos.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto('/');
    await clickOption(pageB, 'Ya tengo cuenta');
    await send(pageB, telefono);
    await send(pageB, PIN);
    const menu = pageB.locator('.msg.bot').last();
    await expect(menu).toContainText('Erik');
    await expect(menu).toContainText('Mi carrito (1)');
    await ctxB.close();
  });

  test('sin identificarse, el carrito pide registrarte o identificarte en vez de tronar', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, 'Inicio');
    await clickOption(page, 'Pedido');
    await clickOption(page, 'Mi carrito');
    await expect(page.locator('.msg.bot').last()).toContainText('primero necesito identificarte');
  });

  test('"activar"/"menu" funcionan hasta dentro de una pantalla dinámica como el carrito', async ({ page }) => {
    // Bug real: commerce.advance() siempre resuelve el mensaje en nodos
    // como "carrito", así que los comandos globales nunca alcanzaban a
    // revisarse ahí y se perdían en silencio (se quedaba en el mismo
    // nodo) pese a que el código decía soportarlos "en cualquier punto".
    await page.goto('/');
    await registrarCliente(page, { nombre: 'Uli' });
    await send(page, '*');

    await clickOption(page, 'Mi carrito'); // nodo dinámico "carrito"
    await send(page, 'menu');
    await expect(page.locator('.msg.bot').last()).toContainText('¡Qué bueno verte de nuevo, Uli!');

    await clickOption(page, 'Mi carrito');
    await send(page, 'Activar');
    await expect(page.locator('.msg.bot').last()).toContainText('bot ha sido activado');
  });

  test('un teléfono que no existe ofrece registrarte en vez de dejarte varado', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, 'Ya tengo cuenta');
    await send(page, '0000000000000');
    await send(page, PIN);
    // Misma respuesta que con un PIN equivocado: no revela si el teléfono existe.
    await expect(page.locator('.msg.bot').last()).toContainText('No pudimos identificarte');
  });

  async function irAActualizarInformacion(page) {
    // Antes de este cambio, todo este subárbol (Ayuda, Horarios, Pago,
    // Comunidad, Buscar información) quedaba inalcanzable para siempre en
    // cuanto el cliente se identificaba: el menú dinámico no ofrecía
    // ninguna salida hacia "Inicio". Este camino prueba que ya se puede.
    await clickOption(page, 'Inicio');
    await clickOption(page, 'Ayuda');
    await clickOption(page, 'Buscar información');
    await clickOption(page, '2️⃣'); // Actualizar información
    await send(page, PIN); // cambiar datos exige reconfirmar el PIN
    await expect(page.locator('.msg.bot').last()).toContainText('nombre actual');
  }

  test('actualizar información cambia el perfil completo y sigue accesible ya identificado', async ({ page }) => {
    await page.goto('/');
    await registrarCliente(page, { nombre: 'Memo', correo: 'memo@test.com', usuario: 'memou' });
    await send(page, '*');
    await irAActualizarInformacion(page);

    await expect(page.locator('.msg.bot').last()).toContainText('Memo');
    await send(page, 'Guillermo');
    await expect(page.locator('.msg.bot').last()).toContainText('memo@test.com');
    await send(page, 'guille@test.com');
    await expect(page.locator('.msg.bot').last()).toContainText('memou');
    await send(page, 'guillermou');
    const nuevoTelefono = uniquePhone();
    await send(page, nuevoTelefono);

    const confirmado = page.locator('.msg.bot').last();
    await expect(confirmado).toContainText('Guillermo');
    await expect(confirmado).toContainText('guille@test.com');
    await expect(confirmado).toContainText('guillermou');
    await expect(confirmado).toContainText(nuevoTelefono);

    await clickOption(page, '0️⃣'); // volver al menú principal
    await clickOption(page, 'Mi cuenta');
    await expect(page.locator('.msg.bot').last()).toContainText('Guillermo');
  });

  test('un teléfono inválido al actualizar se rechaza sin perder lo ya capturado', async ({ page }) => {
    await page.goto('/');
    await registrarCliente(page, { nombre: 'Nora' });
    await send(page, '*');
    await irAActualizarInformacion(page);

    await send(page, 'Nora Actualizada');
    await send(page, 'nora@test.com');
    await send(page, 'norau');
    await send(page, '123'); // inválido
    await expect(page.locator('.msg.bot').last()).toContainText('no parece válido');

    const telefono = uniquePhone();
    await send(page, telefono);
    const confirmado = page.locator('.msg.bot').last();
    await expect(confirmado).toContainText('Nora Actualizada');
    await expect(confirmado).toContainText(telefono);
  });

  test('no se puede robar el teléfono de otro cliente a través de "Actualizar información"', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto('/');
    const telefonoA = await registrarCliente(pageA, { nombre: 'Clienta A' });
    await ctxA.close();

    // Contexto nuevo = cliente nuevo, sin la sesión de A.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto('/');
    await registrarCliente(pageB, { nombre: 'Clienta B' });
    await send(pageB, '*');
    await irAActualizarInformacion(pageB);
    await send(pageB, 'Clienta B');
    await send(pageB, 'b@test.com');
    await send(pageB, 'bbb');
    await send(pageB, telefonoA); // intenta robar el teléfono de A
    await expect(pageB.locator('.msg.bot').last()).toContainText('ya está en uso');

    // B puede seguir intentando con un teléfono propio y sí completar.
    const telefonoB = uniquePhone();
    await send(pageB, telefonoB);
    await expect(pageB.locator('.msg.bot').last()).toContainText('Clienta B');
    await ctxB.close();

    // El teléfono de A sigue identificando a A, no a B, en un tercer contexto.
    const ctxC = await browser.newContext();
    const pageC = await ctxC.newPage();
    await pageC.goto('/');
    await clickOption(pageC, 'Ya tengo cuenta');
    await send(pageC, telefonoA);
    await send(pageC, PIN);
    await expect(pageC.locator('.msg.bot').last()).toContainText('Clienta A');
    await ctxC.close();
  });

  test('el PIN no se muestra ni se guarda en el historial del navegador', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, 'Registro');
    await send(page, 'Pina');
    await send(page, 'pina@test.com');
    await send(page, 'pinau');
    await expect(page.locator('#messageInput')).toHaveAttribute('type', 'text');
    await send(page, uniquePhone());
    await expect(page.locator('.msg.bot').last()).toContainText('PIN');
    await expect(page.locator('#messageInput')).toHaveAttribute('type', 'password');
    await send(page, '739154');
    await send(page, '739154');
    await expect(page.locator('.msg.bot').last()).toContainText('Registro completado');
    await expect(page.locator('.msg.user').last()).toHaveText('••••');
    await expect(page.locator('body')).not.toContainText('739154');
    const guardado = await page.evaluate(() => JSON.stringify(Object.assign({}, sessionStorage)));
    expect(guardado).not.toContain('739154');
    await page.reload();
    await expect(page.locator('body')).not.toContainText('739154');
    await expect(page.locator('#messageInput')).toHaveAttribute('type', 'text');
  });

  test('un PIN incorrecto no identifica y la respuesta es la genérica', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto('/');
    const telefono = await registrarCliente(pageA, { nombre: 'Pili' });
    await ctxA.close();

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto('/');
    await clickOption(pageB, 'Ya tengo cuenta');
    await send(pageB, telefono);
    await send(pageB, '0000');
    await expect(pageB.locator('.msg.bot').last()).toContainText('No pudimos identificarte');
    await expect(pageB.locator('.msg.bot').last()).not.toContainText('Pili');
    await ctxB.close();
  });
});
