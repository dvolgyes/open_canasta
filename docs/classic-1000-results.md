The retained classic Canasta champion won **89 of 100 fresh full matches** against zero-tree-prior MCTS.
It lost 11 matches: **89% wins and an 8.09:1 win/loss ratio**.
The test used 50 independent deal seeds, each played twice with the champion on opposite teams.
Its conservative one-sided 97.5% paired Hoeffding lower bound is 69.79%.
These 100 matches are additional to the requested 1000-match optimization study.

The original reference weights remain the champion because the trained candidate did not pass the declared promotion gates.
This is the best retained policy under those gates, not proof that its weights are globally optimal.
The candidate was not deployed to the browser.

| Comparison | Full matches | Wins | Losses | Win rate |
| --- | ---: | ---: | ---: | ---: |
| Retained champion vs zero priors, fresh final test | 100 | 89 | 11 | 89% |
| Trained candidate vs incumbent, promotion | 200 | 96 | 104 | 48% |
| Trained candidate vs reference, independent anchor deals | 200 | 95 | 105 | 47.5% |
| Reference vs itself, paired measurement control | 200 | 100 | 100 | 50% |
| Trained candidate vs zero priors, development diagnostic | 60 | 54 | 6 | 90% |
| Reference vs zero priors, development diagnostic | 60 | 49 | 11 | 81.67% |

The remaining 280 matches trained the candidate through 70 SPSA updates with wider perturbations and coefficients that could change sign.
Each perturbation used one paired deal; 31 updates had equal plus/minus fitness and therefore no update direction.
All training opponents used the reference weights because this run had only a final promotion checkpoint and no earlier archive entries.
All 1100 final local matches completed: 6724 hands, 537957 actions, 4303656 simulations, and zero turn resets.
The final run had no incomplete match.
The 100 reference-self-play pairs produced identical scores and trajectories under the seat swap, with complementary winner labels.

The candidate's promotion win-rate lower bound was 34.42%, below the required 50%.
Its reference-matchup non-inferiority estimate was -2.5 percentage points, with a lower bound of -29.66 points, below the required -2 points.
Neither gate passed, so there was **no promotion**.
The zero-prior diagnostics did not select the champion or change the thresholds.
The separate 100-match test was declared after the user's request and used fresh deals after champion selection.

Every local MCTS decision completed eight simulations at depth 12 under a 60000 ms emergency limit.
Both opponents used the same inference, legal actions, rollout heuristics, and evaluation.
Zero priors removed the tree-prior UCB bonus and prior-based expansion ordering.
It did not remove rollout heuristics.
The result therefore supports tree priors at this small search budget; it does not establish their value at much larger budgets.

All final local stages used commit `40fc0a92f1fab441e2e1dbce2ff97559ea9f809b` and source fingerprint `75ff97c882352a978432c1a6be70f26842d81a74ded8568a1729b891548bf198`.
The master seed was 1779033703.
The additional 50 paired deals used test namespace 4 and did not overlap the study's 300 earlier deal seeds.
The [frozen protocol](classic-1000-study.md) gives the allocation, perturbation schedule, split rules, and promotion thresholds.

The [machine-readable results](classic-1000-results.json) contain weights, paired bounds, source identities, checksums, and LLM accounting.
The [match table](classic-1000-matches.csv) contains every final local match.
Compressed record archives listed in the results JSON preserve the original configurations, match records, event logs, declarations, and analysis script.
Regenerate and validate the report from retained raw records with `node --import tsx scripts/analyze-classic-1000.mjs research-results/classic-1000-20261031-r3`.
Each gzip archive contains a JSON object with a `files` array of relative paths and original file text.
The [aborted-run archive](classic-1000-aborted-records.json.gz) preserves the earlier attempts separately.
The [recovery record](classic-1000-recovery.md) explains the opening-search timeout and the tied-expansion bias found before the final run.
Those earlier outcomes were not pooled into the final comparison.

Paid testing began only after all 1100 local matches completed.
It uses `inception/mercury-3` through the retained LLM agent, with reasoning disabled and a heuristic-ranked menu of at most 40 actions.
The provider catalog identified the canonical version as `inception/mercury-3-20261019`, but exposed only the unversioned API alias used here.
The recorded usage, model IDs, and cached choices bound reproducibility; a future request to that alias may use a changed backend.

Two local action-menu stalls interrupted the first diagnostic match.
Both occurred after successful requests with known charges and no request outstanding.
The final correction in commit `ad651b7bb4890f2339b7a52ca753f6ec84e0d95e` uses bounded opening proofs, while preserving the stock-draw lookahead and heuristic ranking.
All 223 saved prompt hashes replayed unchanged before recovery, and their USD 0.02020252 of charges stayed in the same ledger.
The correction can expose additional legal pile-opening options beyond the old four-meld lookahead, so the final LLM comparison uses this revised menu.
The [paid-test protocol](classic-1000-llm-protocol.md) records both repairs, the spending controls, and the separate conditional 20-match test declared before any LLM match result.

All four diagnostic matches completed, with two wins for the reference and two for the trained candidate against Mercury 3.
Their 881 requests cost USD 0.07785057.
These four games used one shared deal seed and do not establish general LLM superiority.
The user then cancelled the remaining LLM tests during the first game of the separate 20-match confirmation.
That game has no completed outcome; the other 19 games were not started.
The confirmation made 271 requests before cancellation, including one request whose final cost is unknown.
Across both stages, recorded charges total USD 0.10183812.
Including the full reservation for that in-flight request, maximum accounted exposure is below USD 0.209.
No further paid tests are scheduled or authorized by this report.

This is one optimizer run and one implementation of classic Canasta.
It does not establish optimizer reliability across training seeds, strength under modern Canasta rules, or general superiority over LLMs.
Further optimization needs new training seeds, fresh held-out deals, equal search budgets, and a promotion protocol fixed before evaluation.
The historical promotion thresholds and verdict remain unchanged.
The [assessment and modern Canasta plan](modern-canasta-plan.md) distinguishes the demonstrated prior benefit from the remaining search and rules questions.
