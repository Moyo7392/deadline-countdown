import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  NgZone,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DeadlineService } from './deadline.service';

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
  private readonly deadline = inject(DeadlineService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Browser-only startup keeps a perpetual timer out of server rendering.
    afterNextRender(() => {
      this.deadline.secondsLeft.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        // Signals mark this OnPush view; entering the zone also supports
        // an existing app that still uses Zone.js change detection.
        next: (seconds) => this.zone.run(() => this.secondsLeft.set(seconds)),
        error: () => this.zone.run(() => this.failed.set(true)),
      });
    });
  }
}
