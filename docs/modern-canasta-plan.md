Classic Canasta supports retaining the current priors for classic play and reusing the generic information-set search for modern Canasta.
The experiments establish a strong prior benefit at eight simulations per decision; they do not isolate the benefit of UCB allocation or establish near-optimal play.
The modern research engine now has provisional rules, state transitions, search, and training studies; the GUI still uses classic rules.
The selected modern rule profile remains provisional until the user confirms the intended variant.
The user's current goal permits LLM testing only after the modern policy meets both local performance targets.

The [completed classic study](classic-1000-results.md) contains 1000 optimization and evaluation matches plus 100 fresh champion-versus-zero-prior matches.
The retained reference won the fresh comparison 89–11.
The trained candidate scored 48% against the incumbent and failed promotion.
Both policies won their two LLM diagnostic games, but those comparisons share one deal seed and do not establish reliable superiority over LLMs.

The selection rule in [mcts.ts](../src/bot/mcts.ts) is availability-aware UCB with progressive bias:

```text
Q(a) + C * sqrt(log(availability(a) + 1) / visits(a))
     + beta * H(a) / (visits(a) + 1)
H(a) = tanh(weightedFeatures(a) / 100)
```

Unvisited actions receive priority, ordered by their heuristic prior, with uniform selection among ties.
This is a decaying heuristic bonus, rather than a probabilistic PUCT policy.
The [Canasta adapter](../src/bot/canasta-search.ts) sets progressive widening to `ceil(sqrt(nodeVisits + 1))`.
At eight simulations, at most three root actions can receive visits.
A deterministic 20-action terminal-game probe confirmed eight simulations distributed over three root actions with visits 3, 3, and 2.
At two simulations, the exploration constant cannot choose between previously visited actions under this widening rule: at most one root action has been visited, and the deeper tree has no visited action before the second simulation.
A synthetic regression compared constants zero and 1000 over 200 fixed-seed cases with one or three root actions and found identical decisions and statistics.
The two-simulation modern studies therefore do not measure a benefit from the UCB exploration constant.
Where many actions are legal, the prior therefore decides much of the small candidate set that search evaluates.
The experiment changed both this ordering and the UCB prior bonus together.
It cannot attribute the 89% result to either mechanism separately.

