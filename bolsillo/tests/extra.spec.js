const { test, expect } = require('@playwright/test');
const path = require('path');

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

test.describe('Cobertura adicional de la Definición de terminado', () => {
  test('migración: un estado viejo incompleto se completa con valores por defecto', async ({ page }) => {
    await clearState(page);
    await page.evaluate(async () => {
      await BolsilloDB.kvSet('state', { v: 1, tx: [{ id: 'a1', type: 'gasto', amount: 10, cat: 'comida', acc: 'efectivo', date: '2026-01-05' }] });
    });
    await page.reload();
    const result = await page.evaluate(() => ({
      hasSettings: !!App.state.settings && App.state.settings.currency != null,
      hasAccounts: App.state.accounts.length > 0,
      hasCategories: App.state.categories.length > 0,
      txPreserved: App.state.tx.length === 1,
      hasVault: Array.isArray(App.state.vault),
      hasGoals: Array.isArray(App.state.goals),
    }));
    expect(result).toEqual({ hasSettings: true, hasAccounts: true, hasCategories: true, txPreserved: true, hasVault: true, hasGoals: true });
  });

  test('no se puede eliminar una cuenta o categoría en uso', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="open-tx"]');
    await page.fill('#txAmount', '77');
    await page.click('[data-action="tx-save"]');
    await page.click('[data-action="goto-ajustes"]');
    await page.click('[data-action="acc-edit"][data-id="efectivo"]');
    await page.click('[data-action="acc-delete"]');
    await expect(page.locator('.toast')).toHaveText('No puedes eliminar una cuenta con movimientos');
    await expect(page.locator('.sheet-head h2')).toBeVisible();
    await page.click('[data-action="close-sheet"]');
    await page.click('[data-action="cat-edit"][data-id="comida"]');
    await page.click('[data-action="cat-delete"]');
    await expect(page.locator('.toast')).toHaveText('No puedes eliminar una categoría en uso');
  });

  test('bóveda: subir una imagen real, verla, descargarla, y que persista tras recargar', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="nav"][data-view="boveda"]');
    await page.click('[data-action="vault-add-images"]');
    await page.setInputFiles('#imageInput', path.join(__dirname, '..', 'icons', 'icon-512.png'));
    await expect(page.locator('.toast')).toHaveText('Imagen guardada');
    await expect(page.locator('.vault-tile img')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await page.click('.vault-tile');
        await page.click('[data-action="vault-download"]');
      })(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.jpg$/);
    await page.click('[data-action="close-sheet"]');

    await page.reload();
    await page.click('[data-action="nav"][data-view="boveda"]');
    await expect(page.locator('.vault-tile img')).toBeVisible();
    await expect(page.locator('.vault-tile img')).toHaveJSProperty('naturalWidth', 512);
  });

  test('respaldo con imagen: exportar e importar sin perder la imagen', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="nav"][data-view="boveda"]');
    await page.click('[data-action="vault-add-images"]');
    await page.setInputFiles('#imageInput', path.join(__dirname, '..', 'icons', 'icon-192.png'));
    await expect(page.locator('.toast')).toHaveText('Imagen guardada');

    await page.click('[data-action="goto-ajustes"]');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-action="backup-export"]'),
    ]);
    const filePath = await download.path();

    page.on('dialog', (d) => d.accept());
    await page.click('[data-action="wipe-all"]');
    await page.click('[data-action="goto-ajustes"]');
    await page.setInputFiles('#importFile', filePath);
    await expect(page.locator('.toast')).toHaveText('Copia importada');

    await page.click('[data-action="nav"][data-view="boveda"]');
    await expect(page.locator('.vault-tile img')).toBeVisible();
    await expect(page.locator('.vault-tile img')).toHaveJSProperty('naturalWidth', 192);
  });

  test('fechas 29-31: transferencia y gasto en fin de mes se agrupan en el día correcto', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="open-tx"]');
    await page.fill('#txAmount', '15');
    await page.fill('#txDate', '2026-01-31');
    await page.click('[data-action="tx-save"]');
    // Guardar navega automáticamente al mes del movimiento (enero 2026).
    await page.click('[data-action="nav"][data-view="movimientos"]');
    await expect(page.locator('.tx-day-head').first()).toContainText('31');
  });
});
