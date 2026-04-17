import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "child_process";
import { detectRoutes } from "../../src/core/diff/route-detection.js";

const mockExec = vi.mocked(execFileSync);

beforeEach(() => {
  mockExec.mockReset();
});

describe("detectRoutes", () => {
  it("parses a simple Next.js app/ tree", () => {
    mockExec.mockReturnValue(
      [
        "apps/web/app/search/page.tsx",
        "apps/web/app/profile/settings/page.tsx",
        "apps/web/app/ignored.ts",
      ].join("\n") as unknown as Buffer,
    );
    const routes = detectRoutes("/repo", "dev", "apps/web");
    expect(routes).toEqual(["/search", "/profile/settings"]);
  });

  it("strips route group segments like (marketing)", () => {
    mockExec.mockReturnValue(
      "apps/web/app/(marketing)/about/page.tsx" as unknown as Buffer,
    );
    const routes = detectRoutes("/repo", "dev", "apps/web");
    expect(routes).toEqual(["/about"]);
  });

  it("handles .jsx extension", () => {
    mockExec.mockReturnValue(
      "apps/web/app/home/page.jsx" as unknown as Buffer,
    );
    const routes = detectRoutes("/repo", "dev", "apps/web");
    expect(routes).toEqual(["/home"]);
  });

  it("returns empty array and falls back to root when appDir yields nothing", () => {
    mockExec
      .mockReturnValueOnce("" as unknown as Buffer) // first call: appDir=apps/web
      .mockReturnValueOnce("app/search/page.tsx" as unknown as Buffer); // fallback: root
    const routes = detectRoutes("/repo", "dev", "apps/web");
    expect(routes).toEqual(["/search"]);
    expect(mockExec).toHaveBeenCalledTimes(2);
  });

  it("returns empty array when git ls-tree fails", () => {
    mockExec.mockImplementation(() => {
      throw new Error("fatal: not a git repo");
    });
    const routes = detectRoutes("/repo", "dev", "apps/web");
    expect(routes).toEqual([]);
  });

  it("does not fall back when appDir is '.'", () => {
    mockExec.mockReturnValue("" as unknown as Buffer);
    const routes = detectRoutes("/repo", "dev", ".");
    expect(routes).toEqual([]);
    expect(mockExec).toHaveBeenCalledTimes(1);
  });

  it("collapses repeated slashes", () => {
    mockExec.mockReturnValue(
      "app//nested/page.tsx" as unknown as Buffer,
    );
    const routes = detectRoutes("/repo", "dev", ".");
    expect(routes).toEqual(["/nested"]);
  });
});
