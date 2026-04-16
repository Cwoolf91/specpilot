interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vscode: VsCodeApi = (window as any).acquireVsCodeApi
  ? (window as any).acquireVsCodeApi()
  : {
      // Fallback for dev/testing outside VS Code
      postMessage: (msg: unknown) => console.log("[vscode mock]", msg),
      getState: () => null,
      setState: () => {},
    };

export default vscode;
