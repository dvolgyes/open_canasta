The existing held-out protocols and their acceptance rules remain unchanged.
This calculation is for a possible future confirmation of a trained candidate selected without inspecting its final confirmation games.

Use separate, fixed, side-swapped deal pairs against the handcrafted and zero-tree-prior opponents.
Balance the number of deals across the four dealer seats, retain every leg, and require complete games with the declared simulation budget.
For each comparison, treat a pair's mean win score as one independent observation in `[0, 1]`.
Assuming the fixed pseudorandom deals represent samples from the intended random-deal model, the one-sided paired KL bound can use error probability 0.025 per comparison.
The union bound then gives at least 95% simultaneous coverage for the two lower bounds for this fixed candidate and these two fixed studies.
This statement does not cover unrestricted selection among candidates after inspecting confirmation results.

The table gives the minimum observed wins needed for the lower bound to be strictly greater than each requested rate, using a balanced dealer schedule and no incomplete games or ties.
It uses [paired-kl.ts](../scripts/paired-kl.ts) and is a threshold calculation, not a power calculation.

| Paired deals | Full matches per opponent | Wins needed for lower bound above 0.60 | Wins needed for lower bound above 0.90 |
| --- | --- | --- | --- |
| 100 | 200 | 146 | 195 |
| 200 | 400 | 278 | 381 |
| 400 | 800 | 533 | 751 |
| 800 | 1600 | 1035 | 1485 |

Choose a candidate, sample size, random-deal distribution, scoring rule, and stopping rule before inspecting the final confirmation results.
An observed win rate near a target cannot by itself establish that the underlying rate exceeds that target.
If candidates are repeatedly selected using the same confirmation games, use an explicitly budgeted error-spending plan or reserve a fresh final confirmation set.
LLM comparison remains subject to the user's local prerequisites and spending limit.
