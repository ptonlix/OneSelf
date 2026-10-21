export type { Clock } from "@oneself/ports";
import type { Clock } from "@oneself/ports";

/** Test and process clock. Retention math stays in `@oneself/domain`. */
export class ManualClock implements Clock {
  #now: Date;

  constructor(now: Date = new Date("2026-10-20T00:00:00.000Z")) {
    this.#now = new Date(now.getTime());
  }

  now(): Date {
    return new Date(this.#now.getTime());
  }

  set(now: Date): void {
    this.#now = new Date(now.getTime());
  }

  iso(): string {
    return this.now().toISOString();
  }
}

/** Wall clock for the process entry. Tests keep using {@link ManualClock}. */
export class SystemClock extends ManualClock {
  override now(): Date {
    return new Date();
  }
}
