/**
 * Browser authentication flow for screenshot capture.
 * Handles SSO login with persistent session caching.
 */

import { existsSync, statSync, rmSync } from "fs";
import { pollUntil } from "../utils.js";
import type { ProgressReporter } from "../progress.js";

const AUTH_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface AuthResult {
  storageStatePath: string | null;
  needsReauth: boolean;
}

export function checkExistingAuth(
  persistentAuthPath: string,
  progress: ProgressReporter
): AuthResult {
  if (existsSync(persistentAuthPath)) {
    const age = Date.now() - statSync(persistentAuthPath).mtimeMs;
    if (age < AUTH_MAX_AGE_MS) {
      progress.report("  Reusing saved auth session (.auth-state.json)");
      return { storageStatePath: persistentAuthPath, needsReauth: false };
    }
    progress.report("  Saved auth session expired — re-authenticating");
  }
  return { storageStatePath: null, needsReauth: true };
}

export async function performBrowserAuth(
  chromium: typeof import("playwright").chromium,
  port: number,
  persistentAuthPath: string,
  progress: ProgressReporter
): Promise<string | null> {
  const headedBrowser = await chromium.launch({ headless: false });
  const headedContext = await headedBrowser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const headedPage = await headedContext.newPage();

  try {
    await headedPage.goto(`http://localhost:${port}`, {
      waitUntil: "networkidle",
      timeout: 15_000,
    });

    const currentUrl = headedPage.url();
    const needsAuth =
      currentUrl.includes("/login") ||
      currentUrl.includes("/auth") ||
      currentUrl.includes("/signin") ||
      currentUrl.includes("/sign-in");

    if (needsAuth) {
      progress.report(
        "\n  *** Please log in using the browser window ***"
      );
      progress.report(
        "  Waiting for authentication (up to 2 minutes)...\n"
      );

      const authSuccess = await pollUntil(
        async () => {
          const url = headedPage.url();
          return (
            !url.includes("/login") &&
            !url.includes("/auth") &&
            !url.includes("/signin") &&
            !url.includes("/sign-in")
          );
        },
        2_000,
        120_000
      );

      if (!authSuccess) {
        progress.report("  Auth timeout — skipping screenshots");
        await headedBrowser.close();
        return null;
      }
      progress.report("  Authentication successful!");
    } else {
      progress.report("  No authentication required");
    }

    await headedContext.storageState({ path: persistentAuthPath });
    progress.report("  Auth session saved to .auth-state.json");
    return persistentAuthPath;
  } finally {
    await headedBrowser.close();
  }
}

export function handleStaleAuth(
  persistentAuthPath: string,
  progress: ProgressReporter
): void {
  if (existsSync(persistentAuthPath)) {
    progress.report(
      "  Saved auth session appears stale — deleting .auth-state.json"
    );
    progress.report("  Re-run the command to re-authenticate.");
    try {
      rmSync(persistentAuthPath);
    } catch {
      /* best effort */
    }
  }
}
