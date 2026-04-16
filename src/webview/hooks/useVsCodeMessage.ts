import { useEffect, useCallback } from "react";
import vscode from "../vscode-api";

export type MessageHandler = (message: { type: string; [key: string]: unknown }) => void;

export function useVsCodeMessage(handler: MessageHandler) {
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (typeof event.data?.type !== "string") return;
      handler(event.data);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [handler]);
}

export function sendMessage(type: string, payload?: Record<string, unknown>) {
  vscode.postMessage({ type, ...payload });
}
