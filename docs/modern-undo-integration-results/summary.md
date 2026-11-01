# Undo reconstruction integration probe

The isolated repair ran four fixed one-hand scenarios at two simulations per decision and depth three.
The [results](results.jsonl) contain 418 decisions and 836 completed simulations, including 119 decisions with undo history.
Every hand reached the configured one-hand cap, and no decision missed its simulation budget.
The longest observed undo history contained nine snapshots.
The result replayed byte for byte without timing fields.
In a separate [audit](undo-audit.jsonl) of those trajectories, 284 reconstructed undo views matched their recorded views and 109 observed retractions remained legal in the sampled state.
The [audit driver](undo-audit-driver.mts.gz) runs from the repository root against the same source tree.
An additional [20-deal audit](fresh-audit.jsonl) checked 2,087 decisions on seeds 100 through 119, including 523 positions with undo history.
Its 1,183 reconstructed undo views matched the recorded views, all 484 observed retractions remained legal in the sample, and every decision met its simulation budget.
The fresh-audit records replayed byte for byte.
The [fresh-audit driver](fresh-audit-driver.mts.gz) runs from the repository root against the same source tree.
An exploratory [trace comparison](trace-comparison.jsonl) gave matching face-based action-trace digests and final hand scores on all four deals for the repair and the frozen baseline at commit `6b7dc5a`.
The [comparison driver](trace-comparison-driver.mts.gz) records action type, actor, phase, and card faces, but the retained artifact contains hashes rather than full traces.
These four deals do not establish behavioral equivalence on other positions or at other search budgets.
Two additional headless hands at eight simulations and depth eight completed 163 decisions with no deadline stop, including 42 with undo history.
The [first hand](deeper-hand.json) was repeated on the preserved repair tree, and the [second hand](deeper-hand-13.json) ran on that tree.
The [driver](deeper-hand-driver.mts.gz) accepts a deal seed as its argument.
For the first hand, the frozen baseline and repair also produced the same [face-based action-trace digest](deeper-trace.json) at the higher budget.
The [trace driver](deeper-trace-driver.mts.gz) retains the corresponding fixed configuration.

The tested source was Git tree `1b1939bf4af67c56bc634a97c4764808d7fa970f` on Node `v22.22.1`.
The [source patch](source.patch.gz) applies to commit `0d9064d` and reproduces that tree.
The SHA-256 of the results is `f04bda090dffe477c07910a46354da6e6337b9ff1498bf2c8b2cefdad56eda4c`.

The focused regression tests also cover multi-step undo, retraction, hidden-card isolation, duplicate faces, and staged pile pickup.
The four hands check integration on these trajectories; they do not measure playing strength or prove correctness for every possible turn history.
The repository-wide checks remain outstanding for this repair.
