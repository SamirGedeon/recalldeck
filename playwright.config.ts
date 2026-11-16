import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./apps/web/tests",
  workers: 1,
  use: { baseURL: "http://localhost:5178", headless: true },
  webServer: [
    {
      command:
        "APP_ORIGIN=http://localhost:5178 DB_PATH=var/e2e.sqlite PORT=8000 npm run start",
      url: "http://localhost:8000/api/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev:web",
      url: "http://localhost:5178",
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