The strongest missing comparison is against a greedy policy using the same legal candidate actions and reference features.
A root-only Monte Carlo comparator can help isolate the contribution of deeper tree search.
The generic search now supports a `maxTreeDepth` limit while retaining the same total evaluation depth and rollout policy.
Setting it to one gives a root-only tree that still uses UCB at the root, so a comparison with the full tree tests deeper tree search rather than UCB against uniform sampling.
The synthetic refutation test distinguishes the two modes, but no modern match-strength result for this control is established yet.
The [paired hand diagnostic](modern-tree-depth-hand-results/summary.md) compared full and root-only search at eight simulations and total depth three.
Full search scored higher in 13 of 24 hands, below the predeclared 14-hand threshold, and all budgets were met; the records replayed exactly.
The sample is too small and uses hand score rather than full-match wins, so it cannot establish a strength difference.
The zero-prior opponent retained the same heuristic rollout policy and cutoff evaluation, so it was not free of domain knowledge.
UCB remains a sound mechanism to investigate, but its incremental playing strength needs those comparisons.
Information-set MCTS also retains hidden-information approximations; audit observation-dependent node sharing and simulated partner/opponent decisions before adding information-sensitive features.
The [information-fusion counterexample](modern-information-fusion-results/summary.md) gives a simulated opponent a visible hidden bit that determines its optimal response.
The original tree estimated the first player's value as 0.5074 instead of the exact value zero because its opponent statistics merge the two observed bits.
The example identifies a real limitation of the generic search but does not measure its effect in Canasta.
The generic search now has an opt-in observation-key partition, which estimated 0.0032 on the same example; the modern adapter does not yet use it.
An adapter must key simulated decisions by the acting player's information without exposing other hidden state, then be evaluated against the existing search.
The [ISMCTS paper](https://eprints.whiterose.ac.uk/id/eprint/75048/) supplies the algorithmic reference, not a guarantee of optimal Canasta play.

The optimizer received a coarse signal: one paired block per perturbation, 16 coefficients varied together, and 31 of 70 updates with identical plus/minus fitness.
The remaining differences were 18 at +0.5, 17 at -0.5, two at +1, and two at -1.
All training opponents used the frozen reference in this run.
Broader perturbations alone therefore did not establish a better policy or robustness against a league of opponents.
Large feature scores can also saturate the current `tanh` prior; measure actual action-ranking changes and saturation before choosing another perturbation range.

The promotion bounds were valid but very conservative for the sample size.
With 100 paired blocks and alpha 0.025, superiority required an observed win rate above 63.58%.
The non-inferiority bound over differences in [-1, 1] required an observed improvement above 25.16 percentage points to clear the -2-point margin.
The candidate's 48% result provides no positive point estimate, but these gates would also miss modest real gains.
Keep the historical verdict unchanged.
For the next study, select a meaningful effect size, a paired inference method with justified coverage, and a sample size that can resolve that effect before generating evaluation outcomes.
The [future confirmation calculation](modern-future-confirmation-plan.md) gives example sample sizes and observed-win thresholds for the modern 60% and 90% targets.
It does not change any already-running study or substitute threshold arithmetic for a power analysis.

The timeout and tie-selection failures also matter for modern Canasta.
The opening search initially spent its budget enumerating equivalent sequences; a bounded constructive proof removed that failure mode.
A separate tie test exposed action-order bias before the final study.
Keep both regressions, card-inventory invariants, and exact simulation-budget checks.
The modern opening proof will need its own correctness argument because its eligibility and meld constraints differ.
The existing classic proof must not silently become the modern rules oracle.
The interrupted paid request also shows a runner limitation: future cancellation should stop scheduling new requests, retain the current partial match, and allow an already dispatched request a bounded opportunity to record its receipt.
The present journal conservatively retains the full reservation for the unknown charge.

The user's [strategy.md](../strategy.md) supplies useful hypotheses and remains unchanged and untracked.
Its rules and strategic claims need different treatment:

| Idea | Interpretation for implementation | Check before adopting it |
| --- | --- | --- |
| Retain pairs and meld only enough to open | Preserve opportunities to take the pile and complete future melds; the benefit depends on stock, scores, and opponents | Compare retained pair value against immediate scoring and ending risk |
| Save wild cards | Estimate the opportunity cost of spending a wild, including which completions remain possible | Compare equal legal positions with and without a useful completion available |
| Keep two sevens | Candidate defensive policy that can block an opponent while avoiding the three-card hand threshold | Test joint team inventory, public locations, end-of-hand risk, and legal discard availability |
| Discard the third seven as a keeper signal | A probabilistic convention among compatible partners | Test mixed partners and deceptive opponents; never turn the signal into an exact card constraint |
| Never table an incomplete seven meld | Conservative candidate policy whose cost and benefit require measurement | Compare immediate completion, blocked completion, and credible multi-turn completion scenarios |
| Bait an opponent with a discard | Opponent-dependent prediction about future pile access | Evaluate against several frozen policies; preserve an uncertainty estimate |
| Target a 2:1 natural/mixed ratio | An unvalidated target; use marginal action value as the baseline | Require improved match outcomes before adding a ratio objective |
| Go out quickly when behind and delay when ahead | A proposed timing policy, not a universal consequence of the score | Optimize match-winning probability and test both score contexts |

Two discarded sevens can still be available through a later pile pickup.
Two sevens held by an opponent block completion only while they remain unavailable.
For a seven-risk policy, compare at least these cases: an immediately completable seven canasta, a seven meld whose completion is blocked by cards fixed in the opposing meld, and sevens that are merely known in an opponent's hand or visible in the pile.
Treat the last two locations as potentially changeable and retain duplicate-face uncertainty when cards leave a known hand.
Measure the policy against the existing prior on paired full matches rather than imposing a blanket rule against incomplete seven melds.
The opt-in `sevenBlockedV1Weight` adds a separate prior adjustment when an action commits sevens after the opposing team has committed at least two sevens.
This committed-card condition makes a seven-card meld impossible from the eight available sevens, while cards in an opponent's hand or the pile are not treated as permanent blockers.
The feature does not award an undo bonus, and its default weight is zero so the existing baselines retain their behavior.
Its signed weight is an untrained research parameter, not a claim that every such action is strategically bad.
Headless study configurations can set separate weights for the two policies and bind them to the retained experiment identity.
The [seven-risk sensitivity protocol](modern-seven-sensitivity-results/protocol.md) compares weights zero and 100 along five handcrafted-policy hands at each of three symmetric starting scores.
It predicts fewer than 5% changed choices and at least one position with a playable action affected by the new feature.
The [result](modern-seven-sensitivity-results/summary.json) changed none of 876 positions with multiple visited root actions, and none of the 1459 sampled positions had a playable action affected by the feature.
Two positions contained at least two opposing committed sevens, but neither offered such an action.
The first prediction held and the second was falsified on these sampled paths; all budgets were met and the records replayed exactly.
These correlated hands do not establish population frequencies or the feature's effect on match strength.
The guide's pack-freezing advice also mixes rule families: the proposed modern reference forbids discarding threes and restricts wild-card discards.
The game must reject an illegal strategic suggestion before search considers it.

The working modern reference is [Canasta.com's Modern Canasta rules](https://canasta.com/rules/), checked on 2026-10-31, pending the user's ruleset choice.
It gives sevens pure melds, a 2500-point completed-canasta bonus, a 2500-point incomplete-meld penalty, and a 1500-point penalty for three or more sevens in one player's hand.
An incomplete seven meld also prevents going out.
These are game rules; optimization may choose when to take the risk, but cannot change those thresholds.
The specification must also cover aces, wild-card melds, threes, closed ranks, pile access, initial melds, bonus draws, special hands, and stock exhaustion.
The page specifies a one-card draw; the older ADR's generic American-canasta description says two.
Resolve this discrepancy and any ambiguous examples in a versioned rule table before implementing the modern preset.

The proposed module boundaries preserve the current dependency direction:

| Owner | Responsibility |
| --- | --- |
| `src/canasta` | Authoritative legal actions, transitions, end conditions, and exact scoring for each versioned ruleset |
| `src/game/canasta-history.ts` | Public transfers and observations, including new modern phases and bonus draws |
| `src/bot/card-knowledge.ts` | Generic face multiplicities, known-card bounds, unknown slots, and feasible sampling |
| Canasta search and policy adapters | Variant-aware action candidates, completion proofs, priors, rollouts, and state value |
| `src/bot/mcts.ts` | Generic sampling, tree statistics, UCB selection, widening, and bounded search |
| Research harness | Paired schedules, policy versions, budget checks, measurements, and promotion decisions |

Keep classic and modern policies explicitly associated with their rules and feature versions.
Use serializable rules and explicit variant dispatch at the game boundary; avoid placing rule callbacks in persisted match state or rank-specific branches in the generic search.
Retain the verified classic behavior behind the current game facade while adding modern behavior in increments.
The current arena and several validators hard-code classic rules and a 5000-point target; generalize the future runner while preserving the historical classic-study verifier.
Robbers rummy should later provide another game adapter and policy, reusing the search and inventory machinery where their contracts fit.

Implement in this order:

1. Freeze the rules and acceptance examples.
   Resolve the selected rule source, contradictory passages, special-hand support, partner permission to go out, and exact stock-end behavior.
   Produce independently calculated examples for two/three held sevens, six/seven melded sevens, and every phase transition.
   Stop before rule-dependent implementation if these examples disagree.
2. Implement the modern state machine and scoring behind a separate versioned ruleset.
   Include deal setup, bonus draws, opening eligibility, discard restrictions, special endings, and rollback of an unfinished turn.
   Check conservation of all 108 cards, exact scores at thresholds, reset behavior, and saved-game round trips.
   Existing classic fixtures must retain their outcomes; unsupported saved versions must fail explicitly.
3. Extend public history and belief sampling for the new transitions.
   Preserve the distinction between face counts and physical card IDs when an identical card is played after a known pickup.
   Check repeated pickups, replacement draws, bonus draws, partner counts, and hand boundaries.
   Swapping hidden deals while preserving an actor's observation must not change that actor's inputs or fixed-RNG root decision.
   Keeper signals remain optional probabilistic evidence, separate from hard inventory constraints.
4. Build a simple modern policy and validate search coverage before tuning.
   Add features for completion feasibility, incomplete-meld exposure, dangerous-card thresholds, opponent access to the pile, known partner support, and ending risk.
   Keep prior, rollout, and cutoff-value parameters separate.
   Audit the current action generator, which offers small subsets and whole rank groups: modern size caps and special hands require a fresh coverage test.
   Compare generated actions and opening witnesses with exhaustive enumeration on small inventories.
   Compare atomic actions with complete-turn plans only if depth measurements show that multi-meld turns consume the useful horizon.
5. Calibrate search on headless local games.
   Compare greedy play, root-only Monte Carlo, zero-prior UCB, and prior-guided UCB at 8, 32, 128, and 512 simulations.
   Isolate expansion ordering from the decaying bonus, and hold rollout and value policy fixed in those comparisons.
   Then test rollout and cutoff-value changes separately.
   Record distinct root actions, visit concentration, completed depth, transition calls, deadline failures, and latency, alongside paired full-match wins.
   Confirm promising settings under equal wall-clock limits, since equal iteration counts can require different amounts of work.
6. Tune and release only after those checks.
   Use more paired deals per perturbation, several independent optimizer seeds, a random-search baseline with equal work, and a frozen opponent archive.
   Check mixed-partner play as well as identical-bot partnerships.
   The cutoff value must reflect modern completion risk and cumulative match score; directly applying classic `tanh(scoreDifference / 1000)` would be an unvalidated transfer.
   Use fresh promotion deals and preregistered bounds, preserve failed trials, and retain the incumbent when evidence is inconclusive.
   Add the modern GUI preset only after headless rule, belief, search-budget, and persistence checks pass; keep the built-in bot as the GUI's sole AI.

The standalone modern team scorer now covers special meld bonuses and penalties, per-player held-card thresholds, threes by color, ordinary card values, and declared special-hand scores.
The provisional modern implementation now also includes meld, opening, discard, and going-out checks, plus dealing, drawing, pile pickup, special-hand declaration, melding, extension, and undo transitions.
The engine can retract the most recently melded card while retaining a valid remainder, including when an empty tray requires a different discard.
The provisional public view hides other hands and face-down bonus cards and does not expose physical deck IDs on public cards.
The generic belief model can account for cards leaving a hidden row without revealing their faces, while keeping conservative face-count bounds.
Its sampler produces feasible allocations, but its randomized flow fallback is not a uniform sampler or a calibrated posterior.
Measure fallback frequency and compare sampled frequencies with exact enumeration on small constrained inventories before relying on probability-sensitive conclusions.
A diagnostic uses four copies each of three faces, four rows of three cards, and different face exclusions in the first three rows.
It compares 20000 sampled allocations with the exact physical-deal distribution for the first row's count of one face.
The prediction is that at least one category differs by more than two percentage points when the rejection fallback is frequent; this does not estimate bias in actual Canasta positions.
In the [toy diagnostic](modern-sampler-toy-results/result.json), the largest difference was approximately 17.5 percentage points across 20000 samples.
Exact enumeration found 1092 valid face sequences among 34650, and a separate enumeration reproduced those counts.
Under independent rejection attempts, that acceptance rate implies approximately 77% of calls reach the eight-failure fallback; this is a calculation for the toy case, not an observed Canasta rate.
The sampled output replayed exactly with its fixed random seed.
The next diagnostic instruments a copy of the sampler and checks each sampled allocation against the original with the same random seed.
It uses five samples at each position from five complete handcrafted-policy hands, including positions with known cards in other hands.
The working prediction is that fallback will occur in more than 10% of the samples pooled across positions with a known other-hand card; this small diagnostic cannot estimate a population-wide fallback rate precisely.
The [observed-position diagnostic](modern-sampler-real-results/results.jsonl) recorded fallback in 97 of 2280 samples across 456 positions.
At positions with at least one guaranteed card in another hand, fallback occurred in eight of 630 samples, falsifying the stated 10% prediction on these trajectories.
A position without a guaranteed other-hand card can still have other constraints, including upper bounds.
Every instrumented allocation matched the original sampler for the same seed, and the diagnostic replayed exactly.
Positions and samples from the same hand are correlated, and these five hands do not establish a population-wide rate or the distribution of fallback error in real games.
The [fixed-copy toy protocol](modern-fixed-copy-toy-results/protocol.md) compares the sampler with uniform physical allocations for two indistinguishable A faces, one B, and one C, with two cards per hand and at least one A in the first hand.
All candidate allocations satisfy the bounds on the first attempt, so the flow fallback cannot occur in this toy.
Exact enumeration gives probability 0.20 that the first hand has both As, while the [sampler result](modern-fixed-copy-toy-results/result.json) gives 0.33195 over 20000 fixed-seed samples and replays exactly.
This supports the predicted model difference for the toy, but neither allocation model is established as the true posterior for a particular public history.
The [duplicate-history toy](modern-duplicate-history-toy-results/protocol.md) specifies a different generative model: a known A is taken, then the player discards a uniformly chosen physical card and the observed face is A.
Exactly two of four equally likely observed events leave another A in the hand, but the [bounds-based sampler](modern-duplicate-history-toy-results/result.json) assigned probability 0.33385 over 20000 fixed-seed samples.
The result replayed exactly and shows a posterior mismatch for this explicit model, not a measured error for real Canasta opponents.
The conservative bounds remain useful for what is possible or guaranteed, but those bounds alone do not determine a posterior after strategic choices.
Any calibrated history-aware sampler needs an explicit action-likelihood model and must preserve uncertainty about duplicate identities and hidden transfers.
Compare candidate models with exact small cases and held-out games before adopting one for rollout probabilities.
The research-only [exact card-history oracle](exact-card-history.md) enumerates bounded small inventories under a supplied discard model and supports public gains, observed discards, hidden transfers, and exact row observations.
Its tests reproduce the duplicate-history toy, distinguish two discard models, and check multiplicities, impossible evidence, state limits, and underflow.
An additional small-deck regression checks that the conservative inference bounds retain every exactly enumerated world after duplicate-face gains, observed discards, hidden transfers, and a second public pickup.
This checks 28 constructed histories, not all possible game histories.
It is not yet connected to modern rollouts and does not establish an opponent model for real games.
The provisional match wrapper settles scores and rotates the deal.
The initial UCB adapter samples hidden deals and handles decisions throughout a turn.
Twelve diagnostic headless hands completed at up to two simulations per decision, including staged pile pickups and both stock and going-out endings.
These probes do not establish playing strength or full-match correctness.
One same-policy match with at most two simulations and a 100 ms limit per decision reached its 20-hand cap at 5630–1450 without a winner.
It stopped short of two simulations on 1114 of 2025 decisions, so it cannot support a fixed-simulation strength comparison.
After optimizing opening proofs, one diagnostic hand completed two simulations on every decision with a 1000 ms limit; its slowest decision took approximately 253 ms.
That single hand is a calibration check, not evidence that the budget is sufficient across matches.
One subsequent same-policy match with seed 121, two simulations per decision, depth three, and a 5000 ms ceiling completed in nine hands at 7075–11725 with no missed simulations.
This is one integration and budget check, not a comparison of policies.
In one short probe, the first 20 decisions at eight simulations and depth eight completed all 160 simulations with a 2000 ms per-decision ceiling.
The slowest of those decisions took about 745 ms, and the hand was not complete at the stopping point.
The local-only `scripts/modern-study.ts` runner retains each paired match leg and binds resume to the configuration, source fingerprint, and Node version.
Its optional `aPriorWeight` and `bPriorWeight` settings vary progressive-bias strength independently for the two policies.
A strength of zero removes the progressive-bias term but retains prior-based ordering of unvisited actions; a null prior removes both.
Its fixed-simulation summary is eligible only when every planned leg finishes and every decision completes its declared simulation budget.
The [first paired pilot](modern-paired-pilot-results/summary.json) produced two handcrafted-prior wins on one deal, but four decisions missed the fixed simulation budget.
The pilot is therefore ineligible for a win-rate estimate and does not establish either local target.
After the pilot, a proof-only optimization grouped cards by rank and pile eligibility while leaving root action choices face-specific.
On six fixed post-draw positions, the number of returned playable actions matched the preceding probe.
One run took approximately 17–55 ms per position after the change, while the preceding run took approximately 22–101 ms and reached its 100 ms cutoff on one position.
These are single measurements under changing shared-machine load, not a controlled speed estimate or evidence that future budgets will always be met.
An additional sequential comparison on 12 fixed post-draw positions found identical returned action keys with neither version reaching a 1000 ms cutoff.
The previous and new proofs took approximately 539 ms and 363 ms in total, respectively; execution order and machine load were not controlled.
An alternating-order comparison then covered 90 post-draw positions across all three opening-score bands and found identical action keys with no 200 ms cutoffs.
The previous and new proofs took approximately 2391 ms and 1593 ms in total in that single run, with shared-machine load uncontrolled.
For an eligible fixed study, its 95% Hoeffding interval treats each paired deal as one bounded observation.
This interval assumes the paired deal seeds represent independent draws from the intended deal distribution and does not correct for selecting policies on the same evaluation data.
A null prior removes tree prior bias, while both policies continue to use the same handcrafted rollout policy.
The local-only `scripts/modern-optimize.ts` runner tests symmetric SPSA perturbations against a frozen opponent league on the same paired deals.
It retains each leg and stops an update when a leg is incomplete or misses its fixed simulation budget.
Optimization produces an exploratory candidate, not a promotion or a claim about held-out performance.
Single-hand research scenarios can start both sides at a specified hypothetical score below 8500.
Their plans retain that score, and scenario legs cannot contribute to a full-match win rate even when a hand crosses the match target.
These symmetric scenarios cover opening thresholds but do not represent a side being ahead or behind in a real match.
The optimizer can rotate a list of starting scores across dealer cycles for its hand-score objective.
With three scores and two opponents, 24 blocks cover every score, dealer, and opponent combination once per perturbation.
The same scenario and deal are used for the positive and negative perturbations.
The [first optimizer pilot](modern-optimizer-pilot-results/result.json) stopped before its first update.
The plus perturbation lost both legs against the handcrafted prior, and both legs against the zero-prior tree reached the 80-hand cap with negative scores for both sides.
All four legs met their fixed simulation budgets, but neither capped leg is a win or loss and the weights remain unchanged.
The run used a tested, uncommitted proof optimization, whose exact patch and source fingerprint are retained with the results.
The optimizer also supports a separate paired one-hand score objective as a training proxy.
It compares each side's settled hand score after swapping seats, without treating a capped match as a completed match.
The initial pilot starts every hand at a 0–0 match score and therefore does not represent higher opening thresholds or match-winning strategy.
At two simulations with the current widening rule, the root expands two previously unvisited actions.
This setting primarily tests prior ordering and short rollouts rather than the benefit of UCB allocation among visited root actions.
At that budget, multiplying every feature weight by the same positive factor preserves their ordering apart from numerical ties.
The experiment therefore cannot calibrate an overall prior strength independently of relative feature weights.
In a [20-position diagnostic](modern-depth-probe-results/results.jsonl), all two-simulation and eight-simulation searches completed their declared budgets.
Thirteen positions had multiple visited root actions at eight simulations, and all 13 revisited at least one action.
The selected actions differed in eight positions.
The probe also changed the depth from three to eight, so it does not isolate the effect of UCB or establish stronger play.
The original [ISMCTS pseudocode](https://eprints.whiterose.ac.uk/id/eprint/75048/1/CowlingPowleyWhitehouse2012.pdf) increments availability for existing sibling nodes that were available on the completed iteration.
The current search likewise retains availability counts for expanded actions rather than creating persistent edges for every unexpanded action.
A [CPU profile](modern-depth-profile-results/manifest.json) of this short probe recorded 632 sampled hits in Node's performance clock among 3330 attributed hits, alongside meld and opening validation costs.
The profile includes startup, TypeScript loading, idle time, and uncontrolled shared-machine load, so it is a lead rather than a controlled speed estimate.
Its recorded decisions matched the unprofiled probe exactly.
Reducing deadline checks requires a separate latency and correctness test because it can increase deadline overruns.
Modern headless search currently checks its deadline cooperatively; one 100 ms probe returned after approximately 116 ms.
A [synthetic fallback probe](modern-fallback-probe-results/result.json) also found a legal forced wild-card discard for which zero-time search returned no action.
The position contains two completed canastas and populated opposing hands; the probe does not establish a complete preceding game history.
The fallback now recognizes forced wild discards from the acting player's starting hand and the unchanged public pile.
A [regression test](../tests/unit/modern-fallback-wild.test.ts) checks the legal discard and rejects a wild discard made illegal by an earlier meld.
This fix does not establish that every reachable position has a zero-time fallback.
A hard external deadline requires a worker or equivalent isolation that can return the last completed result and terminate an overrun.
The headless Node wrapper `chooseModernInNodeWorker` starts its deadline before worker creation, passes the acting player's observation, and publishes only completed search results or the existing fallback.
It supports cancellation, reports worker failures, and terminates the worker when the timer expires.
The worker starts without inherited environment variables, but it retains the process's filesystem privileges and is not a security sandbox.
Real worker tests cover cancellation, completed progress, a short-deadline fallback, and input validation.
Node and operating-system scheduling still limit the wall-clock guarantee, and no legal fallback is claimed for every reachable position.
The Node TypeScript worker bootstrap uses the project's installed development dependency `tsx`, and cold startup counts against the thinking budget.
This boundary has not been integrated into the modern GUI or the research arena.
An environment-specific [Node worker probe](modern-node-worker-probe-results/manifest.json) found that a direct TypeScript worker entry failed with an unknown extension under Node 22.22.1 and tsx 4.23.15.
A JavaScript bootstrap using the tsx import API loaded the same TypeScript module successfully.
This checks module loading only, not deadline enforcement, deployment compatibility, or a legal fallback.
The [hand-training pilot](modern-hand-training-pilot-results/update-1.json) completed one update on eight hands, with no missed simulation budgets.
The plus and minus perturbations scored 0.75 and 0.25 respectively on those hands; this small pilot establishes the training path, not candidate strength.
Replaying its retained records reproduced the update, and its exact uncommitted source patch is stored with those records.
The [subsequent ten-update run](modern-hand-training-results/update-10.json) completed 160 hands without a missed simulation budget and replayed to the same candidate.
Both teams scored below zero in 31 of those hands, and the mean side score was approximately 28 points.
These are mixed perturbation and opponent results, so they do not estimate the final candidate's match performance.
The provisional cutoff maps score difference through a hyperbolic tangent with a 2500-point scale.
At very large leads this value saturates near one before the leading side has reached 8500 points, so small changes in score can become nearly indistinguishable.
This may contribute to long games against a negative-scoring opponent; compare alternative cutoff values on matched positions and full matches before attributing the cause.
That run assigned each of its two opponents only two of the four dealer seats because the opponent and dealer schedules both used the block index.
Seat swapping still occurred within each deal.
The scheduler now rotates the opponent league across dealer cycles, and regression tests check all dealer seats with both two- and five-opponent leagues.
The retained compressed source patches preserve the exact code used by each run.
In fresh full-match pilots, the candidate won both legs against the [handcrafted prior](modern-trained-vs-handcrafted-pilot-results/summary.json) and both legs against the [zero prior](modern-trained-vs-zero-pilot-results/summary.json).
All four games completed their simulation budgets.
Each comparison used only one paired deal, so neither establishes the requested full-match win rate.
The subsequent [100-game handcrafted comparison](modern-trained-vs-handcrafted-100-results/summary.json) finished 54–46, with no incomplete games or missed simulations.
Its paired 95% Hoeffding interval is approximately 0.35–0.73, and the observed result is below the requested 6:4 ratio.
Replaying the retained records reproduced the summary, so this candidate is not promoted.
The independent [100-game zero-prior comparison](modern-trained-vs-zero-100-results/summary.json) finished 94–6, with no incomplete games or missed simulations.
Its paired 95% Hoeffding interval is approximately 0.75–1.00, so the observed ratio exceeds 9:1 but the interval does not establish a win rate above 90%.
The zero-prior policy still uses the handcrafted rollout policy, and both studies used two simulations per decision at depth three.
Replaying the retained records reproduced this summary as well.
The [next exploratory hand-training run](modern-hand-training-balanced-results/update-20.json) used balanced dealer seats, eight blocks per perturbation, a larger perturbation, and a separate seed split.
It completed 640 hands and 20 updates with no missed simulation budgets, and its retained records replayed to the same candidate.
Both teams scored below zero in 157 hands, and the mean side score was approximately −106 points across the mixed perturbations and opponents.
Its one-hand objective still starts at 0–0, so it does not replace independent full-match evaluation.
An opening-band scenario check used the same paired deal at [0](modern-opening-band-0-pilot-results/hand-summary.json), [3000](modern-opening-band-3000-pilot-results/hand-summary.json), and [5000](modern-opening-band-5000-pilot-results/hand-summary.json) points per side.
All six hands met their two-simulation budgets and remained ineligible as full matches.
The 0 and 3000 scenarios had the same final score changes and action counts, while the 5000 scenario differed in both.
Each scenario's retained records replayed to its ineligible match summary.
The [three-band optimizer pilot](modern-opening-band-optimizer-pilot-results/update-1.json) completed 96 hands and one update with no missed simulation budgets.
Its positive and negative perturbations had hand scores of approximately 0.396 and 0.333, respectively.
One hand crossed the target and was recorded as a scenario hand, not a match win.
The pilot replayed to the same update; this is an integration check, not a claim of stronger match play.
The [three-band training run](modern-opening-band-training-results/update-10.json) completed ten updates across 960 hands, with no missed simulation budgets.
Replaying its retained records reproduced the final weights.
The hand-score objective is a proxy and does not establish full-match strength.
Its fresh [20-game handcrafted screen](modern-band-vs-handcrafted-screen-results/summary.json) finished 9–11 with no incomplete games or missed simulation budgets.
The paired 95% Hoeffding interval is approximately 0.02–0.88, so this screen neither establishes nor rules out the requested 6:4 advantage.
The retained match records replayed to the same summary, and this candidate is not promoted.
Its independent [20-game zero-prior screen](modern-band-vs-zero-screen-results/summary.json) finished 20–0 with no incomplete games or missed simulation budgets.
The paired 95% Hoeffding interval is approximately 0.57–1.00, so this screen does not establish a win rate above 90%.
Its retained match records replayed to the same summary.
An exploratory next candidate is the [positive perturbation from update three](modern-opening-band-training-results/update-3-plus-block-0.job.json), selected after inspecting the training hands.
It scored 13–11 against the handcrafted prior and 17–7 against the zero prior in its respective 24-hand training subsets.
Because this choice uses the training results and compares several perturbations, those figures are selection-biased and do not establish candidate strength.
Fresh, separate 20-game full-match screens against each opponent use new seed splits, two simulations, depth three, and seat-swapped deals.
The screens are exploratory and are not sufficient to promote a policy or open the LLM gate.
The [handcrafted screen](modern-perturbed-vs-handcrafted-screen-results/summary.json) finished 10–10 with no incomplete games or missed simulation budgets.
Its paired 95% Hoeffding interval is approximately 0.07–0.93, so the screen neither establishes nor rules out the requested 6:4 advantage.
The retained records replayed to the same summary in a worktree pinned to the original experiment source.
Both screens were stopped once to preserve their source while the fallback was fixed; interrupted legs were recorded separately and did not count as match results.
The independent [zero-prior screen](modern-perturbed-vs-zero-screen-results/summary.json) finished 19–1 with no incomplete games or missed simulation budgets.
Its paired 95% Hoeffding interval is approximately 0.52–1.00, so it does not establish a win rate above 90%.
The retained records replayed to the same summary in the source-pinned worktree.
The balanced candidate's [20-game handcrafted screen](modern-balanced-vs-handcrafted-screen-results/summary.json) finished 10–10 with no missed simulation budgets.
Its paired 95% Hoeffding interval is approximately 0.07–0.93, so this screen gives no positive evidence of the requested 6:4 advantage and is too small to rule one out.
Its independent [20-game zero-prior screen](modern-balanced-vs-zero-screen-results/summary.json) finished 20–0 with no missed simulation budgets.
The paired 95% Hoeffding interval is approximately 0.57–1.00, so this screen does not establish a win rate above 90%.
Both completed screens replayed from their retained records and use two simulations per decision at depth three.
In a [fixed-game sensitivity probe](modern-sensitivity-probe-results/results.jsonl), the balanced candidate and handcrafted prior selected the same actions on all 50 observed positions when given the same random seeds and two-simulation budgets.
The probe replayed exactly, but one trajectory does not establish how often the policies agree in other deals or later positions.
A follow-up probe uses five fixed deals and runs each hand along the handcrafted policy's path.
The working hypothesis is that the balanced candidate changes fewer than 20% of positions where the baseline search visits more than one root action; a result at or above 20% would falsify that threshold for these sampled trajectories.
This diagnostic measures action sensitivity on those paths, not match strength or a population win rate.
The [follow-up](modern-sensitivity-multideal-results/results.jsonl) completed five hands and 456 comparisons with all budgets met.
The selected action differed in four of 284 positions where the baseline visited multiple root actions, below the stated 20% threshold on these trajectories.
The retained records replayed exactly; the positions are correlated within hands and do not establish a population rate.
The [known-pair protocol](modern-known-pair-probe-results/protocol.md) predicts at least one sampled position where a legal natural discard matches two cards guaranteed in the next opponent's hand.
Its first run was stopped before interpretation because its filter also included wild cards, and the retained preliminary files record that correction.
The corrected [15-hand result](modern-known-pair-probe-results/summary.json) found 21 positions with a known next-opponent pair and one position with an eligible matching discard.
The baseline chose that discard, the next opponent took the pile, and the records replayed exactly with all budgets met.
In the reconstructed [case](modern-known-pair-probe-results/case.json), a king was legal and did not allow an immediate pickup in the actual deal, while either eight did.
This observation supports testing a history-aware prior, but it does not prove the king maximizes future match value or establish population frequency.
The opt-in `knownPairV1Weight` adjusts a root discard prior when conservative public-history bounds guarantee that the next opponent holds at least two natural cards of the discarded rank.
The weight-50 candidate was selected from an inspected example, not produced by a training procedure.
Even a favorable held-out result for that candidate would not by itself satisfy the user's trained-prior objective.
The completed [100-game held-out comparison](modern-knownpair-vs-handcrafted-100-results/analysis.json) finished 50–50 against the handcrafted prior, with no incomplete legs or missed budgets.
Its paired 95% Hoeffding interval is approximately 0.308–0.692, and the predeclared uniform-dealer lower bound at one-sided alpha 0.025 is approximately 0.295.
The 60-win observed threshold was not met, so this candidate cannot satisfy the handcrafted target on this study.
The independent [100-game zero-tree-prior comparison](modern-knownpair-vs-zero-100-results/analysis.json) finished 99–1, with no incomplete legs or missed budgets.
Its paired 95% Hoeffding interval is approximately 0.798–1.000, and the predeclared uniform-dealer lower bound at one-sided alpha 0.025 is approximately 0.878.
The observed ratio exceeds 9:1, but that lower bound does not establish a rate above 0.90 under the stated model.
The zero-tree-prior policy still uses the handcrafted rollout and cutoff evaluator.
The handcrafted target failed, so these studies do not open the LLM-testing gate.
It excludes closed ranks and opposing melds that cannot accept the three-card pickup, but it does not claim that every remaining pickup is legal or desirable.
The adjustment uses only the current actor's public observation and belief at depth zero; simulated later decisions do not reuse that belief.
The default weight is zero, and the signed experimental weight is configurable separately for each policy in headless studies.
Regression tests cover identical card faces, removal ambiguity, root depth, the controlled discard choice, worker options, and study identity.
With weight 50, the [replayed case](modern-known-pair-aware-case/result.json) changes the two-simulation decision from an eight to the king.
The weight was chosen after inspecting this case and has not been shown to improve match strength.
The predeclared [exploratory screens](modern-knownpair-screen-protocol.md) compare that weight against both baselines on fresh seed splits.
The [handcrafted screen](modern-knownpair-vs-handcrafted-screen-results/summary.json) finished 12–8 with no incomplete games or missed simulation budgets.
Its paired 95% Hoeffding interval is approximately 0.17–1.00, so the result does not establish a reliable 6:4 advantage.
The retained records replayed to the same summary.
The independent [zero-prior screen](modern-knownpair-vs-zero-screen-results/summary.json) finished 18–2 with no incomplete games or missed simulation budgets.
Its paired 95% Hoeffding interval is approximately 0.47–1.00, so the screen does not establish a win rate above 90%.
The retained records replayed to the same summary.
The candidate was selected for fresh [100-match comparisons](modern-knownpair-heldout-protocol.md) against each local baseline.
Those fixed-sample studies report both the original interval and a supplementary one-sided relative-entropy bound, with their assumptions stated in the protocol.
The next diagnostic measures, on five fixed handcrafted-policy hands, how often each prior feature varies across generated playable actions at a choice position.
The working prediction is that at least seven of the 14 features vary in fewer than 5% of sampled choice positions.
This measures whether features can affect immediate action ordering on those paths, not whether they improve match play.
The [feature-variation diagnostic](modern-prior-feature-variation-results/summary.json) found eight such features among 284 sampled choice positions.
The [discard-risk coverage probe](modern-discard-risk-sensitivity-results/summary.md) found 146 positions in twelve hands where an opponent had at most three cards and legal discards had differing point values.
That count excludes pending bonus cards from the opponent count and does not establish strategic value; a separate ranking probe includes those counts.
The [ranking probe](modern-discard-risk-ranking-results/summary.md) tested hypothetical weights 25, 50, and 100 on the same trajectories and found 61, 81, and 102 changed highest-prior action sets, respectively.
Those changes replayed exactly but do not demonstrate a change in final decisions or match strength.
The [pair-threat ranking probe](modern-pair-surrogate-ranking-results/summary.md) tested a different, explicitly relaxed model of whether the next opponent holds a matching pair.
Weights 25, 50, and 100 changed highest-prior action sets at 231, 259, and 297 of the same 1279 positions, respectively, and the probe replayed exactly.
Two of those positions were caused by floating-point values near zero for impossible pairs; the corrected implementation gives counts of 229, 257, and 295 on the same records.
The model ignores some row constraints, correlations, bonus-three replacement, and opponent decisions, so it is not a calibrated posterior or a pile-pickup probability.
The [model comparison](modern-pair-model-comparison-results/summary.md) checked 222 position-rank cases against 500 allocations per position from the existing constraint-respecting sampler.
The largest observed difference was approximately 0.055, so the prediction of a difference above 0.15 was not met; the records replayed exactly.
An exploratory simultaneous Hoeffding bound allows a largest underlying difference of approximately 0.1502 across these fixed cases under an independent-sampler-draw model.
This agreement on correlated sampled positions does not establish calibration, because the sampler is not a ground-truth posterior.
In a separate [duplicate-history pair toy](modern-pair-history-toy-results/summary.md), an explicit uniform-discard model gives exact conditional pair probability `2/9`, while the relaxed estimate gives `1/6` and the sampler gives 0.167 over 20000 draws.
The toy replayed exactly and demonstrates a mismatch for that specified model, not a measured error for real opponents.
The separate [calibration diagnostic](modern-pair-calibration-results/summary.md) tested the estimate against hidden simulator cards in 24 handcrafted-policy hands.
Across 1180 sampled positions, the mean estimate was 0.18968 and the observed frequency was 0.25508, a gap of 0.06540 that missed the predeclared 0.05 threshold.
All decisions met their budgets and the records replayed byte for byte.
These correlated positions concern matching pairs before bonus-three replacement, not actual pile pickups or human opponents.
The generic [relaxed pair calculation](../src/bot/relaxed-card-pair.ts) now has tests for duplicate copies, known and impossible pairs, invalid inputs, and exhaustive small-population arithmetic.
The opt-in `pairThreatV1Weight` applies the modern-specific signal only at the observed root and defaults to zero.
The [six-weight pair-threat screen](modern-pair-threat-grid-results/summary.md) completed 288 single-hand scenarios and selected weight 50 after a 29–19 training score.
All budgets were met and replay reproduced the selection; fresh full-match comparisons are required to assess the selected candidate.
The [held-out handcrafted comparison](modern-pair-heldout-handcrafted-results/summary.md) completed 100 matches with 61 wins and 39 losses, meeting the observed 60-win threshold.
All budgets were met and replay reproduced the result, but the paired 95% Hoeffding interval of approximately [0.418, 0.802] does not establish a 60% population win rate.
This exploratory sample also does not control the error rate across all adaptively selected candidates.
The independent [400-match handcrafted confirmation](modern-pair-confirm-handcrafted-results/summary.md) scored 193–207, with no incomplete games or deadline stops.
The paired 95% interval is approximately [0.386, 0.579], and the result did not meet the predeclared thresholds for either a confirmed advantage or a 60% rate.
The earlier exploratory 61–39 result did not replicate, so the candidate remains unpromoted.
The separate [zero-tree-prior comparison](modern-pair-heldout-zero-results/summary.md) completed 100 matches with 97 wins and three losses, meeting the observed 90-win threshold.
All budgets were met and replay reproduced the result, but its one-sided uniform-dealer lower bound of approximately 0.836 does not establish a 90% population win rate.
The independent [400-match zero-tree-prior confirmation](modern-pair-confirm-zero-results/summary.md) scored 377–23, with no incomplete games or deadline stops.
Its one-sided paired lower bound was approximately 0.887, below the predeclared 0.90 target.
The zero-tree-prior opponent retained the handcrafted rollout and cutoff evaluator, and no LLM test is authorized by these two exploratory results alone.
The signal overlaps the known-pair feature, and enabling both adds their adjustments; any combined policy needs separate calibration.
The [pile-scaling probe](modern-pile-scaling-results/summary.md) changed highest-prior action sets at 51 of 1279 positions when the pair-threat weight increased with pile size.
The probe met its predeclared five-position threshold and replayed exactly, but it does not establish stronger play.
The separate opt-in `pairPileV1Weight` applies this exploratory bounded multiplier and defaults to zero.
The [six-weight pile screen](modern-pair-pile-grid-results/summary.md) completed 288 single-hand scenarios and selected weight 50 after a 27–21 training score against the unscaled candidate.
All budgets were met and replay reproduced the selection; a fresh full-match comparison is required to assess it.
The [held-out comparison](modern-pair-pile-heldout-results/summary.md) scored 44–56 against the unscaled candidate and missed the predeclared 60-win threshold.
All budgets were met and replay reproduced the result, but its paired 95% Hoeffding interval of approximately [0.248, 0.632] does not establish that the pile-scaled candidate is weaker.
A [one-hand budget pilot](modern-pair-budget-pilot-results/summary.md) completed all 79 decisions at two simulations, with no missed budgets and a slowest observed decision of approximately 604 ms.
That pilot checks feasibility on one hand, not match strength or a general deadline guarantee.
The opt-in `discardRiskV1Weight` uses the acting hand and public opposing hand and bonus counts at the observed root, and defaults to zero.
Its signed coefficient is experimental, and a high-point discard can also help the opponent take the pile.
The [six-weight training screen](modern-discard-risk-grid-results/summary.md) completed 144 paired-scenario hands and retained zero under its predeclared selection rule.
The nonzero weights scored between 11–13 and 12–12, and the saved records replayed to the same result.
Different final scores occurred across weights in 15 of 24 matched hands, but only four matched hands had different winning sides.
This post-hoc observation suggests a coarse hand-win training signal; it does not establish a better coefficient or match strength.
The [pair-retention screen](modern-pair-retention-grid-results/summary.md) completed 288 single-hand scenarios and selected weight 25 after a 26–22 training score against the handcrafted weight of 10.
Negative weights each scored 5–43, but the training scenarios do not establish a population win rate or match strength.
All budgets were met and replay reproduced the selection; fresh full-match comparisons are required to assess it.
The [held-out handcrafted comparison](modern-pair-retention-heldout-handcrafted-results/summary.md) scored 55–45 and missed the predeclared 60-win threshold.
All budgets were met and the records replayed, but the paired 95% interval of approximately [0.358, 0.742] does not establish an improvement or a decline.
The separate [zero-tree-prior comparison](modern-pair-retention-heldout-zero-results/summary.md) scored 96–4 with no incomplete games or deadline stops.
Its one-sided uniform-dealer lower bound was approximately 0.819, which does not establish a 90% population win rate.
The [eight-simulation hand diagnostic](modern-retention-eight-hand-results/summary.md) scored 11–13 for weight 25 against weight 10 and missed its predeclared 14-hand threshold.
All budgets were met and replay reproduced the result, but 24 hands cannot establish a full-match strength difference or isolate UCB exploration.
Seven completion varied in three positions, while the discard-pair feature varied in 212.
The recorded sample replayed exactly, but rare events can have high strategic value and these correlated hands do not establish population frequencies.
After the ten-update three-band run, a planned sensitivity probe will follow five handcrafted-policy hands at each starting score and compare the final candidate with the handcrafted prior using the same random seeds.
The working prediction is that fewer than 5% of positions with multiple visited root actions will change their selected action across the pooled sample.
This is a diagnostic of the sampled paths, not a match-strength estimate.
The [probe](modern-band-sensitivity-results/results.jsonl) completed 15 hands and 1260 position comparisons without missing a simulation budget.
The selected action changed in three of 748 positions where the baseline visited multiple root actions, below the predicted threshold on these correlated paths.
The retained records replayed exactly.
At eight simulations and depth eight, a separate [two-game pilot](modern-balanced-vs-handcrafted-depth-pilot-results/summary.json) finished 1–1 with no missed simulation budgets.
Both the simulation count and depth changed, and one deal cannot establish a playing-strength difference.
The higher-budget pilot replayed from its retained records.
The next diagnostic compares two and eight simulations at the same depth of three on the 20 positions from the existing seed-9137 baseline trajectory.
The working prediction is that at least two selected actions change and at least one eight-simulation root action receives a revisit.
This measures decision sensitivity on one correlated trajectory, not match strength or the isolated effect of the UCB formula.
The [iteration probe](modern-iteration-probe-results/results.jsonl) changed two selected actions and revisited at least one root action in all 13 positions with multiple visited root actions.
All searches met their budgets, and the recorded decisions replayed exactly.
The [exploration-constant hand diagnostic](modern-exploration-balanced-hand-results/summary.md) compared the default constant with zero at eight simulations and depth three across 12 paired deals.
The default constant scored higher in 11 of 24 hands, short of the predeclared 14-hand threshold; all decisions met their budgets and the records replayed exactly.
This small hand-score result does not establish a full-match strength difference or compare against root-only Monte Carlo.
The next [hand pilot](modern-iteration-hand-pilot-results/protocol.md) compares two and eight simulations at depth three over three paired deals, with symmetric starting scores of 0, 3000, and 5000.
Its working prediction is at least four hand wins for the eight-simulation policy out of six; fewer wins falsify that threshold for these deals.
The [result](modern-iteration-hand-pilot-results/summary.json) was 3–3 with no budget misses, and its recorded hands replayed exactly.
The pilot is too small to establish which budget is stronger, and its three score bands are coupled to dealer seats.
The subsequent [balanced-dealer diagnostic](modern-iteration-balanced-hand-results/summary.md) compares the same simulation budgets over 12 paired deals across all dealer seats and the same three score bands.
The eight-simulation policy scored higher in 14 of 24 hands, meeting the predeclared observed threshold, and all decisions met their budgets.
The [fresh replication](modern-eight-vs-two-replication-results/summary.md) scored 16–8 for eight simulations and also met its predeclared threshold with all budgets met.
Its retained records replayed byte for byte, but it remains a small single-hand diagnostic and does not isolate UCB or establish full-match strength.
The records replayed exactly, but a small single-hand comparison cannot establish a full-match strength difference or isolate UCB's contribution.
The next local calibration compares progressive-bias strengths four and one with the same handcrafted features, eight simulations, and depth eight.
It schedules five paired deals as single-hand trials, so any score comparison is a training diagnostic rather than a full-match win rate.
The test can show whether this particular stronger bias warrants a larger study, but its small sample cannot establish superiority or satisfy the promotion targets.
The [hand-score summary](modern-prior-strength-hand-pilot-results/hand-summary.json) finished 5–5, with no missed simulation budgets.
All ten raw matches stopped at the single-hand cap, and the [match summary](modern-prior-strength-hand-pilot-results/match-summary.json) correctly reports no match win rate.
Replaying the retained match records reproduced that summary.
In a separate [opening-position probe](modern-prior-strength-probe-results/results.jsonl), strengths one and four selected different actions in one of 20 fixed post-draw positions.
All searches met their eight-simulation budgets, and the probe replayed exactly.
These positions cover only one early phase and cannot establish which strength plays better.
The next sensitivity probe compares strengths zero and 100 on the same 20 positions.
The prediction is that more than one selected action will differ, which would show greater action sensitivity than the one-versus-four probe on this sample.
The [extreme-strength probe](modern-prior-strength-extreme-probe-results/results.jsonl) changed three of those 20 selected actions and replayed exactly.
This supports the prediction for these positions but does not show which strength plays better.
The next hand-level pilot compares strengths 100 and zero on the same five paired deals as the earlier four-versus-one pilot.
Both policies retain prior-based expansion ordering, and the comparison remains a small, exploratory hand-score test.
The [extreme-strength hand summary](modern-prior-extreme-hand-pilot-results/hand-summary.json) finished 3–7 for strength 100 against zero, with no missed simulation budgets.
All ten raw matches reached the single-hand cap, so the [match summary](modern-prior-extreme-hand-pilot-results/match-summary.json) has no win rate.
The retained match records replayed to that summary; five deals are insufficient to establish which strength is better.
Any candidate still requires independent, held-out, fixed-simulation full-match comparisons against both the handcrafted and zero-prior policies.
Use at least 100 full matches against the zero-prior policy, arranged as 50 seat-swapped deal pairs, and report wins, losses, incomplete games, and the paired confidence interval.
An observed 90–10 record does not establish with 95% confidence that the underlying win rate exceeds 90%.
With the current two-sided Hoeffding interval, even 100 wins in 50 paired deals give a lower bound of only about 0.81.
More independent deals or a separately justified paired-outcome interval are necessary to establish a 90% threshold with that level of confidence.
If the interval is inconclusive, preserve that result and plan further independent paired deals rather than treating the target as proven.
LLM testing remains gated on meeting both local full-match targets.
Its handcrafted prior and rollout policy have not been calibrated or trained for modern play.
The current implementation follows the cited one-card-draw reference pending the user's ruleset choice.
The provisional bonus-card model keeps these cards face down until their recipient's next turn and scores them as held if the hand ends first.
This timing is an assumption that needs confirmation against the selected ruleset.
No modern engine or newly trained policy is claimed complete by this plan.
The assessment uses the recorded experiment and a same-context code review; its design benefits remain proposals until the listed checks run.
