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

Copy these three files into the same folder in a modern Angular app:

- [`deadline.component.ts`](src/app/deadline.component.ts): template and view lifecycle.
- [`deadline.service.ts`](src/app/deadline.service.ts): shared request, deadline, and timer.
- [`countdown.ts`](src/app/countdown.ts): validation and elapsed-time scheduling.

Add `DeadlineComponent` to the consuming standalone component's imports or an
NgModule's imports. Use `<app-deadline />`. The host must provide `HttpClient`,
for example with `provideHttpClient()`. Functions and services do not belong in
Angular's component imports array. Keep the host's HTTP/interceptor configuration.

`DeadlineService` is shared by the root injector. Do not provide it separately
on each countdown component if they should share work. If a host has separate
user/session-specific deadlines, provide a fresh service at the common parent
for that context. The cache belongs to that service instance, not a global static.
The supplied problem has one fixed deadline; changing deadlines require a
separate invalidation policy and are outside this implementation's contract.

The demo uses Angular 22's default zoneless configuration. The service sets up
work outside Angular's zone; the component enters the zone to update its signals.
No application-wide change detection setting is changed. Older Angular versions
may require API changes. This is not AngularJS code.

## Improvement from Phase 2

The original implementation fetched and scheduled independently in every mounted
component. In a larger app, multiple views of the same fixed deadline duplicated
requests and timers. The service now shares both. The API and displayed text are
unchanged, and no polling or extra UI behavior has been added.

| Situation | Original | Current |
| --- | --- | --- |
| 100 concurrent subscribers | 100 requests, up to 100 countdown timers | 1 request, at most 1 countdown timer |
| Last view closes | Its work stops | Shared work stops |
| View reopens after a successful response | Fetch again | Resume from the stored deadline |
| Deadline already expired | Fetch for each new component | Emit 0 from the stored deadline, with no timer |

The 100-subscriber case is verified by a deterministic test, not a browser CPU
benchmark. Rendering still costs work per view; sharing does not eliminate that.
For a single view that never remounts, request and timer counts are the same as
before. The extra service file is the tradeoff for reuse and resource ownership.

## Timer and cache rules

A validated response becomes a local deadline using `performance.now()`. Each
callback calculates the remaining duration and displays its ceiling in seconds.
One timeout is scheduled for the next displayed-second boundary. For example,
1.25 seconds displays 2, changes to 1 after 250 ms, then reaches 0 a second later.
Late callbacks skip missed values rather than extending the countdown.

Cache the deadline, never the original `secondsLeft`. When nobody is listening,
reference counting cancels an unfinished request or the active countdown timer.
After a valid response, retain only the fixed deadline and bounded replay state.
A later subscription resumes from that same deadline without keeping a timer
alive in the meantime. The deadline is stored before notifying consumers, so
synchronous unsubscribe after the first value does not lose it.

The shared stream replays a deadline notification, not a displayed count. Each
new subscriber calculates its initial value using the current clock. This avoids
showing an old cached number when a timer callback has been delayed. Duplicate
values are suppressed for each consumer. The timer completes at zero.

HTTP errors, invalid payloads, and a ten-second timeout show an error, not a false
zero. A failed response is not cached. A later mount may make a new request; there
is no automatic retry loop. Negative finite durations mean already expired.
Component destruction releases its subscription. Destroying the service's
injector also stops its active work. Startup remains browser-only through
`afterNextRender`.

## Validation

All 41 tests pass, including the original rendering/timing tests and new cases
for 100 subscribers, partial and final unsubscribe, cancellation before response,
remounting, expiry while unmounted, delayed replay, synchronous unsubscribe,
HTTP errors, malformed responses, timeout, and injector destruction. Two real
Angular component instances are also tested together. Tests use zoneless TestBed
and a manually controlled clock; separate Zone.js and SSR end-to-end runs have
not been performed. The production build compiles the real template.

## Limits and research

The API does not say when the server measured `secondsLeft`. The local deadline
is anchored at response receipt, so transit time and rounding limit accuracy.
Guessing half the round-trip would not resolve that ambiguity. No timestamp
fields have been invented or required from the backend.

A monotonic clock avoids wall-clock edits, but it can pause during OS sleep on
some platforms. Browsers may also delay callbacks. This code catches up on its
next callback when that clock advances, but cannot guarantee per-second work
while suspended. The display must not enforce an authoritative server deadline.

References checked while implementing the sharing policy:

- [Angular HTTP requests](https://angular.dev/guide/http/making-requests): subscriptions can trigger separate requests.
- [RxJS shareReplay source](https://github.com/ReactiveX/rxjs/blob/7.8.2/src/internal/operators/shareReplay.ts): reference-count teardown, error reset, and completion replay.
- [Angular injector scope](https://angular.dev/guide/di/hierarchical-dependency-injection): service lifetime and sharing boundaries.
- [Angular HTTP testing](https://angular.dev/guide/http/testing): request matching and cancellation checks.
- [NgZone](https://angular.dev/api/core/NgZone) and [performance.now](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now): scheduling context and clock limitations.

The history includes a trial with retry and visibility behavior. Those features
were removed because they were not needed by the prompt. The final performance
change is sharing the fixed-deadline work, with tests for its lifecycle and cache.
