# Classic Canasta training

The user selected classic Canasta first, with confident wins against specified LLMs as the final objective.
Modern Canasta remains deferred.
This runner implements the first optimization stage of the [research protocol](self-play-study.md).
It does not automatically replace the browser bot's weights.

## Paired matches

Each block plays two complete classic matches to 5000 points.
Both legs start with the same match seed and dealer.
A controls N-S in one leg and E-W in the other; B controls the opposite partnership.
The rules rotate dealers and derive the same subsequent hand deals by hand number.
The policies can cause different trajectories, hand lengths, and match lengths.
Policy RNG streams are separate from the true deal seed, and agents receive their own hand and public observations only.
History resets at each new hand.

The paired score is the average of A's two binary match wins, so a block contributes 0, 0.5, or 1.
An incomplete leg makes the block incomplete; it is never changed to a draw or discarded from the planned sample.
The analysis uses blocks rather than individual moves or hands as its observations.
Team swaps reduce seat and deal effects; they do not eliminate uncertainty.

With `parallel: true`, the two local legs execute in separate Node workers, each limited to 512 MiB of V8 old-generation heap.
This is not a total resident-memory limit.
Parallel experiments require fixed completed-simulation budgets.
Timed evaluation runs sequentially to avoid the paired workers competing for the same thinking-time budget.
Each invocation has an explicit `maxWallMs`; completed legs survive interruption and can be reused.
Local workers are terminated at that deadline.
Sequential searches stop cooperatively; an already dispatched LLM request can finish within its separate 45-second timeout.

## Prior coefficients and optimizer

`canasta-prior.ts` exposes 16 coefficients for action preferences, pile size, cards melded, canasta bonuses, first melds, wild expenditure, discard value, singleton ranks, resets, and going out.
The reference vector reproduces the frozen handcrafted action scores.
Only the tree prior changes during this stage; rollout scoring, reward evaluation, legality, and the belief model remain fixed.
Setting the entire prior to `null` removes both the prior bonus and its unvisited-action ordering effect.
Setting only `priorWeight` to zero remains a partial ablation.

SPSA evaluates two symmetric perturbations on the same paired deals and opponent assignments before updating all coefficients.
Each normalized coefficient stays in `[-1, 1]`; its scale is the greater of the reference coefficient's absolute value and 0.1.
The current feature set therefore varies magnitudes without reversing the reference signs.
This restriction is an initial search domain, not a demonstrated optimal domain.
Random search evaluates two independent vectors per update as a simple comparator under the same number of games.
Equal simulation counts or game counts do not imply equal CPU cost.

Training opponents are selected from a mixture fixed within each checkpoint epoch: 50% champion, 25% archive, and 25% reference MCTS.
An empty archive uses the reference policy.
The optimizer's candidate and the champion are separate artifacts.
An exploratory update can be worse without replacing the champion.

At each configured checkpoint and at the final update, the candidate plays fresh paired matches against the incumbent.
The candidate and incumbent also each play the frozen reference on another shared set of fresh blocks.
Promotion requires both superiority over the incumbent and non-inferiority to the incumbent's reference matchup, using a two-percentage-point margin.
The implementation uses conservative fixed-sample Hoeffding bounds and divides the configured error budget over the two gates and all planned checkpoints.
No early success peeking is used.
The low-cost pilot is intentionally far too small to establish a small improvement.
Repeated optimizer arms or independent campaigns require an additional study-level allocation of the error budget before confirmatory claims.

## Commands and artifacts

Run the small capacity probe or training pilot from the repository root:

```sh
node --import tsx scripts/canasta-study.ts docs/classic-capacity-pilot.json ./capacity-results
node --import tsx scripts/canasta-study.ts docs/classic-training-pilot.json ./training-results
```

An output directory must not already exist for a new run.
Resume with the identical configuration and source fingerprint:

```sh
node --import tsx scripts/canasta-study.ts docs/classic-training-pilot.json ./training-results --resume
```

The manifest records configuration, source fingerprint, baseline commit, Node version, CPU, and platform.
Every leg is retained separately with its policies, seed, team assignment, completion status, scores, action count, simulation count, resets, and elapsed time.
`events.jsonl` retains training measurements and checkpoint decisions; `checkpoint.json` and `summary.json` expose the latest candidate and champion.
Resume reconstructs optimizer state by replaying retained outcomes in deterministic order.
It can add repeated audit events, but reuses cached legs and paid decisions rather than dispatching them again.
Existing failed legs remain failed; resolving their cause requires a new declared run.
An exclusive `run.lock` prevents two coordinators from writing the same run or duplicating paid requests.
A normal exit releases the lock.
After an abrupt process termination, check the recorded process and host before removing a stale lock and resuming.

For evaluation, copy `classic-capacity-pilot.json`, replace `candidate` with the candidate or champion vector from the training artifact, and select an opponent.
An MCTS opponent is `{"kind":"mcts","weights":{...}}`; a prior-free opponent uses `"weights":null`.
The complete weight object must contain exactly the 16 documented features.
Unknown fields, invalid weights, incompatible budgets, and malformed cached results are rejected.

Deal namespaces separate training, promotion, validation, final test, and periodic LLM validation within one campaign seed.
Use the same master seed when comparing arms to retain those shared blocks.
Different master seeds do not have a mathematical cross-campaign non-overlap guarantee; audit their generated deal sets before combining campaigns.
All pilot and previously inspected deals are development data and must be excluded from final tests.
The manifest alone does not make a repeatedly viewed test set untouched.

## LLM comparisons

