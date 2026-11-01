# Wild-card prior ranking probe

The probe compares the highest-prior action sets under wild-card penalty weights −20, 0, 25, 50, and 100 against the incumbent weight 10.
Each comparison retains the trained discard-pair weight 25 and the other handcrafted coefficients.
Positive weights discourage spending wild cards, and the negative weight rewards spending them.
The probe evaluates prior rankings only and does not run MCTS or measure hand outcomes.

The predefined condition for a training grid was that weight −20 or 100 changes the highest-prior action set in at least 20 positions across at least three hands.
The [results](results.jsonl.gz) contain 1260 reconstructed positions from 15 hands.
The wild-card feature varies among playable actions in 159 positions.
The two extreme weights together change the highest-prior set in 143 positions across 14 hands and all five deal seeds, so the condition was met.

| Wild-card weight | Positions with a changed highest-prior set |
| --- | ---: |
| −20 | 113 |
| 0 | 60 |
| 25 | 15 |
| 50 | 35 |
| 100 | 38 |

The [driver](driver.mts.gz) completed all positions and replayed byte for byte.
Its [manifest](manifest.json) identifies the source and retained output.
Action generation has a 30000 ms limit per position, and no position reached the limit.
The driver contains the original absolute workspace paths, which must be adjusted when replaying elsewhere.

The positions come from face-key reconstruction of earlier trajectories.
Different physical duplicates can produce a valid reconstructed position that is not the original recorded position.
The 15 hands reuse five deal seeds across three score bands, so positions within each hand and hands across score bands are correlated.
The original trajectories did not use the tested retention-weight-25 prior.
These counts show that the tested weights can affect prior ordering in these fixtures, not that any weight improves play or has the same frequency in other games.
The prospective [training grid](../modern-wild-grid-protocol.md) tests the weights on fresh paired deals.
