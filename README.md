# Deadline countdown

An Angular component for a fixed deadline returned by `GET /api/deadline` as
`{ "secondsLeft": number }`. It renders `Seconds left to deadline: X`.

## Start here

- [`src/app/deadline.component.ts`](src/app/deadline.component.ts): HTTP request,
  Angular lifecycle, and the template.
- [`src/app/countdown.ts`](src/app/countdown.ts): response validation and a small
  elapsed-time countdown observable.
- The remaining application files are a runnable demo, not required integration code.

## Run

Tested with Node 24.19, Angular 22.2, and the locked dependencies.

```sh
npm ci
npm test
npm run build
```

For the browser demo, use two terminals:

```sh
npm run demo:api
```

```sh
npm start
```

Open http://localhost:4200. The demo server fixes its deadline at startup
(default: 60 seconds); refreshing the page does **not** reset it. Restart the API
or run `DEMO_SECONDS=300 npm run demo:api` for more time.
The demo API binds only to localhost and is not a production backend.

## Copy into an existing Angular app

Copy `deadline.component.ts` and `countdown.ts` into the same folder. Import
`DeadlineComponent` into the consuming standalone component (or an NgModule's
`imports`), add `<app-deadline />`, and ensure the app provides `HttpClient`, for
example with `provideHttpClient()` at bootstrap. Keep the host app's existing
HTTP/interceptor configuration. No router, stylesheet, testing helper, or demo
server needs to be copied.

This is modern **Angular**, not AngularJS. The demo uses Angular 22's default
zoneless setup. `NgZone.runOutsideAngular` / `run` are retained for integration
into apps that use Zone.js. No app-wide change detection configuration is changed
by the component.

## Reviewer notes

**One request, local updates.** The deadline is constant, so polling the backend
every second is unnecessary. Each mounted component makes one initial request; only an explicit retry after failure makes another. Multiple
simultaneous instances intentionally remain independent; a shared deadline
service would be appropriate if the host needs many copies of this widget.

**Elapsed time, not callback count.** A callback arriving four seconds late must
not subtract just one second. The observable records a local deadline with
`performance.now()` and recomputes the remaining duration at each callback. It
uses `ceil`, so any positive fraction displays at least one second, and clamps
expired values to zero. The next timeout is aligned to the next display boundary;
there is at most one pending timeout. Visible countdowns complete at zero with no further timer.

**Keep Angular work small.** Scheduling occurs outside Angular's zone. Only a
changed displayed number is emitted; a signal updates the `OnPush` view. There is
no animation-frame loop and no template method doing repeated arithmetic.
`takeUntilDestroyed` tears down the entire HTTP/countdown chain, including a
pending request. Browser-only startup via `afterNextRender` avoids creating a
timer during server rendering; the server renders the loading state.

**Failure is distinct from expiry.** HTTP errors, a ten-second request timeout,
and invalid payloads show an error rather than a misleading zero. A failed
request is not retried automatically. A keyboard-accessible "Try again" button
starts a new attempt and resets the error/loading state. `exhaustMap` ignores
duplicate clicks while work is active, and errors are caught inside each attempt
so repeated failures do not disable the retry stream. Negative finite durations mean already expired.

**Precision limits of the API.** A relative duration alone does not reveal when
the server measured it. This implementation anchors it at response receipt;
network transit and any server-side rounding limit accuracy. Guessing half a
round-trip does not fix that contract. For tighter synchronization, return the
absolute deadline and a server timestamp, then define a clock-offset policy.
A monotonic clock avoids wall-clock edits; some browsers/platforms pause that
clock during OS sleep. Ordinary delayed/background callbacks are handled, but
strict accuracy across system sleep would need an explicit resynchronization
policy. A browser cannot guarantee a callback every second while suspended.

## Tests

The tests cover visible rendering in Angular's zoneless `TestBed`, single-request
behavior, late callbacks, fractional seconds, expiry, malformed responses,
network failure/timeout, and cleanup before and after the response. A manually
controlled clock deliberately delivers callbacks late, rather than assuming
perfect timer scheduling. The demo build also compiles the real Angular template.

References: [Angular zoneless integration](https://angular.dev/guide/zoneless),
[NgZone](https://angular.dev/api/core/NgZone),
[HTTP configuration](https://angular.dev/api/common/http/provideHttpClient).

## Phase 3 improvements

The first version handled delayed callbacks, but kept scheduling while the page
was hidden. The component now observes the Page Visibility API. Hiding the page
cancels the pending timeout; becoming visible recomputes from the **same** local
deadline immediately. It does not restart the duration or make another HTTP
request. Visibility is an injected observable argument to the pure countdown,
so these cases are deterministic in tests without browser globals in the core.
If the deadline expires while hidden, zero is emitted and the stream completes
on return. Until then, one visibility listener remains, with no periodic work.
This is a display widget, not a background alarm or a server-side expiry check.

The second improvement is recovery after an HTTP error, malformed response, or
request timeout. The explicit retry button avoids forcing a full-page reload and
keeps normal traffic at one request per mounted widget. Destruction still cancels
a pending retry, a countdown timer, and its visibility listener.

Tests now include hidden startup, repeated visibility events, immediate catch-up,
expiry while hidden, listener cleanup, synchronous unsubscribe, repeated request
failures, duplicate retry clicks, and destruction during retry. The suite has
26 tests, including Angular rendering checks. Existing fractional-second and
late-callback tests remain. The production build is checked separately.

I kept the monotonic clock rather than silently using wall time on tab return.
Page visibility is not a reliable detector of every OS sleep, and the relative
API payload still cannot recover exact server time. The precision limits above
remain intentional; solving them correctly needs an agreed backend contract.

Research references:
- [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
  describes visibility events and background timer throttling.
- [MDN performance.now](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now)
  documents monotonic time and platform differences during system sleep.
- [Angular takeUntilDestroyed](https://angular.dev/api/core/rxjs-interop/takeUntilDestroyed)
  covers lifecycle teardown.
- [RxJS exhaustMap](https://rxjs.dev/api/operators/exhaustMap) describes ignoring
  new inner work while the current stream is active.
