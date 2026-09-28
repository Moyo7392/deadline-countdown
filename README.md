# Deadline countdown

An Angular component that fetches `GET /api/deadline`, reads
`{ "secondsLeft": number }`, and displays `Seconds left to deadline: X`.

## Run

Tested with Node 24.19, Angular 22.2, and the locked dependencies.

```sh
npm ci
npm test
npm run build
```

For the demo, run `npm run demo:api` and `npm start` in separate terminals, then
open http://localhost:4200. The API fixes its deadline when its process starts.
Refreshing the page does not reset it. Use `DEMO_SECONDS=300 npm run demo:api`
for a longer countdown. The demo API binds only to localhost.

## Integration

Copy [`deadline.component.ts`](src/app/deadline.component.ts) and
[`countdown.ts`](src/app/countdown.ts) into the same folder in a modern Angular
app. Add `DeadlineComponent` to the consuming standalone component's imports,
or to an NgModule's imports. Use `<app-deadline />` in its template. The host
must provide `HttpClient`, for example through `provideHttpClient()`.
The countdown function is an ordinary TypeScript import, not an Angular module.

The demo uses Angular 22's default zoneless configuration. The component keeps
`NgZone.runOutsideAngular` and `run` for hosts using Zone.js. It does not change
the host's application-wide configuration. Older Angular versions may require
API changes; this is not AngularJS code.

## How it works

Fetch once. Convert the response into a local deadline using `performance.now()`.
At each callback, calculate the remaining duration and display its ceiling in
seconds. Schedule one timeout for the next displayed-second boundary.

For example, 1.25 seconds initially displays 2, changes to 1 after 250 ms, and
reaches 0 after another second. A callback arriving late skips missed values
rather than extending the countdown. Only changed values are emitted. There is
at most one pending timeout per subscription and none after expiry or cleanup.
Each mounted component makes one request and maintains its own countdown.

Timer setup occurs outside Angular's zone. A signal updates the OnPush view.
`takeUntilDestroyed` cancels the request or timer when the component is destroyed.
`afterNextRender` defers startup until browser rendering. HTTP errors, invalid
payloads, and a ten-second request timeout show an error rather than a false zero.
Negative finite durations represent an expired deadline.

## Review decisions

The original timer design already fit the problem. During review, a retry button
and visibility-based suspension were tried, then removed. Retry added an
unrequested interaction, and visibility suspension changed the emission behavior
while hidden. Neither was necessary to answer the question. Those commits remain
in the history so the reasoning and changes can be reviewed.

The final implementation retains the original one-request design and strengthens
its tests. The 27 tests cover fractional boundaries, late and early callbacks,
expiry, malformed responses, timeout, synchronous unsubscribe, independent
subscriptions, visible Angular rendering, and destruction before and after a
request. The production build also compiles the real template.

## Limits

`secondsLeft` does not say when the server measured the value. The implementation
anchors it at response receipt. Network transit and server rounding limit its
accuracy; subtracting a guessed half-round-trip would not resolve that ambiguity.
Exact server synchronization needs a better-defined API contract.

A monotonic clock avoids wall-clock changes, but some platforms pause it during
OS sleep. Browsers can also delay background callbacks. The countdown catches up
on its next callback when that clock advances; it cannot promise exact updates
while the browser is suspended. This display must not enforce server deadlines.
No polling or invented timestamp fields are added to the supplied API.

References: [Angular lifecycle cleanup](https://angular.dev/api/core/rxjs-interop/takeUntilDestroyed),
[NgZone](https://angular.dev/api/core/NgZone),
[monotonic clock limitations](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now).
