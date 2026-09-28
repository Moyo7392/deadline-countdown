import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEADLINE_CLOCK, DeadlineComponent } from './deadline.component';
import { ManualClock } from '../testing/manual-clock';

describe('DeadlineComponent', () => {
  let http: HttpTestingController;
  let clock: ManualClock;
  beforeEach(() => {
    clock = new ManualClock();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
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
    vi.restoreAllMocks();
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

  it('pauses hidden work and refreshes the view on return without another HTTP request', async () => {
    const fixture = create();
    const remove = vi.spyOn(document, 'removeEventListener');
    http.expectOne('/api/deadline').flush({ secondsLeft: 10 });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clock.pending).toBe(0);
    clock.fireAt(4500);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Seconds left to deadline: 6');
    http.expectNone('/api/deadline');
    fixture.destroy();
    expect(remove.mock.calls.some((call) => call[0] === 'visibilitychange')).toBe(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clock.pending).toBe(0);
  });

  it('offers an explicit retry, prevents duplicate requests, and recovers', async () => {
    const fixture = create();
    http
      .expectOne('/api/deadline')
      .flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Try again');
    button.click();
    button.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Loading deadline');
    const retry = http.expectOne('/api/deadline');
    retry.flush({ secondsLeft: 2 });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Seconds left to deadline: 2');
    clock.fireAt(2000);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Seconds left to deadline: 0');
    expect(clock.pending).toBe(0);
  });

  it('can retry after repeated errors and cancels an in-flight retry on destroy', async () => {
    const fixture = create();
    for (let attempt = 0; attempt < 2; attempt++) {
      http.expectOne('/api/deadline').flush({ secondsLeft: 'invalid' });
      await fixture.whenStable();
      (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    }
    const request = http.expectOne('/api/deadline');
    fixture.destroy();
    expect(request.cancelled).toBe(true);
    expect(clock.pending).toBe(0);
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
