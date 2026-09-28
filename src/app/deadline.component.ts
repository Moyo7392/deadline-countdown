import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  InjectionToken,
  NgZone,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, timeout } from 'rxjs';
import { browserClock, countdown, CountdownClock, readSecondsLeft } from './countdown';

export const DEADLINE_CLOCK = new InjectionToken<CountdownClock>('Deadline clock', {
  providedIn: 'root',
  factory: () => browserClock,
});

@Component({
  selector: 'app-deadline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (failed()) {
      <p role="alert">Unable to load the deadline. Please try again later.</p>
    } @else if (secondsLeft() === null) {
      <p>Loading deadline…</p>
    } @else {
      <p>Seconds left to deadline: {{ secondsLeft() }}</p>
    }
  `,
})
export class DeadlineComponent {
  protected readonly secondsLeft = signal<number | null>(null);
  protected readonly failed = signal(false);
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly clock = inject(DEADLINE_CLOCK);

  constructor() {
    // Browser-only startup keeps a perpetual timer out of server rendering.
    afterNextRender(() => {
      this.zone.runOutsideAngular(() => {
        this.http
          .get<unknown>('/api/deadline')
          .pipe(
            timeout(10_000),
            switchMap((body) => countdown(readSecondsLeft(body), this.clock)),
            takeUntilDestroyed(this.destroyRef),
          )
          .subscribe({
            // Signals mark this OnPush view; entering the zone also supports
            // an existing app that still uses Zone.js change detection.
            next: (seconds) => this.zone.run(() => this.secondsLeft.set(seconds)),
            error: () => this.zone.run(() => this.failed.set(true)),
          });
      });
    });
  }
}
