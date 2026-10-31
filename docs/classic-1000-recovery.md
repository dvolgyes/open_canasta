# Recovery before the 1000-match study

The first execution stopped after six complete matches and two incomplete matches.
Both failures were in `train-2-minus-0`, with seed 3782185709.
The reference player completed only 7/8 and 5/8 required simulations before the 60000 ms decision limit.
The original records remain in `research-results/classic-1000-20261031`.
Their source fingerprint is `ccb3f33880ac1d13df0f504531c7bc7e7df734f2e9d8845a1ba67cf4cc279fbd`.
The implementation was committed as `0cae61d` after the manifest was created; the manifest records its preceding commit and the exact source fingerprint.
These results do not count toward the completed study and do not authorize LLM testing.

## Diagnosis and repair

A deterministic replay reproduced the decision timeout.
In the last 30 seconds of its CPU profile, 26602 of 27819 samples were below the opening-completion proof.
The recursive proof explored permutations of melds and physical duplicate cards while trying to reach an impossible opening minimum.
Its optimistic point bound counted black threes without enforcing their going-out restriction.
It also rejected zero-point borrowed-card moves that can be necessary to clear the hand before melding black threes.

Tighter point bounds, canonical memoization, and ordering of continuations improved the captured decisions but did not fix all full-game timeouts.
A dynamic-programming bound resolved both original failing positions, but one replay then timed out at action 547.
This falsified the claim that a better bound alone was sufficient.

The final correction replaces recursive pile-opening proofs with bounded rank allocation.
The state tracks the shared wild-card budget, zero/one/multiple cards remaining, and the number of canastas needed to go out.
It includes partial natural groups and distinguishes opening-eligible cards from cards borrowed from the pile.
Black threes are considered only after the other cards can be cleared.
Each proposed continuation is applied through the rules engine before acceptance.
An expired proof remains a failure.
The separate stock-draw path retains the concealed-going-out waiver.

Regression checks cover both captured decisions, legal black-three openings, borrowed-card clearing, interruption, and exhaustive legal continuations over 64 small inventories.
The second captured-decision test uses 1000000 logical deadline checks; an earlier exploratory cutoff of 100000 was insufficient for its complete eight-simulation search.
The pre-repair search also failed at 1000000 checks.
The first captured-decision test and the older opening regression retain their 100000-check cutoffs.
The study's real 60000 ms deadline and eight-simulation requirement are unchanged.

Both original failed match tasks now complete without resets: 731 actions / 5848 simulations and 665 actions / 5320 simulations.
These are repair checks, not independent estimates of playing strength.

## First restart

The first restart began all 1000 matches under commit `8345345` in `research-results/classic-1000-20261031-r2`.
Do not reuse outcomes from the failed source revision.
Keep the declared seeds, budgets, weights, perturbation schedule, comparison allocation, and promotion thresholds unchanged.
Record the new commit and source fingerprint before execution.
The zero-prior comparisons remain mandatory, and paid testing remains blocked until all 1000 local matches complete.

## Tie-selection correction and second restart

The second execution completed 128 training matches without an incomplete search.
It was stopped before promotion or zero-prior evaluation when a separate check exposed action-order bias in tied tree expansion.
With three equal actions, two expansions per trial, and 6000 seeded trials, the old selection explored the actions 4670, 4027, and 3303 times.
Each action should appear in about 4000 trials.
Selecting a random initial candidate did not randomize the final tied set: if the initial candidate had already been visited, the first unvisited action could displace it and keep the tie.

The correction first finds all tied best candidates and then samples uniformly from that set.
The same check now gives 4001, 3998, and 4001.
A regression test fails on the old implementation and passes on the correction.
The earlier opening tests and the zero-prior equivalence test also pass after this change.
Both policies use the corrected kernel.

All 128 completed matches remain in the second directory, along with the stop reason and tie-selection check.
They do not count toward the final 1000-match study.
Restart the full unchanged protocol in `research-results/classic-1000-20261031-r3` after committing and verifying the correction.
The post-study LLM guard is included in that source revision but remains inactive throughout the local run.
No source edits or commits are permitted during this final execution, so all stage manifests identify the same source and commit.
