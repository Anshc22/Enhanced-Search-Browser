import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 30000,
  use: { headless: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});


