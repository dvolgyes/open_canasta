This post-hoc diagnostic uses the 15 recorded handcrafted-policy hand trajectories from the [band sensitivity probe](../modern-band-sensitivity-results/results.jsonl).
It does not inspect outcomes from either ongoing full-match comparison.
The source contains 1,260 action positions across five deals at each of three symmetric starting scores.
The [analysis](analyze.mjs) excludes the final seven positions of each hand so both horizon lengths use the same 1,155 positions.
For each retained position, it counts whether the recorded trajectory reaches the next player's first action within three or eight actions, including the current action.
It identifies a change of player from a recorded discard followed by another recorded action in the same hand.

| Starting phase | Positions | Next player within three actions | Next player within eight actions |
| --- | ---: | ---: | ---: |
| Draw | 460 | 368 | 450 |
| Play | 695 | 541 | 683 |
| All | 1,155 | 909 | 1,133 |

These are correlated positions from a small, previously inspected sample.
They describe the actions that the baseline actually took, not the simulated branches chosen by MCTS.
They do not establish that either depth produces stronger play.
They motivate a controlled comparison of total search depth at the same simulation budget, prior, rollout policy, and paired deals.
