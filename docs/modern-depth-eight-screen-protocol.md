This exploratory full-match screen compares the trained retention-weight-25 policy at depth eight with local opponents at depth three.
All policies use eight simulations per decision, the same rollout and cutoff evaluator, and a 30000 ms decision ceiling.
The handcrafted opponent uses retention weight 10; the zero-tree-prior opponent retains the same rollout and cutoff evaluator.
The candidate differs from the handcrafted opponent in both its prior and search depth, and deeper simulations can require more computation.

Run separate fixed studies against the handcrafted and zero-tree-prior opponents.
Each uses 50 fresh paired deals with both team assignments, for 100 full matches.
The [configuration generator](modern-depth-eight-screen-config-generator.mts) checks the 100 planned deals against earlier recorded and planned seeds.
The working predictions are at least 60 wins against the handcrafted prior and at least 90 against zero tree prior.
Fewer wins falsify the corresponding observed threshold for these matches, not a population win rate.

Require every match to finish and every decision to complete its declared simulation budget.
Retain all legs and replay the source-bound records without counting cancelled partial matches.
Report the paired Hoeffding interval and one-sided paired relative-entropy bound at alpha 0.025, with a 0.02 subtraction for the 13, 13, 12, 12 dealer allocation.
The bounds assume independent sampled deal pairs and a fixed candidate and study definition, with pseudorandom seeds representing the intended deal model.
They do not control the error rate across the larger adaptive candidate search.
Neither an observed threshold nor a single favorable screen authorizes LLM testing.
Reserve an independent final confirmation or specify error spending before making a global confidence claim.
