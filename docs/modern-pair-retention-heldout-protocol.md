The six-weight retention screen selected `discardPair` weight 25 with a 26–22 single-hand training score against the handcrafted weight of 10.
Compare that fixed candidate against the unchanged handcrafted prior and zero tree prior in separate studies.
Each study uses 50 distinct deals with both team assignments, for 100 full matches.
Use two simulations per decision, depth three, a 30000 ms ceiling, and the standard full-match limits.
The configuration generator checked 100 distinct new deal seeds against 960 earlier recorded or planned seeds.
The zero-tree-prior opponent retains the handcrafted rollout and cutoff evaluator.

The fixed working predictions are at least 60 wins against the handcrafted prior and at least 90 against zero tree prior.
Fewer wins falsify the corresponding observed threshold for these matches, not a population win rate.
Any incomplete match or missed simulation budget makes the corresponding study ineligible.
Retain all legs and replay the results without counting cancelled partial matches.
Report the paired Hoeffding interval and the one-sided paired relative-entropy bound at alpha 0.025, with a 0.02 subtraction for the 13, 13, 12, 12 dealer allocation.
These exploratory studies do not give a familywise confidence guarantee across the larger adaptive search for candidates.
Neither an observed threshold alone nor a single favorable sample authorizes the LLM comparison.
Reserve independent final confirmation or specify error spending before making a global confidence claim.
