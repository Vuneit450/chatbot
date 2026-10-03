const { test, expect } = require('@playwright/test');

async function clickOption(page, label) {
  await page.getByRole('button', { name: label, exact: true }).click();
}

async function send(page, text) {
  await page.fill('#messageInput', text);
  await page.locator('.send-btn').click();
}

function uniquePhone() {
  // Único por ejecución (no solo por test) para que reintentos y corridas
  // repetidas de la suite nunca choquen con un cliente/carrito que quedó
  // de una corrida anterior en la base de datos local persistente.
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function registrarCliente(page, { nombre = 'Jonathan', correo = 'jonathan@binatsa.mx', usuario = 'jonab', telefono = uniquePhone() } = {}) {
  await clickOption(page, '1️⃣');
  await send(page, nombre);
  await send(page, correo);
  await send(page, usuario);
  await send(page, telefono);
  return telefono;
}

test.describe('Bot Oreo', () => {
  test('carga el menú principal sin errores de consola', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto('/');
    await expect(page.locator('.msg.bot').first()).toContainText('Bienvenido a la familia Oreo');
    await expect(page.locator('.chip')).toHaveCount(5);
    expect(errors).toEqual([]);
  });

  test('flujo completo de registro captura los 4 campos y no deja variables sin rellenar', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, '1️⃣');
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

    await page.fill('#messageInput', '5512345678');
    await page.locator('.send-btn').click();
    const last = page.locator('.msg.bot').last();
    await expect(last).toContainText('Nombre: Jonathan');
    await expect(last).toContainText('Correo: jonathan@binatsa.mx');
    await expect(last).toContainText('Usuario: jonabinatsa');
    await expect(last).toContainText('Teléfono: 5512345678');
    // Bug original: {telefono} nunca se llenaba porque no existía paso de
    // captura; si reaparece, el texto crudo del placeholder queda visible.
    await expect(last).not.toContainText('{telefono}');
  });

  test('salir es un callejón sin salida hasta escribir "Activar"', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, '3️⃣');
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
    await clickOption(page, '2️⃣');
    await expect(page.locator('.msg.bot').last()).toContainText("Has seleccionado 'Inicio'");

    await page.click('#restartBtn');
    await expect(page.locator('.msg.bot')).toHaveCount(1);
    await expect(page.locator('.msg.bot').first()).toContainText('Bienvenido a la familia Oreo');
  });

  test('recargar la página conserva el historial visible (sessionStorage)', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, '2️⃣');
    await expect(page.locator('.msg.bot').last()).toContainText("Has seleccionado 'Inicio'");
    await page.reload();
    await expect(page.locator('.msg.bot').last()).toContainText("Has seleccionado 'Inicio'");
  });

  test('un enlace de WhatsApp se renderiza como <a> real, no como texto crudo', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, '2️⃣');
    await clickOption(page, '6️⃣');
    const link = page.locator('.msg.bot').last().locator('a');
    await expect(link).toHaveAttribute('href', /^https:\/\//);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
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

  test('flujo de compra completo: catálogo → carrito → checkout → sugerencia → historial', async ({ page }) => {
    await page.goto('/');
    await registrarCliente(page, { nombre: 'Dana' });
    await send(page, '*');
    await clickOption(page, '1️⃣'); // catálogo
    await clickOption(page, '1️⃣'); // música
    await clickOption(page, '1️⃣'); // Spotify
    const planes = page.locator('.msg.bot').last();
    await expect(planes).toContainText('MXN');
    await clickOption(page, '1️⃣'); // agrega el primer plan
    await expect(page.locator('.msg.bot').last()).toContainText('Agregado a tu carrito');

    await clickOption(page, '2️⃣'); // ver carrito
    const carrito = page.locator('.msg.bot').last();
    await expect(carrito).toContainText('Spotify');
    await expect(carrito).toContainText('Total: $');

    await send(page, 'comprar');
    await expect(page.locator('.msg.bot').last()).toContainText('Vas a confirmar este pedido');
    await clickOption(page, '1️⃣'); // confirmar compra
    const confirmado = page.locator('.msg.bot').last();
    await expect(confirmado).toContainText('confirmado');
    await expect(confirmado).toContainText('Total: $');

    // La sugerencia post-compra es opcional (solo si hay otra categoría sin
    // comprar), pero con un cliente nuevo siempre debería aparecer.
    await expect(confirmado).toContainText('qué tal');

    await clickOption(page, '0️⃣'); // no gracias, volver al menú
    await clickOption(page, '3️⃣'); // mi cuenta e historial
    const cuenta = page.locator('.msg.bot').last();
    await expect(cuenta).toContainText('Dana');
    await expect(cuenta).toContainText('Tus últimos pedidos');
  });

  test('al confirmar un pedido aparece un link de recibo real y funcional', async ({ page }) => {
    await page.goto('/');
    await registrarCliente(page, { nombre: 'Rita' });
    await send(page, '*');
    await clickOption(page, '1️⃣'); // catálogo
    await clickOption(page, '1️⃣'); // música
    await clickOption(page, '3️⃣'); // Amazon Music (un solo plan)
    await clickOption(page, '1️⃣'); // agregar
    await clickOption(page, '2️⃣'); // ver carrito
    await send(page, 'comprar');
    await clickOption(page, '1️⃣'); // confirmar compra

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
    await clickOption(pageA, '1️⃣'); // catálogo
    await clickOption(pageA, '1️⃣'); // música
    await clickOption(pageA, '2️⃣'); // YouTube Music
    await clickOption(pageA, '1️⃣'); // agregar primer plan
    await expect(pageA.locator('.msg.bot').last()).toContainText('Agregado a tu carrito');
    await ctxA.close();

    // "Otro dispositivo": contexto y cookies completamente nuevos.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto('/');
    await clickOption(pageB, '5️⃣'); // ya tengo cuenta
    await send(pageB, telefono);
    const menu = pageB.locator('.msg.bot').last();
    await expect(menu).toContainText('Erik');
    await expect(menu).toContainText('Mi carrito (1)');
    await ctxB.close();
  });

  test('sin identificarse, el carrito pide registrarte o identificarte en vez de tronar', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, '2️⃣'); // Inicio
    await clickOption(page, '2️⃣'); // Pedido
    await clickOption(page, '2️⃣'); // Mi carrito
    await expect(page.locator('.msg.bot').last()).toContainText('primero necesito identificarte');
  });

  test('un teléfono que no existe ofrece registrarte en vez de dejarte varado', async ({ page }) => {
    await page.goto('/');
    await clickOption(page, '5️⃣'); // ya tengo cuenta
    await send(page, '0000000000000');
    await expect(page.locator('.msg.bot').last()).toContainText('No encontramos ninguna cuenta');
  });
});
