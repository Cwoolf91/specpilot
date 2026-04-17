import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("smoke test — vitest jsdom env", () => {
  it("renders React", () => {
    render(<h1>hi</h1>);
    expect(screen.getByText("hi")).toBeInTheDocument();
  });

  it("has window.acquireVsCodeApi shim", () => {
    const api = window.acquireVsCodeApi?.();
    expect(api).toBeDefined();
    api?.postMessage({ type: "test" });
    expect(api?.postMessage).toHaveBeenCalledWith({ type: "test" });
  });
});
