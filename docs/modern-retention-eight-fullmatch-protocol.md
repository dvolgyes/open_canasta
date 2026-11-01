This exploratory study compares the trained retention-weight-25 policy using eight simulations with local opponents using two simulations.
Both policies use depth three, a 30000 ms decision ceiling, the same rollout and cutoff evaluator, and standard full-match limits.
The handcrafted opponent uses retention weight 10; the zero-tree-prior opponent retains the same rollout and cutoff evaluator.
The candidate differs from the handcrafted opponent in both its trained prior and its computational budget.

Run separate fixed studies against the handcrafted and zero-tree-prior opponents.
Each uses 50 distinct fresh deals with both team assignments, for 100 full matches.
The [configuration generator](modern-retention-eight-fullmatch-config-generator.mts) checked 100 distinct new deal seeds against 1084 earlier recorded or planned seeds.
Its [input manifest](modern-retention-eight-seed-inputs.txt.gz) fixes the earlier match records used for this check.
The working predictions are at least 60 wins against the handcrafted prior and at least 90 against zero tree prior.
Fewer wins falsify the corresponding observed threshold for these matches, not a population win rate.
Require every match to complete and every decision to meet its own policy's declared simulation budget.
Record and validate decision counts, simulation totals, and deadline stops for each policy separately.

Retain all legs and replay the results without counting cancelled partial matches.
Report the paired Hoeffding interval and the one-sided paired relative-entropy bound at alpha 0.025, with a 0.02 subtraction for the 13, 13, 12, 12 dealer allocation.
The bounds assume independent sampled deal pairs and a fixed candidate and study definition, with pseudorandom seeds representing the intended deal model.
These exploratory studies do not give a familywise confidence guarantee across the larger adaptive search for candidates.
A favorable result does not isolate the value of the trained prior, the extra simulations, or the UCB formula.
Neither an observed threshold alone nor a single favorable sample authorizes LLM testing.
Reserve independent final confirmation or specify error spending before making a global confidence claim.
