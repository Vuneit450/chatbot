const fs = require('fs');
const { defineConfig, devices } = require('@playwright/test');

// Portable: PLAYWRIGHT_CHROMIUM_PATH / PYTHON sobreescriben; si no, se usa
// el Chromium preinstalado de este entorno solo si existe (si no,
// Playwright usa el que descarga `npx playwright install chromium`) y el
// Python del .venv si existe (si no, python3 del PATH).
const PRE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const chromium = process.env.PLAYWRIGHT_CHROMIUM_PATH || (fs.existsSync(PRE) ? PRE : undefined);
const python = process.env.PYTHON || (fs.existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5000',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: chromium,
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `${python} chatbot.py`,
    url: 'http://127.0.0.1:5000/',
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
    env: {
      // Apunta a un puerto sin nada escuchando: toda compra de la suite
      // ejercita el aviso a Bolsillo con una falla real de red, para
      // comprobar que el checkout nunca se rompe por eso (ver
      // commerce._notificar_bolsillo).
      BOLSILLO_SYNC_URL: 'http://127.0.0.1:1/api/income',
      BOLSILLO_SYNC_KEY: 'llave-de-prueba',
      // La suite manda todo desde 127.0.0.1: sin esto toparía con los
      // límites por IP pensados para producción.
      RATE_LIMIT_MESSAGES: '100000',
      RATE_LIMIT_AUTH: '100000',
    },
  },
});
