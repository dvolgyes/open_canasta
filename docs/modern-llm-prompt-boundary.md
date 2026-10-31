# Offline modern model prompt

The prompt builder accepts an acting player's observation and public history from the modern engine.
It derives hidden-card bounds and samples a position without receiving the actual hidden hands or stock.
The prompt includes only selected public-history fields, visible card faces, and the actor's own card faces.
The caller supplies the random source and cancellation signal.

The builder enumerates atomic actions under the sampled position and adds the engine observation's undo and retract permissions.
It presents face-based labels with integer indices and keeps the corresponding action objects in a closure.
The selector accepts only an in-range safe integer and rejects selection after cancellation.
The caller must apply the selected action through the authoritative rules engine.
An atomic action can still lead to an opening that cannot be completed, and undo can permit repeated states.
Any future match runner must handle those cases and record incomplete games.

The input is a trusted observation created by the local engine, not an arbitrary model response.
The response boundary accepts a choice index as untrusted data and never executes model text.
The builder limits history, prompt size, choices, action-generation checks, and cooperative elapsed time.
Elapsed checks do not interrupt a synchronous inference or serialization operation and are not a hard process deadline.
The limits can reject a large but otherwise legal position rather than return a partial action list.

The offline tests compare prompts for two deals with identical actor-visible information and different hidden cards.
They also check that undeclared history fields do not appear, that listed actions apply to the real fixture, and that invalid indices and cancellation fail closed.
These tests cover the prompt boundary, not the behavior or security of a networked model integration.

There is no model client, API key access, paid request, or modern LLM match runner in this builder.
Before a future paid comparison, the runner must enforce the user's local-performance gate and spending limit, account for failed requests, protect credentials, and retain auditable results.
The current local experiments have not established that gate.
