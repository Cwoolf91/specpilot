/**
 * Progress reporting interface used by core functions.
 * CLI uses ConsoleProgressReporter, extension uses WebviewProgressReporter.
 */

export interface ProgressReporter {
  report(message: string, increment?: number): void;
  section(name: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export class ConsoleProgressReporter implements ProgressReporter {
  report(message: string): void {
    console.log(message);
  }

  section(name: string): void {
    console.log(`\n${name}`);
  }

  warn(message: string): void {
    console.log(`  Warning: ${message}`);
  }

  error(message: string): void {
    console.error(`  Error: ${message}`);
  }
}
