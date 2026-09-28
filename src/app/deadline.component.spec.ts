import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeadlineComponent } from './deadline.component';
import { DEADLINE_CLOCK } from './deadline.service';
import { ManualClock } from '../testing/manual-clock';

describe('DeadlineComponent', () => {
  let http: HttpTestingController;
  let clock: ManualClock;
  beforeEach(() => {
    clock = new ManualClock();
    TestBed.configureTestingModule({
      imports: [DeadlineComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DEADLINE_CLOCK, useValue: clock },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function create() {
    const fixture = TestBed.createComponent(DeadlineComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders loading, fetches once and updates the OnPush view through signals', async () => {
    const fixture = create();
    expect(fixture.nativeElement.textContent).toContain('Loading deadline');
    const request = http.expectOne('/api/deadline');
    expect(request.request.method).toBe('GET');
    request.flush({ secondsLeft: 3 });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Seconds left to deadline: 3');
    clock.fireAt(2000);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Seconds left to deadline: 1');
    clock.fireAt(3000);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Seconds left to deadline: 0');
    expect(clock.pending).toBe(0);
    http.expectNone('/api/deadline');
  });

  it('cancels the timer on destruction', () => {
    const fixture = create();
    http.expectOne('/api/deadline').flush({ secondsLeft: 60 });
    expect(clock.pending).toBe(1);
    fixture.destroy();
    expect(clock.pending).toBe(0);
  });

  it('cancels a pending HTTP request on destruction', () => {
    const fixture = create();
    const request = http.expectOne('/api/deadline');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
    expect(clock.pending).toBe(0);
  });

  it('shows a useful state on HTTP failure', async () => {
    const fixture = create();
    http
      .expectOne('/api/deadline')
      .flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Unable to load',
    );
    expect(clock.pending).toBe(0);
  });

  it('does not display NaN for malformed JSON', async () => {
    const fixture = create();
    http.expectOne('/api/deadline').flush({ secondsLeft: 'tomorrow' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Unable to load');
    expect(clock.pending).toBe(0);
  });

  it.each([0, -5])('renders an expired response %s without scheduling work', async (seconds) => {
    const fixture = create();
    http.expectOne('/api/deadline').flush({ secondsLeft: seconds });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Seconds left to deadline: 0');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(clock.pending).toBe(0);
    http.expectNone('/api/deadline');
  });

  it('does not fetch if destroyed before the browser render callback', () => {
    const fixture = TestBed.createComponent(DeadlineComponent);
    fixture.destroy();
    http.expectNone('/api/deadline');
    expect(clock.pending).toBe(0);
  });

  it('shares one request and timer between views and keeps the surviving view live', async () => {
    const first = create();
    const second = create();
    http.expectOne('/api/deadline').flush({ secondsLeft: 3 });
    await Promise.all([first.whenStable(), second.whenStable()]);
    expect(clock.pending).toBe(1);
    first.destroy();
    clock.fireAt(2000);
    await second.whenStable();
    expect(second.nativeElement.textContent).toContain('Seconds left to deadline: 1');
    expect(clock.pending).toBe(1);
    second.destroy();
    expect(clock.pending).toBe(0);
  });

  it('remounts at the remaining duration without requesting or restarting the deadline', async () => {
    const first = create();
    http.expectOne('/api/deadline').flush({ secondsLeft: 10 });
    first.destroy();
    expect(clock.pending).toBe(0);
    clock.fireAt(4200);
    const second = create();
    await second.whenStable();
    expect(second.nativeElement.textContent).toContain('Seconds left to deadline: 6');
    http.expectNone('/api/deadline');
    expect(clock.pending).toBe(1);
    second.destroy();
  });

  it('bounds a request that never responds', () => {
    vi.useFakeTimers();
    const fixture = create();
    const request = http.expectOne('/api/deadline');
    vi.advanceTimersByTime(10000);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Unable to load');
    expect(request.cancelled).toBe(true);
    expect(clock.pending).toBe(0);
    fixture.destroy();
  });
});
