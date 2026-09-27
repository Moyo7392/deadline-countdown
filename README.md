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
every second is unnecessary. Each mounted component makes one request. Multiple
simultaneous instances intentionally remain independent; a shared deadline
service would be appropriate if the host needs many copies of this widget.

**Elapsed time, not callback count.** A callback arriving four seconds late must
not subtract just one second. The observable records a local deadline with
`performance.now()` and recomputes the remaining duration at each callback. It
uses `ceil`, so any positive fraction displays at least one second, and clamps
expired values to zero. The next timeout is aligned to the next display boundary;
there is at most one pending timeout and no timer after expiry.

**Keep Angular work small.** Scheduling occurs outside Angular's zone. Only a
changed displayed number is emitted; a signal updates the `OnPush` view. There is
no animation-frame loop and no template method doing repeated arithmetic.
`takeUntilDestroyed` tears down the entire HTTP/countdown chain, including a
pending request. Browser-only startup via `afterNextRender` avoids creating a
timer during server rendering; the server renders the loading state.

**Failure is distinct from expiry.** HTTP errors, a ten-second request timeout,
and invalid payloads show an error rather than a misleading zero. A failed
request is not retried automatically; a host can add a deliberate retry action
if its UX requires one. Negative finite durations mean already expired.

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
