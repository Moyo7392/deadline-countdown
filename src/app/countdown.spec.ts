import { describe, expect, it } from 'vitest';
import { BehaviorSubject, Observable, take } from 'rxjs';
import { countdown, readSecondsLeft } from './countdown';
import { ManualClock } from '../testing/manual-clock';

describe('countdown', () => {
  it('emits immediately, updates each second and stops at zero', () => {
    const clock = new ManualClock();
    const values: number[] = [];
    let complete = false;
    countdown(3, clock).subscribe({
      next: (n) => values.push(n),
      complete: () => (complete = true),
    });
    expect(values).toEqual([3]);
    clock.fireAt(1000);
    clock.fireAt(2000);
    clock.fireAt(3000);
    clock.fireAt(9000);
    expect(values).toEqual([3, 2, 1, 0]);
    expect(complete).toBe(true);
    expect(clock.pending).toBe(0);
  });

  it('catches up after a delayed callback instead of decrementing by one', () => {
    const clock = new ManualClock();
    const values: number[] = [];
    countdown(10, clock).subscribe((n) => values.push(n));
    clock.fireAt(4200);
    clock.fireAt(10001);
    expect(values).toEqual([10, 6, 0]);
    expect(clock.pending).toBe(0);
  });

  it('handles fractional seconds at their actual display boundaries', () => {
    const clock = new ManualClock();
    const values: number[] = [];
    countdown(1.25, clock).subscribe((n) => values.push(n));
    clock.fireAt(249);
    expect(values).toEqual([2]);
    clock.fireAt(250);
    clock.fireAt(1249);
    expect(values).toEqual([2, 1]);
    clock.fireAt(1250);
    expect(values).toEqual([2, 1, 0]);
  });

  it('cancels pending work on unsubscribe', () => {
    const clock = new ManualClock();
    const values: number[] = [];
    const subscription = countdown(60, clock).subscribe((n) => values.push(n));
    subscription.unsubscribe();
    clock.fireAt(10000);
    expect(clock.pending).toBe(0);
    expect(values).toEqual([60]);
  });

  it.each([0, -1])('completes expired deadline %s without a timer', (seconds) => {
    const clock = new ManualClock();
    const values: number[] = [];
    const subscription = countdown(seconds, clock).subscribe((n) => values.push(n));
    expect(values).toEqual([0]);
    expect(subscription.closed).toBe(true);
    expect(clock.pending).toBe(0);
  });

  it('suspends hidden-tab timers and catches up immediately on return', () => {
    const clock = new ManualClock();
    const visibility = new BehaviorSubject(true);
    const values: number[] = [];
    const subscription = countdown(10, clock, visibility).subscribe((n) => values.push(n));
    visibility.next(false);
    expect(clock.pending).toBe(0);
    clock.fireAt(4200);
    expect(values).toEqual([10]);
    visibility.next(true);
    expect(values).toEqual([10, 6]);
    expect(clock.pending).toBe(1);
    visibility.next(true);
    expect(clock.pending).toBe(1);
    expect(values).toEqual([10, 6]);
    subscription.unsubscribe();
    expect(visibility.observed).toBe(false);
    expect(clock.pending).toBe(0);
  });

  it('starts hidden without a timer and expires on return without restarting', () => {
    const clock = new ManualClock();
    const visibility = new BehaviorSubject(false);
    const values: number[] = [];
    const subscription = countdown(3, clock, visibility).subscribe((n) => values.push(n));
    expect(values).toEqual([3]);
    expect(clock.pending).toBe(0);
    clock.fireAt(10000);
    visibility.next(true);
    expect(values).toEqual([3, 0]);
    expect(subscription.closed).toBe(true);
    expect(visibility.observed).toBe(false);
    expect(clock.pending).toBe(0);
    visibility.next(true);
    expect(values).toEqual([3, 0]);
  });

  it('does not attach visibility work after synchronous completion', () => {
    const clock = new ManualClock();
    let listeners = 0;
    const visibility = new Observable<boolean>(() => {
      listeners++;
    });
    countdown(0, clock, visibility).subscribe();
    countdown(10, clock, visibility).pipe(take(1)).subscribe();
    expect(listeners).toBe(0);
    expect(clock.pending).toBe(0);
  });

  it('does not depend on wall-clock changes', () => {
    const clock = new ManualClock();
    const values: number[] = [];
    countdown(2, clock).subscribe((n) => values.push(n));
    // No Date.now input: only the injected monotonic clock controls elapsed time.
    clock.fireAt(1000);
    expect(values).toEqual([2, 1]);
  });
});

describe('response validation', () => {
  it.each([
    null,
    {},
    { secondsLeft: '3' },
    { secondsLeft: NaN },
    { secondsLeft: Infinity },
    { secondsLeft: 1e100 },
  ])('rejects malformed response %j', (body) => {
    expect(() => readSecondsLeft(body)).toThrow('Invalid deadline response');
  });
  it('accepts finite fractions and clamps expired deadlines', () => {
    expect(readSecondsLeft({ secondsLeft: 2.5 })).toBe(2.5);
    expect(readSecondsLeft({ secondsLeft: -2 })).toBe(0);
  });
});
