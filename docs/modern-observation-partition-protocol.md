# Observation partition sensitivity probe

The generic search can separate statistics for simulated actors with different observations.
The experimental modern adapter keys each decision by the acting player's current view, including the multiset of their own card faces.
It excludes the physical identity of duplicate cards and other players' hidden cards.
The key does not reconstruct a simulated player's private memories from earlier turns, and it does not merge distinct action histories.

The [probe](../scripts/modern-observation-partition-probe.ts) follows at most 20 decisions on the baseline trajectory of seed 9137, dealer zero.
At every position, compare the baseline with the partitioned search using 16 simulations, depth eight, identical initial random seeds, and a 30000 ms decision ceiling.
Apply the baseline action before the next comparison.
Require every comparison to complete both simulation budgets, retain every output line, and replay the results without timing fields.
The prediction is at least one different selected action in the sampled positions.
No changed actions falsifies that prediction for this trajectory, not for all game positions.

The trajectories are correlated, both searches use heuristic rollouts, and their random streams can diverge after their search paths differ.
This diagnostic does not measure match strength, establish that the partition represents complete information sets, or justify changing the default.
Any favorable result requires fresh, fixed-budget comparisons against the existing search and both local baselines before promotion.
