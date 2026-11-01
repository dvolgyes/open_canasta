# Undo and retraction sampling probe

The [probe](../scripts/modern-undo-sampling-probe.ts) compares a real position with a sampled search position.
It ran against Git tree `9f9a69703b1f087586d444a03aca478160ccbb47` and Node `v22.22.1`.
The probe itself was added after that tree was recorded.
To reproduce the old result, place the probe in a checkout of that tree before running it.
Running the probe against a later repair tests the later source instead.

In the first case, seed 1 produces a normal deal, followed by a stock draw and a legal meld.
The real observation reports both undo and retraction as available, and both actions succeed on the real state.
Neither action succeeds on the sampled state.

In a separate constructed position, the real action generator offers retraction as its only action.
The sampled action generator offers no actions.
The search returns the legal retraction fallback, but reports four completed simulations and zero root choices.
This case demonstrates a misleading search result on that constructed position, not its frequency in normal games.

The sampler currently reconstructs the start of the turn but initializes the undo stack as empty.
The observation records availability booleans, not the previous views needed to reproduce the effect of undo or retraction.
A correction needs to preserve the acting player's visible turn history without copying opponents' hidden cards into the observation.
It also needs to preserve the sampled card inventory and reproduce each available transition, including pile pickup and opening transitions.
Reverting directly to the start of the turn is not equivalent to undoing the latest action after several actions.

The repair adds the actor's own prior views to the observation and samples the hidden allocation once.
It reconstructs the prior views with that same allocation and assigns indistinguishable public copies consistently across the turn history.
The sampled undo stack then replays the visible prior positions in order.
An observation that claims undo is available without providing the prior views is rejected.
The [integration record](modern-undo-integration-results/summary.md) describes the tested histories, replay, and its limits.
The direct search path still depends on the cost of inference and reconstruction; its wall-clock ceiling is not a hard real-time guarantee.
