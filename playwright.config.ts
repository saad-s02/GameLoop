import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  reporter: "list",
  use: {
    baseURL,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Only spin up a server ourselves when the caller hasn't pointed us at an
  // already-running one via PLAYWRIGHT_BASE_URL.
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: "npm run start",
          port: PORT,
          reuseExistingServer: false,
          env: {
            ACCESS_CODE: "letmein",
            ACCESS_COOKIE_SECRET: "e2e-secret",
            // The demo-smoke spec must make zero real model calls. /plan?demo=1
            // already guarantees that for the planner (demo chips skip
            // extraction, and the explanation stream is replaced by a
            // deterministic fallback narrative). /api/relive's recap step,
            // however, always attempts a live Anthropic call and only falls
            // back to the deterministic recap on failure -- so this key is
            // deliberately set to an invalid value to force that fallback
            // every time, regardless of whatever ANTHROPIC_API_KEY happens to
            // be set in the invoking shell or in .env.local (Next.js will not
            // let .env.local override a variable already present in
            // process.env, so simply leaving this unset would not be
            // sufficient to guarantee determinism -- an explicitly invalid
            // value is). See task-15-report.md for the one known gap this
            // surfaces in the deterministic recap fallback.
            ANTHROPIC_API_KEY: "sk-ant-invalid-e2e-placeholder",
          },
        },
      }),
});
