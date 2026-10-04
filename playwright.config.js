const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5000',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: '.venv/bin/python chatbot.py',
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
    },
  },
});
