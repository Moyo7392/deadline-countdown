import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { take } from 'rxjs';
import { DEADLINE_CLOCK, DeadlineService } from './deadline.service';
import { ManualClock } from '../testing/manual-clock';

describe('DeadlineService', () => {
  let service: DeadlineService;
  let http: HttpTestingController;
  let clock: ManualClock;
  beforeEach(() => {
    clock = new ManualClock();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DEADLINE_CLOCK, useValue: clock },
      ],
    });
    service = TestBed.inject(DeadlineService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('is lazy and shares one request and one timer among 100 consumers', () => {
    http.expectNone('/api/deadline');
    const values = Array.from({ length: 100 }, () => [] as number[]);
    const subscriptions = values.map((list) => service.secondsLeft.subscribe((n) => list.push(n)));
    http.expectOne('/api/deadline').flush({ secondsLeft: 3 });
    expect(clock.pending).toBe(1);
    clock.fireAt(1000);
    subscriptions[0].unsubscribe();
    clock.fireAt(3000);
    expect(values[0]).toEqual([3, 2]);
    for (const list of values.slice(1)) expect(list).toEqual([3, 2, 0]);
    expect(subscriptions.every((s) => s.closed)).toBe(true);
    expect(clock.pending).toBe(0);
    http.expectNone('/api/deadline');
  });

  it('keeps a pending request until its last consumer unsubscribes', () => {
    const first = service.secondsLeft.subscribe();
    const second = service.secondsLeft.subscribe();
    const request = http.expectOne('/api/deadline');
    first.unsubscribe();
    expect(request.cancelled).toBe(false);
    second.unsubscribe();
    expect(request.cancelled).toBe(true);
    expect(clock.pending).toBe(0);
    const values: number[] = [];
    service.secondsLeft.subscribe((n) => values.push(n));
    http.expectOne('/api/deadline').flush({ secondsLeft: 0 });
    expect(values).toEqual([0]);
  });

  it('stops when unused and resumes at the same deadline without another request', () => {
    const first = service.secondsLeft.subscribe();
    http.expectOne('/api/deadline').flush({ secondsLeft: 10 });
    first.unsubscribe();
    expect(clock.pending).toBe(0);
    clock.fireAt(4200);
    const values: number[] = [];
    const second = service.secondsLeft.subscribe((n) => values.push(n));
    expect(values).toEqual([6]);
    expect(clock.pending).toBe(1);
    clock.fireAt(10000);
    expect(values).toEqual([6, 0]);
    expect(second.closed).toBe(true);
    expect(clock.pending).toBe(0);
    http.expectNone('/api/deadline');
  });

  it('computes a fresh initial value for a late joiner even when callbacks are delayed', () => {
    const first = service.secondsLeft.subscribe();
    http.expectOne('/api/deadline').flush({ secondsLeft: 10 });
    // Move time forward without delivering the existing timer callback.
    clock.time = 4200;
    const values: number[] = [];
    const second = service.secondsLeft.subscribe((n) => values.push(n));
    expect(values).toEqual([6]);
    expect(clock.pending).toBe(1);
    clock.fireAt(4500);
    expect(values).toEqual([6]);
    clock.fireAt(5000);
    expect(values).toEqual([6, 5]);
    first.unsubscribe();
    second.unsubscribe();
    expect(clock.pending).toBe(0);
  });

  it('retains a validated deadline when the first consumer unsubscribes synchronously', () => {
    service.secondsLeft.pipe(take(1)).subscribe();
    http.expectOne('/api/deadline').flush({ secondsLeft: 2 });
    expect(clock.pending).toBe(0);
    clock.time = 1000;
    const values: number[] = [];
    const second = service.secondsLeft.subscribe((n) => values.push(n));
    expect(values).toEqual([1]);
    http.expectNone('/api/deadline');
    second.unsubscribe();
    expect(clock.pending).toBe(0);
  });

  it.each([false, true])(
    'returns zero after expiry without timer or HTTP work (observed expiry: %s)',
    (observed) => {
      const subscription = service.secondsLeft.subscribe();
      http.expectOne('/api/deadline').flush({ secondsLeft: 2 });
      if (observed) clock.fireAt(2000);
      else subscription.unsubscribe();
      clock.time = 10000;
      const values: number[] = [];
      const later = service.secondsLeft.subscribe((n) => values.push(n));
      expect(values).toEqual([0]);
      expect(later.closed).toBe(true);
      expect(clock.pending).toBe(0);
      http.expectNone('/api/deadline');
    },
  );

  it.each(['network', 'invalid'])('does not cache a failed %s response', (kind) => {
    const errors: unknown[] = [];
    service.secondsLeft.subscribe({ error: (e) => errors.push(e) });
    const request = http.expectOne('/api/deadline');
    if (kind === 'network') request.flush('Error', { status: 503, statusText: 'Unavailable' });
    else request.flush({ secondsLeft: 'bad' });
    expect(errors).toHaveLength(1);
    expect(clock.pending).toBe(0);
    const values: number[] = [];
    service.secondsLeft.subscribe((n) => values.push(n));
    http.expectOne('/api/deadline').flush({ secondsLeft: 0 });
    expect(values).toEqual([0]);
  });

  it('shares a timeout failure and permits a later subscription to try again', () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    const first = service.secondsLeft.subscribe({ error: (e) => errors.push(e) });
    const second = service.secondsLeft.subscribe({ error: (e) => errors.push(e) });
    const request = http.expectOne('/api/deadline');
    vi.advanceTimersByTime(10000);
    expect(errors).toHaveLength(2);
    expect(first.closed && second.closed).toBe(true);
    expect(request.cancelled).toBe(true);
    service.secondsLeft.subscribe();
    http.expectOne('/api/deadline').flush({ secondsLeft: 0 });
  });

  it('anchors the relative duration at receipt, not request start', () => {
    const values: number[] = [];
    const subscription = service.secondsLeft.subscribe((n) => values.push(n));
    const request = http.expectOne('/api/deadline');
    clock.time = 5000;
    request.flush({ secondsLeft: 2 });
    expect(values).toEqual([2]);
    clock.fireAt(7000);
    expect(values).toEqual([2, 0]);
    expect(subscription.closed).toBe(true);
  });

  it('tears down even a direct consumer when the owning injector is destroyed', () => {
    const subscription = service.secondsLeft.subscribe();
    http.expectOne('/api/deadline').flush({ secondsLeft: 60 });
    expect(clock.pending).toBe(1);
    TestBed.resetTestingModule();
    expect(subscription.closed).toBe(true);
    expect(clock.pending).toBe(0);
  });
});
