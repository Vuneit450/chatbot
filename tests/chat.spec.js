const { test, expect } = require('@playwright/test');

async function clickOption(page, label) {
  await page.getByRole('button', { name: label, exact: true }).click();
}

test.describe('Bot Oreo', () => {
  test('carga el menú principal sin errores de consola', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto('/');
    await expect(page.locator('.msg.bot').first()).toContainText('Bienvenido a la familia Oreo');
    await expect(page.locator('.chip')).toHaveCount(4);
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
});
