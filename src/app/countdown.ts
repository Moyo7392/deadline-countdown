import { Observable, of } from 'rxjs';

export interface CountdownClock {
  now(): number;
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export const browserClock: CountdownClock = {
  now: () => performance.now(),
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function readSecondsLeft(response: unknown): number {
  const seconds =
    response !== null && typeof response === 'object'
      ? (response as Record<string, unknown>)['secondsLeft']
      : undefined;
  if (
    typeof seconds !== 'number' ||
    !Number.isFinite(seconds) ||
    Math.abs(seconds) > Number.MAX_SAFE_INTEGER / 1000
  ) {
    throw new Error('Invalid deadline response');
  }
  return Math.max(0, seconds);
}

/**
 * Emit immediately, then at visible second boundaries, ending at zero.
 * Hidden pages do no timer work; returning emits the current value immediately.
 */
export function countdown(
  seconds: number,
  clock: CountdownClock = browserClock,
  visibility: Observable<boolean> = of(true),
): Observable<number> {
  return new Observable<number>((subscriber) => {
    const deadline = clock.now() + readSecondsLeft({ secondsLeft: seconds }) * 1000;
    let handle: unknown;
    let previous: number | undefined;
    let visible = false;
    const cancelPending = () => {
      clock.cancel(handle);
      handle = undefined;
    };

    const tick = () => {
      cancelPending();
      // Derive the value from elapsed time; missed callbacks must not add time.
      const remainingMs = Math.max(0, deadline - clock.now());
      const remaining = Math.ceil(remainingMs / 1000);
      if (remaining !== previous) {
        previous = remaining;
        subscriber.next(remaining);
      }
      if (remaining === 0) {
        subscriber.complete();
      } else if (visible && !subscriber.closed) {
        // A fractional initial value should change at its actual boundary.
        const untilNextSecond = remainingMs - (remaining - 1) * 1000;
        handle = clock.schedule(tick, Math.max(1, untilNextSecond));
      }
    };

    tick();
    // Subscribe only while live: an expired deadline needs no event listener.
    if (subscriber.closed) return cancelPending;
    const visibilitySubscription = visibility.subscribe({
      next: (isVisible) => {
        visible = isVisible;
        if (visible) tick();
        else cancelPending();
      },
      error: (error) => subscriber.error(error),
    });
    return () => {
      cancelPending();
      visibilitySubscription.unsubscribe();
    };
  });
}
