/**
 * Setup for jsdom webview/component tests.
 *
 * - Registers @testing-library/jest-dom matchers.
 * - Installs a mock window.acquireVsCodeApi so src/webview/vscode-api.ts
 *   returns a spyable shim instead of falling back to its console-log stub.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

export interface MockVsCodeApi {
  postMessage: ReturnType<typeof vi.fn>;
  getState: ReturnType<typeof vi.fn>;
  setState: ReturnType<typeof vi.fn>;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => MockVsCodeApi;
    __mockVsCodeApi?: MockVsCodeApi;
  }
}

function createMockVsCodeApi(): MockVsCodeApi {
  const state: { value: unknown } = { value: null };
  return {
    postMessage: vi.fn(),
    getState: vi.fn(() => state.value),
    setState: vi.fn((next: unknown) => {
      state.value = next;
    }),
  };
}

beforeEach(() => {
  const api = createMockVsCodeApi();
  window.__mockVsCodeApi = api;
  window.acquireVsCodeApi = () => api;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window.__mockVsCodeApi;
  delete window.acquireVsCodeApi;
});
