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

const VIEWS = ['inicio', 'movimientos', 'presupuesto', 'boveda', 'ajustes'];

test.describe('Verificación adversarial', () => {
  test('capturas claro y oscuro de cada vista, sin scroll horizontal a 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await clearState(page);
    await page.click('[data-action="goto-ajustes"]');
    await page.click('[data-action="load-sample"]');

    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const view of VIEWS) {
        if (view === 'ajustes') await page.click('[data-action="goto-ajustes"]');
        else await page.click(`[data-action="nav"][data-view="${view}"]`);
        await page.waitForTimeout(120);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        expect(overflow, `scroll horizontal en ${view} (${scheme})`).toBe(false);
        await page.screenshot({ path: `test-results/shot-${view}-${scheme}.png`, fullPage: true });
      }
    }
  });

  test('monto gigante y texto largo no rompen el layout', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await clearState(page);
    await page.click('[data-action="open-tx"]');
    await page.fill('#txAmount', '99999999.99');
    await page.fill('#txNote', 'Una nota extremadamente larga que podría desbordar el contenedor de la tarjeta de movimiento si no se maneja bien el overflow del texto');
    await page.click('[data-action="tx-save"]');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
    await page.click('[data-action="nav"][data-view="movimientos"]');
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow2).toBe(false);
  });

  test('mes sin movimientos muestra estados vacíos coherentes', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="open-tx"]');
    await page.fill('#txAmount', '100');
    await page.click('[data-action="tx-save"]');
    await page.click('[data-action="month-next"]');
    await expect(page.locator('.balance-sub .stat.expense .n')).toHaveText('$0.00');
    await page.click('[data-action="nav"][data-view="movimientos"]');
    await expect(page.locator('.empty-state')).toBeVisible();
    await page.click('[data-action="nav"][data-view="presupuesto"]');
    await expect(page.locator('.totals-row .card').first()).toContainText('$0.00');
  });

  test('recurrente mensual con día 31 no se corre a otro mes', async ({ page }) => {
    await clearState(page);
    const result = await page.evaluate(() => {
      const rec = { next: '2026-01-31', freq: 'mensual', day: 31 };
      const n1 = BolsilloState.nextRecurringDate(rec);
      rec.next = n1;
      const n2 = BolsilloState.nextRecurringDate(rec);
      rec.next = n2;
      const n3 = BolsilloState.nextRecurringDate(rec);
      return [n1, n2, n3];
    });
    expect(result[0]).toBe('2026-02-28');
    expect(result[1]).toBe('2026-03-31');
    expect(result[2]).toBe('2026-04-30');
  });

  test('totales de Inicio y Movimientos coinciden para el mismo mes', async ({ page }) => {
    await clearState(page);
    await page.click('[data-action="goto-ajustes"]');
    await page.click('[data-action="load-sample"]');
    await page.click('[data-action="nav"][data-view="inicio"]');
    const inicioExpense = await page.locator('.balance-sub .stat.expense .n').textContent();
    const inicioIncome = await page.locator('.balance-sub .stat.income .n').textContent();
    await page.click('[data-action="nav"][data-view="movimientos"]');
    const movExpense = await page.locator('.totals-row .card').nth(1).locator('.n').textContent();
    const movIncome = await page.locator('.totals-row .card').nth(0).locator('.n').textContent();
    expect(movExpense.trim()).toBe(inicioExpense.trim());
    expect(movIncome.trim()).toBe(inicioIncome.trim());
  });

  test('parser de montos acepta los tres formatos', async ({ page }) => {
    await clearState(page);
    const results = await page.evaluate(() => [
      Fmt.parseAmount('1,234.50'),
      Fmt.parseAmount('1.234,50'),
      Fmt.parseAmount('1234,5'),
    ]);
    expect(results).toEqual([1234.5, 1234.5, 1234.5]);
  });

  test('capturas de viewport en reposo (sin fullPage) para inspección visual', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await clearState(page);
    await page.click('[data-action="goto-ajustes"]');
    await page.click('[data-action="load-sample"]');
    await page.waitForTimeout(2300); // deja que el toast desaparezca antes de capturar
    await page.screenshot({ path: 'test-results/viewport-ajustes.png' });
    await page.click('[data-action="nav"][data-view="inicio"]');
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'test-results/viewport-inicio.png' });
    await page.evaluate(() => document.scrollingElement.scrollTo(0, 500));
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'test-results/viewport-inicio-scrolled.png' });
  });

  test('funciona sin red tras la primera visita (service worker)', async ({ page, context }) => {
    await clearState(page);
    await page.waitForTimeout(500);
    await page.evaluate(async () => {
      if (navigator.serviceWorker) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.active) return;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#topbarTitle')).toHaveText('Bolsillo');
    await context.setOffline(false);
  });
});
