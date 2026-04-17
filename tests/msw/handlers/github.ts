/**
 * MSW handlers for the GitHub REST API — mocks the endpoints used by the
 * extension's update-checker (latest release lookup, asset download).
 */
import { http, HttpResponse } from "msw";

export interface MockRelease {
  tag_name: string;
  name: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size?: number;
  }>;
}

export const DEFAULT_LATEST_RELEASE: MockRelease = {
  tag_name: "v9.9.9",
  name: "v9.9.9",
  body: "Mock release notes",
  assets: [
    {
      name: "specpilot-9.9.9.vsix",
      browser_download_url:
        "https://github.com/example/specpilot/releases/download/v9.9.9/specpilot-9.9.9.vsix",
      size: 1024,
    },
  ],
};

let latestReleaseOverride: MockRelease | null = null;

export function setLatestRelease(release: MockRelease | null): void {
  latestReleaseOverride = release;
}

export const githubHandlers = [
  http.get(/https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\/latest/, () => {
    const release = latestReleaseOverride ?? DEFAULT_LATEST_RELEASE;
    return HttpResponse.json(release);
  }),

  http.get(/https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/releases/, () => {
    const release = latestReleaseOverride ?? DEFAULT_LATEST_RELEASE;
    return HttpResponse.json([release]);
  }),

  http.get(
    /https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/.+\.vsix$/,
    () => new HttpResponse(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), { status: 200 }),
  ),
];
