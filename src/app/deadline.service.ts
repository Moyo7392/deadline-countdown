import { DestroyRef, inject, Injectable, InjectionToken, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  defer,
  distinctUntilChanged,
  map,
  Observable,
  of,
  shareReplay,
  switchMap,
  take,
  timeout,
} from 'rxjs';
import { browserClock, countdownUntil, CountdownClock, readSecondsLeft } from './countdown';

export const DEADLINE_CLOCK = new InjectionToken<CountdownClock>('Deadline clock', {
  providedIn: 'root',
  factory: () => browserClock,
});

@Injectable({ providedIn: 'root' })
export class DeadlineService {
  private readonly http = inject(HttpClient);
  private readonly clock = inject(DEADLINE_CLOCK);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private deadlineMs: number | undefined;

  private readonly updates = defer(() => {
    if (this.deadlineMs !== undefined) return of(this.deadlineMs);
    return this.http.get<unknown>('/api/deadline').pipe(
      timeout(10_000),
      map((body) => {
        const deadline = this.clock.now() + readSecondsLeft(body) * 1000;
        // Cache only a validated fixed deadline, never a relative duration.
        // Store before notifying consumers, including ones that unsubscribe immediately.
        this.deadlineMs = deadline;
        return deadline;
      }),
      take(1),
    );
  }).pipe(
    switchMap((deadline) => countdownUntil(deadline, this.clock).pipe(map(() => deadline))),
    takeUntilDestroyed(this.destroyRef),
    // One request/timer for concurrent consumers; cancel when nobody is listening.
    // Errors reset the shared stream so a later mount can try again.
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly secondsLeft = new Observable<number>((subscriber) =>
    this.zone.runOutsideAngular(() =>
      this.updates
        .pipe(
          // Replayed notifications carry the deadline, not a stale displayed count.
          // A new view gets a fresh value even if the pending timer is delayed.
          map((deadline) => Math.ceil(Math.max(0, deadline - this.clock.now()) / 1000)),
          distinctUntilChanged(),
        )
        .subscribe(subscriber),
    ),
  );
}
