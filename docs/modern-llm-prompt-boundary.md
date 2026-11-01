# Offline modern model prompt

The prompt builder accepts an acting player's observation and public history from the modern engine.
It derives hidden-card bounds and samples a position without receiving the actual hidden hands or stock.
The prompt includes only selected public-history fields, visible card faces, and the actor's own card faces.
The caller supplies the random source and cancellation signal.

The builder enumerates atomic actions under the sampled position and adds the engine observation's undo and retract permissions.
It presents face-based labels with integer indices and keeps the corresponding action objects in a closure.
The selector accepts only an in-range safe integer and rejects selection after cancellation.
The offline research agent passes the prompt and labels to an injected chooser and validates its returned index.
The match runner applies the selected action through the authoritative rules engine.
An atomic action can still lead to an opening that cannot be completed, and undo can permit repeated states.
Any future match runner must handle those cases and record incomplete games.

The input is a trusted observation created by the local engine, not an arbitrary model response.
The response boundary accepts a choice index as untrusted data and never executes model text.
The chooser receives no action objects or other players' hidden cards.
An accepted index can select only an offered action, which the match runner checks again.
The builder limits history, prompt size, choices, action-generation checks, and cooperative elapsed time.
Elapsed checks do not interrupt a synchronous inference or serialization operation and are not a hard process deadline.
The limits can reject a large but otherwise legal position rather than return a partial action list.

The agent gives the chooser an abort signal and stops waiting after cancellation or its response deadline.
It rejects a late result even if synchronous work delayed the timeout event.
It returns expected chooser failures as incomplete decisions and propagates unexpected exceptions.
The deadline cannot interrupt synchronous work, and a chooser that ignores the signal can continue after the agent stops waiting.
The agent does not observe that chooser's eventual outcome after it has stopped waiting.

The offline tests compare prompts for two deals with identical actor-visible information and different hidden cards.
They also check that undeclared history fields do not appear, that listed actions apply to the real fixture, and that invalid indices and cancellation fail closed.
The agent tests cover invalid response envelopes, invalid indices, cancellation, timeout, and application through the headless match runner.
In an isolated source copy, the invalid-choice tests fail if the agent substitutes a fixed action for the returned index.
The late-response test also fails if the elapsed-time check is removed.
Standalone Node tests fail if the timeout timer is unreferenced or is not cleared after a successful choice.
These tests cover the offline boundary, not the behavior or security of a networked model integration.

The trusted caller supplies the chooser, so the offline agent does not authenticate a remote model identity.
Neither the builder nor the agent contains a model client, API key access, paid request, or spending authority.
The agent does not journal requests, and a future networked runner must account for requests that continue after cancellation.
The offline [ledger audit](../src/bot/research/request-ledger.ts) totals supplied request records in integer nanodollars and retains unresolved reservations.
It reports whether the supplied records are settled, but it cannot establish that the input is complete or authorize a request.
The audit trusts each recorded canonical cost and cannot independently verify provider billing or BYOK attribution.
It rejects a canonical cost below a recorded component and checks unresolved reservations against the sum of recorded components.
Provider discounts or overlapping components can therefore require manual reconciliation before a record passes the audit.
The ledger test verifies the archived file hash and reproduces the recorded totals from individual requests.
In an isolated source copy, its tests fail if an unresolved reservation is dropped or combined unresolved components are undercounted.
The archived classic study contains 1152 request records, including one unresolved reservation, with maximum accounted exposure of USD 0.208343407.
If the same USD 1 cap covers both studies, the arithmetic remainder is USD 0.791656593 before any new request.
That remainder is not permission to dispatch while the earlier reservation is unresolved.
The existing fixed-simulation evidence validator requires a positive simulation budget for each policy and cannot validate a model policy with zero simulations.
The future runner needs a separate, tested evidence contract for mixed model and MCTS matches.
Before a future paid comparison, the runner must enforce the user's local-performance gate and spending limit, account for failed requests, protect credentials, and retain auditable results.
The current local experiments have not established that gate.
