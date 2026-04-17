import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConsoleProgressReporter } from "../../src/core/progress.js";

describe("ConsoleProgressReporter", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let reporter: ConsoleProgressReporter;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    reporter = new ConsoleProgressReporter();
  });

  it("report() forwards message to console.log", () => {
    reporter.report("hello");
    expect(logSpy).toHaveBeenCalledWith("hello");
  });

  it("section() prefixes with newline", () => {
    reporter.section("Setup");
    expect(logSpy).toHaveBeenCalledWith("\nSetup");
  });

  it("warn() uses console.log and prefixes 'Warning:'", () => {
    reporter.warn("slow");
    expect(logSpy).toHaveBeenCalledWith("  Warning: slow");
  });

  it("error() routes to console.error and prefixes 'Error:'", () => {
    reporter.error("boom");
    expect(errSpy).toHaveBeenCalledWith("  Error: boom");
  });
});
