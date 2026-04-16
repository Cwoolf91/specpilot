/**
 * Detect Next.js page routes from a git branch.
 */

import { execFileSync } from "child_process";

export function detectRoutes(
  vibeRepo: string,
  vibeBranch: string,
  appDir: string
): string[] {
  const routes = detectRoutesInDir(vibeRepo, vibeBranch, appDir);
  // If no routes found and appDir isn't root, the repo may be standalone
  // (app at root rather than under a monorepo subdirectory)
  if (routes.length === 0 && appDir !== ".") {
    return detectRoutesInDir(vibeRepo, vibeBranch, ".");
  }
  return routes;
}

function detectRoutesInDir(
  vibeRepo: string,
  vibeBranch: string,
  appDir: string
): string[] {
  const routes: string[] = [];

  try {
    const appBase = appDir === "." ? "" : appDir;
    const lsArgs = [
      "-C",
      vibeRepo,
      "ls-tree",
      "-r",
      "--name-only",
      vibeBranch,
    ];
    if (appBase) lsArgs.push("--", `${appBase}/`);
    const output = execFileSync("git", lsArgs, { encoding: "utf-8" });

    const pageLines = output
      .split("\n")
      .filter((l) => /page\.(tsx?|jsx?)$/.test(l));

    for (const line of pageLines) {
      let route = line;
      if (appBase) route = route.replace(new RegExp(`^${appBase}/`), "");
      route = route.replace(/^app\//, "");
      route = route.replace(/\([^)]+\)\//g, "");
      route = route.replace(/\/page\.(tsx?|jsx?)$/, "");
      route = "/" + route;
      route = route.replace(/\/+/g, "/");
      if (route !== "/") route = route.replace(/\/$/, "");
      if (route.endsWith(".tsx") || route.endsWith(".ts")) continue;

      routes.push(route);
    }
  } catch {
    // If git ls-tree fails, routes will be empty
  }

  return routes;
}
