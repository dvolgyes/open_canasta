# Inference feasibility shortcut probe

The existing inference code checks joint deal feasibility with a flow allocation.
The [candidate patch](candidate.patch.gz) tries the existing bounded sampler first and retains flow allocation as its fallback.
The candidate uses a local deterministic random source for this check and does not change the random source used by search.
The [manifest](manifest.json) identifies the baseline and candidate files.

The inference benchmark returned identical bounds on 120 recorded computational inputs.
Its four executions gave median candidate-to-baseline time ratios of 0.789, 0.814, 0.821, and 0.798.
The first two records were copied from the original console output: [first](inference-initial-0.json) and [second](inference-initial-1.json).
The later records were written directly by the same [benchmark](../modern-inference-convergence-probe/benchmark.mts): [first](inference-0.json) and [second](inference-1.json).
The 120 inputs contain correlated, face-key-reconstructed trajectories and are not a representative sample of all game histories.

The [small-deck comparison](exhaustive.mts.gz) checked 4096 exclusion patterns with a duplicated face.
Both implementations returned identical bounds or identical errors for all patterns.
They accepted 3125 and rejected 971 patterns.
This comparison has no independent oracle and does not prove general equivalence.
The permanent card-knowledge test separately checks a jointly impossible deal whose individual rows each have enough possible faces.

The preliminary [search timing](search-results.json) used a fixed order within each simulation budget.
That order can confound the comparison, so its timing is not used for the decision.
Before reading the balanced results, the decision criterion was a repeatable improvement of at least 10% in complete-decision timing with identical completed search results.

The balanced early-position sample used six successive positions from each of three dealt hands.
Four executions compared both implementations at two simulations and depth three, and at eight simulations and depth eight.
The implementations returned identical actions, iterations, and root-choice statistics in every comparison, and every search completed its declared simulations within 30000 ms.
For two simulations, the four ratios of total candidate time to total baseline time were 0.914, 0.925, 0.916, and 1.000.
For eight simulations, the corresponding ratios were 1.006, 1.003, 1.080, and 1.042.
The [driver](search-benchmark.mts.gz) alternated execution order within each budget.

The balanced longer-history sample used two reconstructed positions from each of 15 previously recorded hands.
Two executions compared both implementations at the same two budgets and again returned identical completed search results.
For two simulations, the total-time ratios were 0.993 and 0.945.
For eight simulations, they were 1.041 and 1.072.
The [driver](history-benchmark.mts.gz) uses face-key reconstruction, which can select a different physical duplicate from the original trajectory.
These are valid reconstructed computational positions, but their identity as the original recorded positions is not established.

The measured complete-decision improvement did not meet the criterion.
The candidate was not adopted.
All timings used a shared machine while four match studies ran, and repeated positions within a hand are correlated.
The results do not establish a general speed ratio, deadline equivalence, or full behavioral equivalence.

The compressed drivers contain the original absolute workspace and temporary paths.
To repeat the probe elsewhere, adjust those paths, copy the baseline source tree, and apply the candidate patch to the copy.
Run the drivers from the repository root with the recorded Node version.
