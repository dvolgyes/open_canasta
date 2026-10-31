# Eight-simulation retention screen against the handcrafted prior

The [fixed protocol](../modern-retention-eight-fullmatch-protocol.md) compared the retention-weight-25 candidate at eight simulations with the handcrafted prior at two simulations.
Both policies used depth three and the same rollout and cutoff evaluator.
The 50 paired deals produced 100 completed full matches: 61 candidate wins and 39 losses.
The observed 60-win prediction was met for these matches.

The candidate completed 265800 simulations across 33225 decisions, and the opponent completed 65506 simulations across 32753 decisions.
No decision missed its declared simulation budget.
The retained store also contains 13 cancelled partial legs, which are excluded from the match totals.
The [analysis](analysis.json) validated every retained match and found a paired 95% Hoeffding interval of approximately 0.418 to 0.802 for the planned dealer allocation.
Its one-sided paired relative-entropy lower bound, after the planned dealer-imbalance adjustment, was approximately 0.399.
The source-bound study replayed the retained records and returned the same match summary.

The candidate received four times the simulations per decision, so the result does not isolate the trained prior or UCB's contribution.
The interval includes rates below 0.60, and this exploratory screen does not correct for the wider adaptive candidate search.
It therefore does not establish a 60% population win rate or promote the candidate.
The separate zero-tree-prior screen is still in progress, and neither screen alone authorizes paid model testing.
