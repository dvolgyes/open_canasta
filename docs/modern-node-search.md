The headless Node entry point is `chooseModernInNodeWorker` in [modern-node-search.ts](../src/bot/modern-node-search.ts).
It accepts a `ModernObservation`, a thinking time in milliseconds, and optional search limits, prior weights, random seed, and cancellation signal.
Create the observation with `observeModern` so that the worker receives only the acting player's hand and the public state.

The caller starts the deadline before computing the fallback and starting the worker.
On expiry, the caller returns the last completed search result, or the zero-time fallback if no search result arrived in time.
The caller must handle an absent action because a legal zero-time fallback has not been established for every reachable position.
The timer terminates the worker, but event-loop and operating-system scheduling can delay the return beyond the requested time.
Cold worker startup uses the installed `tsx` development dependency and consumes part of the thinking budget.

Cancellation rejects with `BotRequestAbortedError`.
Worker failures are reported rather than treated as successful search results.
The worker starts with an empty environment, but it has the process's filesystem privileges and is not a security sandbox.
Fixed seeds support repeatable random streams, but wall-clock-limited searches can complete different numbers of simulations under different system loads.
Use fixed simulation budgets and verify that every budget was met when comparing playing strength.

This Node wrapper is not yet connected to the modern GUI or the headless research arena.
