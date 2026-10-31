The completed six-weight screen selected pair-threat coefficient 50 after it won 29 and lost 19 single-hand scenarios.
This selection is training evidence, not a full-match strength estimate.
Compare that fixed candidate against the unchanged handcrafted prior and against zero tree prior in separate studies.
Each study uses 50 distinct deals with both team assignments, for 100 full matches.
The two studies use distinct seed splits and two simulations at depth three, with a 30000 ms decision ceiling.
The zero tree-prior opponent retains the handcrafted rollout and cutoff evaluator.

The fixed working predictions are at least 60 match wins against the handcrafted prior and at least 90 against zero tree prior.
Any incomplete match or missed simulation budget makes the corresponding study ineligible.
Retain all legs and replay the results without counting cancelled partial matches.
Report the paired Hoeffding interval and the one-sided paired relative-entropy bound at alpha 0.025, with a 0.02 subtraction for the 13, 13, 12, 12 dealer allocation.
The bounds assume independent sampled deal pairs and fixed candidate and study definitions, and the pseudorandom seeds stand in for the intended deal distribution.
These exploratory studies do not give a familywise confidence guarantee across the larger adaptive search for candidates.
Neither an observed threshold alone nor a single favorable sample authorizes the LLM comparison.
Reserve an independent final confirmation or specify error spending before using repeated candidates for a global confidence claim.
