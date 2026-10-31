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
Its fixed-simulation summary is eligible only when every planned leg finishes and every decision completes its declared simulation budget.
For an eligible fixed study, its 95% Hoeffding interval treats each paired deal as one bounded observation.
This interval assumes the paired deal seeds represent independent draws from the intended deal distribution and does not correct for selecting policies on the same evaluation data.
A null prior removes tree prior bias, while both policies continue to use the same handcrafted rollout policy.
The local-only `scripts/modern-optimize.ts` runner tests symmetric SPSA perturbations against a frozen opponent league on the same paired deals.
It retains each leg and stops an update when a leg is incomplete or misses its fixed simulation budget.
Optimization produces an exploratory candidate, not a promotion or a claim about held-out performance.
Its handcrafted prior and rollout policy have not been calibrated or trained for modern play.
The current implementation follows the cited one-card-draw reference pending the user's ruleset choice.
The provisional bonus-card model keeps these cards face down until their recipient's next turn and scores them as held if the hand ends first.
This timing is an assumption that needs confirmation against the selected ruleset.
No modern engine or newly trained policy is claimed complete by this plan.
The assessment uses the recorded experiment and a same-context code review; its design benefits remain proposals until the listed checks run.
