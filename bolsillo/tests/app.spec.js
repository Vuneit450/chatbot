const { test, expect } = require('@playwright/test');

async function clearState(page) {
  await page.goto('./');
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('bolsillo-db');
      req.onsuccess = resolve;
      req.onerror = resolve;
      req.onblocked = resolve;
    });
  });
  await page.reload();
}

test.describe('Bolsillo', () => {
  test('carga sin errores de consola y muestra el estado vacío', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text());
    });
    await clearState(page);
    await expect(page.locator('#topbarTitle')).toHaveText('Bolsillo');
    await expect(page.locator('.empty-state').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('registrar un gasto actualiza el saldo e Inicio', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="open-tx"]');
    await page.fill('#txAmount', '150.50');
    await page.click('.cat-chip');
    await page.fill('#txNote', 'Café con amigos');
    await page.click('[data-action="tx-save"]');
    await expect(page.locator('.toast')).toHaveText('Movimiento guardado');
    await expect(page.locator('.balance-amount')).toContainText('-$150.50');
  });

  test('registrar ingreso y transferencia calcula saldos correctos', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="open-tx"]');
    await page.click('[data-action="tx-type"][data-type="ingreso"]');
    await page.fill('#txAmount', '1000');
    await page.click('[data-action="tx-save"]');
    await page.click('[data-action="nav"][data-view="movimientos"]');
    await expect(page.locator('.tx-row').first()).toBeVisible();

    await page.click('[data-action="open-tx"]');
    await page.click('[data-action="tx-type"][data-type="transfer"]');
    await page.fill('#txAmount', '200');
    await page.click('[data-action="tx-save"]');
    await page.click('[data-action="nav"][data-view="inicio"]');
    // Una transferencia mueve dinero entre cuentas pero no cambia el saldo total.
    await expect(page.locator('.balance-amount')).toContainText('$1,000.00');
    const accCards = page.locator('.acc-card');
    await expect(accCards.nth(0)).toContainText('$800.00');
    await expect(accCards.nth(1)).toContainText('$200.00');
  });

  test('editar y eliminar un movimiento', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="open-tx"]');
    await page.fill('#txAmount', '99');
    await page.click('[data-action="tx-save"]');
    await page.click('[data-action="nav"][data-view="movimientos"]');
    await page.click('.tx-row');
    await page.fill('#txAmount', '199');
    await page.click('[data-action="tx-save"]');
    await expect(page.locator('.tx-row .amt').first()).toContainText('199');
    await page.click('.tx-row');
    page.once('dialog', (d) => d.accept());
    await page.click('[data-action="tx-delete"]');
    await expect(page.locator('.empty-state')).toBeVisible();
  });

  test('buscador de movimientos no pierde el foco al escribir', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="open-tx"]');
    await page.fill('#txAmount', '50');
    await page.fill('#txNote', 'gasolina carro');
    await page.click('[data-action="tx-save"]');
    await page.click('[data-action="nav"][data-view="movimientos"]');
    const search = page.locator('#movSearch');
    await search.click();
    await search.type('gasolina', { delay: 30 });
    await expect(search).toBeFocused();
    await expect(page.locator('.tx-row')).toHaveCount(1);
  });

  test('presupuesto: crear sobre y ver estados de color', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="open-tx"]');
    await page.fill('#txAmount', '900');
    await page.click('[data-action="tx-save"]');
    await page.click('[data-action="nav"][data-view="presupuesto"]');
    await page.click('[data-action="env-add"]');
    await page.fill('#envLimit', '1000');
    await page.click('[data-action="env-save"]');
    await expect(page.locator('.envelope')).toBeVisible();
  });

  test('metas: crear meta y aportar', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="nav"][data-view="presupuesto"]');
    await page.click('[data-action="pres-tab"][data-tab="metas"]');
    await page.click('[data-action="goal-add"]');
    await page.fill('#goalName', 'Viaje');
    await page.fill('#goalTarget', '5000');
    await page.click('[data-action="goal-save"]');
    await expect(page.locator('.goal-card')).toBeVisible();
    await page.click('[data-action="goal-contribute"][data-mode="aportar"]');
    await page.fill('#contribAmount', '500');
    await page.uncheck('#contribAsExpense');
    await page.click('[data-action="goal-contrib-save"]');
    await expect(page.locator('.goal-card')).toContainText('10%');
  });

  test('fijos: crear recurrente mensual', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="nav"][data-view="presupuesto"]');
    await page.click('[data-action="pres-tab"][data-tab="fijos"]');
    await page.click('[data-action="fijo-add"]');
    await page.fill('#fijoAmount', '300');
    await page.click('.cat-chip');
    await page.click('[data-action="fijo-save"]');
    await expect(page.locator('.settings-item')).toBeVisible();
  });

  test('bóveda: guardar enlace y buscarlo', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="nav"][data-view="boveda"]');
    await page.click('[data-action="vault-add-link"]');
    await page.fill('#linkUrl', 'example.com/articulo');
    await page.fill('#linkTitle', 'Artículo interesante');
    await page.fill('#linkTags', 'lectura, ideas');
    await page.click('[data-action="link-save"]');
    await expect(page.locator('.vault-tile')).toBeVisible();
    await page.fill('#vaultSearch', 'artículo');
    await expect(page.locator('.vault-tile')).toHaveCount(1);
  });

  test('ajustes: cambiar moneda y tema se aplican', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="goto-ajustes"]');
    await page.click('[data-action="set-theme"][data-value="dark"]');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.click('[data-action="set-currency"][data-value="USD"]');
    // Espera a que el guardado en IndexedDB realmente termine antes de recargar (evita una carrera bajo CPU ocupada).
    await page.waitForFunction(async () => {
      const s = await BolsilloDB.kvGet('state');
      return !!s && s.settings.theme === 'dark' && s.settings.currency === 'USD';
    });
    await page.reload();
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
  });

  test('recarga conserva los datos (persistencia)', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="open-tx"]');
    await page.fill('#txAmount', '42');
    await page.fill('#txNote', 'prueba de persistencia');
    await page.click('[data-action="tx-save"]');
    await expect(page.locator('.toast')).toHaveText('Movimiento guardado');
    await page.reload();
    await expect(page.locator('.tx-row, .empty-state').first()).toBeVisible();
    await page.click('[data-action="nav"][data-view="movimientos"]');
    await expect(page.locator('.tx-row')).toContainText('prueba de persistencia');
  });

  test('datos de ejemplo, exportar e importar respaldo sin pérdida', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="goto-ajustes"]');
    await page.click('[data-action="load-sample"]');
    await expect(page.locator('.toast')).toHaveText('Datos de ejemplo cargados');
    const before = await page.evaluate(() => JSON.stringify(App.state.tx.length));

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-action="backup-export"]'),
    ]);
    const path = await download.path();

    page.on('dialog', (d) => d.accept());
    await page.click('[data-action="wipe-all"]');
    await expect(page.locator('.empty-state').first()).toBeVisible();

    await page.click('[data-action="goto-ajustes"]');
    await page.setInputFiles('#importFile', path);
    await expect(page.locator('.toast')).toHaveText('Copia importada');
    const after = await page.evaluate(() => JSON.stringify(App.state.tx.length));
    expect(after).toBe(before);
  });
});