The LLM adapter uses the existing heuristic-ranked menu of at most 40 actions and adds public-memory bounds and the full visible pile to the prompt.
This is a new comparator version, distinct from the old GUI prompt.
MCTS retains its own move generator, so the comparison measures the complete policies rather than isolating decision quality on an identical action menu.
The engine validates every selected action and determines the outcome.
No LLM explanation is used as a judge.

Add an explicit `llm` object to a training configuration for periodic validation, or select `"opponent":{"kind":"llm"}` in an evaluation configuration and set `parallel:false`.
The required fields are `model`, `maxRequests`, `maxCostUsd`, `maxOutputTokens`, and `pairs`.
No model or spending allowance is selected implicitly.
For evaluation mode the top-level `pairs` controls the comparison; the nested `pairs` controls periodic training checks.
Set `checkpointEvery` to 100 for the requested validation cadence.
The final training checkpoint is evaluated too.

Supply `OPENROUTER_RESEARCH_API_KEY` through the environment.
The runner checks the key's existing provider-side limit before generation: it must not reset, must include BYOK usage, and must be no greater than `maxCostUsd`.
It does not create or change keys or account settings.
These checks use OpenRouter's documented [current-key endpoint](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key) and [spending-limit fields](https://openrouter.ai/docs/api/api-reference/api-keys/update-keys).
Use a research key whose allowance matches the intended run; do not enlarge it during a campaign.
The provider enforces the dollar cap; the runner separately caps request count, records reported costs, and stops further generation after an unknown cost or failed request.

Each request is recorded before dispatch, then completed with a validated action index and available token/cost metadata.
Keys, authorization headers, and raw provider errors are not written to these records.
Model failures, invalid choices, unknown outcomes after a crash, and exhausted budgets produce incomplete matches without heuristic fallback or automatic retries.
Live validation uses one outstanding request at a time.
Cached requests are deterministic replay records, not new independent LLM samples.
Model aliases and provider changes still limit live reproducibility; request IDs and resolved model names are retained.

Periodic LLM results are development diagnostics, including the candidate and a frozen reference anchor on the same blocks.
They do not promote a policy or establish the final LLM claim.
For the final comparison, freeze the candidate, exact LLM comparator versions, search budgets, sample sizes, and family error allocation, then run fresh test blocks.
Require the one-sided lower confidence bound to exceed 0.5 for each LLM named in the claim.
A win against one selected model does not establish superiority to all LLMs.

## Pilot protocol fixed before training

The executable pilot uses the committed `classic-training-pilot.json` configuration: two SPSA updates, one paired training block per perturbation, and two paired blocks for each of the three promotion comparisons at the final checkpoint.
It schedules 20 complete matches in total, subject to explicit failure and runtime caps.
Each MCTS decision must finish four simulations at depth eight within a ten-second emergency limit.
This pilot tests the optimization, pairing, persistence, and promotion mechanisms, not deployment strength.
Keep the champion if evidence is inconclusive.
Do not select new seeds or alter thresholds after observing its outcomes.
No paid LLM calls are part of this pilot.

Before this pilot, a development capacity pair with the same four-simulation budget completed both matches against the handcrafted bot with zero resets.
MCTS won both legs; one paired block leaves the reported confidence interval uninformative.
An earlier worker startup failed because Node could not load a TypeScript worker entry directly; a small ESM bootstrap now registers the installed `tsx` loader.
The CLI regression test exercises that worker boundary and resume behavior.

## Executed pilot results

The [raw records](classic-training-pilot-results.json) retain the capacity probe, failed training attempt, and three complete executions of the same planned training conditions.
The first training attempt stopped because one decision completed only two of its required four simulations within the emergency limit.
Its incomplete leg remains in the records and did not become a draw or an optimizer measurement.

Profiling the final ten seconds of that failed match placed 8797 of 9149 samples inside the opening-completion search.
Sharing its memo and counting all remaining original cards as possible opening points did not resolve the captured failure.
The implemented bound excludes pile-origin points and original cards that provably cannot join or create any meld.
It applies after a pile pickup and preserves the separate stock-draw concealed-going-out exception.
The captured observation and RNG position are retained in `tests/fixtures/slow-opening.json` and exercised by a bounded regression test.
This is evidence for recovery at that position, not a general speedup estimate.

Each completed execution ran all 20 planned matches.
The first SPSA update measured equal fitness for both perturbations and left the coefficients unchanged.
The second measured 1.0 versus 0.5 and changed the candidate coefficients.
On the fresh incumbent comparison, the candidate won two matches and lost two: paired mean 0.5, with one-sided bounds covering the full range `[0, 1]`.
The reference-anchor difference was 0.25, also with uninformative bounds `[-1, 1]`.
Neither promotion criterion passed, so the champion remains the reference vector.

All three complete executions produced identical scores, action counts, simulation counts, and candidate weights for the same conditions.
They test deterministic replay and are not independent strength samples.
The final resume reused every completed leg, dispatched no new matches, returned the identical summary, and released its run lock.
LLM validation was explicitly skipped because no funded, pinned opponent was configured.
No paid requests were made.

## Current evidence and limits

Behavioral checks cover reference-score reconstruction, deterministic search replay, interrupted-rollout accounting, full-match scoring, team swaps, fresh histories, hidden-state projection, caps, invalid actions, confidence bounds, SPSA on a known objective, promotion gates, worker startup, resume, and mocked LLM failures and budgets.
Live provider behavior and statistically confident LLM superiority remain unverified until the chosen models and funding limits are supplied and the registered comparisons finish.
The next larger study needs measured variance, repeated independent training runs, the random-search control, and deployment-time-budget evaluation before choosing a final candidate.
