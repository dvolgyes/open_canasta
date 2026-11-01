At the initial state, the cutoff's team ordering agreed with the eventual higher-scoring team in 46 of 72 recorded hands and disagreed in 26.
There were no ties in either the initial cutoff or the final scores.
The earlier hand pilot contributed 14 agreements and 10 disagreements, its replication contributed 18 and six, and the depth pilot contributed 14 and 10.
The predeclared prediction of at least 45 disagreements was not met.
The 72 outcomes come from 36 paired deals, and the selected studies used different search budgets or depths.

The [analysis](analyze.mts) reconstructed each initial deal, checked the cutoff ordering against the direct score calculation, and validated the retained plans, paired sides, and simulation counts.
Its inputs and limits are specified in the [protocol](protocol.md).
This check uses the actual hidden cards and only the single continuation played in each recorded hand.
It measures a ranking at the start of a hand, not probability calibration, counterfactual action quality, or full-match strength.

An earlier post-hoc [replay](trajectory-replay.mts) of 15 trajectories suggested 314 disagreements among 424 positions in their first thirds.
That replay selected actions by face-only keys, and the source trajectories did not retain physical-card choices or final scores for independent comparison.
Its reconstructed outcomes therefore cannot be authenticated as the original outcomes, so the early-trajectory count is not used as evidence about the evaluator.
The two checks also use different positions within hands.

The fixed sample did not justify changing the cutoff evaluator.
Any proposed replacement still needs a prospective paired playing-strength comparison.
