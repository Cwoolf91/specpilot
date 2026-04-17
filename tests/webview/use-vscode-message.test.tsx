import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useVsCodeMessage, sendMessage } from "../../src/webview/hooks/useVsCodeMessage.js";
import vscode from "../../src/webview/vscode-api.js";

function Harness({ onMsg }: { onMsg: (m: unknown) => void }) {
  useVsCodeMessage(onMsg as (m: { type: string }) => void);
  return null;
}

describe("useVsCodeMessage", () => {
  it("invokes the handler for well-formed messages", () => {
    const handler = vi.fn();
    render(<Harness onMsg={handler} />);

    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { type: "hello", foo: 1 } }));
    });
    expect(handler).toHaveBeenCalledWith({ type: "hello", foo: 1 });
  });

  it("ignores events that do not have a string type", () => {
    const handler = vi.fn();
    render(<Harness onMsg={handler} />);

    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { nope: true } }));
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("removes the listener on unmount", () => {
    const handler = vi.fn();
    const { unmount } = render(<Harness onMsg={handler} />);
    unmount();

    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { type: "x" } }));
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("sendMessage", () => {
  it("posts a message to the VS Code API with type + payload", () => {
    const spy = vi.spyOn(vscode, "postMessage");
    sendMessage("doThing", { id: 42 });
    expect(spy).toHaveBeenCalledWith({ type: "doThing", id: 42 });
  });

  it("works without a payload", () => {
    const spy = vi.spyOn(vscode, "postMessage");
    sendMessage("ping");
    expect(spy).toHaveBeenCalledWith({ type: "ping" });
  });
});
