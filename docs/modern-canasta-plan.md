Classic Canasta supports retaining the current priors for classic play and reusing the generic information-set search for modern Canasta.
The experiments establish a strong prior benefit at eight simulations per decision; they do not isolate the benefit of UCB allocation or establish near-optimal play.
Modern implementation should begin with exact rules and state transitions, followed by search calibration and separate policy training.
This is a proposed implementation sequence, with the modern ruleset still awaiting selection.
The user's current goal permits LLM testing only after the modern policy meets both local performance targets.

The [completed classic study](classic-1000-results.md) contains 1000 optimization and evaluation matches plus 100 fresh champion-versus-zero-prior matches.
The retained reference won the fresh comparison 89–11.
The trained candidate scored 48% against the incumbent and failed promotion.
Both policies won their two LLM diagnostic games, but those comparisons share one deal seed and do not establish reliable superiority over LLMs.

The selection rule in [mcts.ts](../src/bot/mcts.ts) is availability-aware UCB with progressive bias:

```text
Q(a) + C * sqrt(log(availability(a)) / visits(a))
     + beta * H(a) / (visits(a) + 1)
H(a) = tanh(weightedFeatures(a) / 100)
```

Unvisited actions receive priority, ordered by their heuristic prior, with uniform selection among ties.
This is a decaying heuristic bonus, rather than a probabilistic PUCT policy.
The [Canasta adapter](../src/bot/canasta-search.ts) sets progressive widening to `ceil(sqrt(nodeVisits + 1))`.
At eight simulations, at most three root actions can receive visits.
A deterministic 20-action terminal-game probe confirmed eight simulations distributed over three root actions with visits 3, 3, and 2.
Where many actions are legal, the prior therefore decides much of the small candidate set that search evaluates.
The experiment changed both this ordering and the UCB prior bonus together.
It cannot attribute the 89% result to either mechanism separately.

The strongest missing comparison is against a greedy policy using the same legal candidate actions and reference features.
A root-only Monte Carlo comparator would further isolate the value of adaptive tree allocation.
The zero-prior opponent retained the same heuristic rollout policy and cutoff evaluation, so it was not free of domain knowledge.
UCB remains a sound mechanism to investigate, but its incremental playing strength needs those comparisons.
Information-set MCTS also retains hidden-information approximations; audit observation-dependent node sharing and simulated partner/opponent decisions before adding information-sensitive features.
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
At eight simulations and depth eight, a separate [two-game pilot](modern-balanced-vs-handcrafted-depth-pilot-results/summary.json) finished 1–1 with no missed simulation budgets.
Both the simulation count and depth changed, and one deal cannot establish a playing-strength difference.
The higher-budget pilot replayed from its retained records.
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
