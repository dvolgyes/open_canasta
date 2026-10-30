# Canasta self play research protocol

Optimize the coefficients of the MCTS action prior through headless Node.js experiments, retain a tested champion, and evaluate a checkpoint against an LLM every 100 optimizer updates.
The scientific objective is stronger decisions on unseen deals, opponents, and partners at a specified search budget.
A win against the previous checkpoint or an LLM does not by itself establish that objective.

The inspected engine baseline is commit `b97e53c636d82ac8ab3872324b4434f22833e141`.
The experiment design below is proposed; only the bounded mechanism pilot described at the end has been executed.
Training, tournaments, analysis, and LLM opponents require no GUI, browser, signaling server, or WebRTC connection.
The browser remains a separate integration target for the resulting built-in bot.
Paid runs remain disabled until an explicit total API budget and model are supplied.

## Ruleset decision before optimization

The current engine and completed pilot use classic Canasta.
The user's question about the special role of sevens exposes an unresolved target-ruleset decision: classic Canasta, Modern Canasta, or a house variant.
The owner is the user; resume rules-dependent training only after that choice and its rule specification are recorded.
The classic-rules endpoint below is conditional on that decision, not a confirmed substitute for Modern Canasta.
The next check is a comparison of the chosen rules with executable legality and scoring examples.

The current `CanastaRules`, meld validator, and scoring functions have no rank-seven restriction or special rank-seven penalty.
They do implement the separate seven-card threshold for any canasta, its natural/mixed bonus, and the required canasta count for going out.
The guide in `strategy.md` describes Modern Canasta concerns; it is evidence to review, not an already implemented rules specification.
For example, the [Modern Canasta rules](https://canasta.com/rules/) prohibit wild cards in sevens melds and specify a 2500-point completed-canasta bonus, a 2500-point incomplete-meld penalty, and a 1500-point penalty for three or more sevens remaining in one player's hand.
Those are rule semantics, not coefficients to learn.
Modern variants also differ in aces, threes, wild-card melds, pile restrictions, opening thresholds, and going out; adding only a sevens preference would not implement the variant.

Before selecting the training target, test the agreed meld restrictions, completed and incomplete scores, per-player hand-penalty thresholds, pile transitions, and going-out conditions.
Test both sides of each threshold, including two versus three held sevens and six versus seven melded sevens if that variant is selected.
Keep these rules in the game adapter and rules engine; the generic MCTS and optimizer must not contain rank-specific branches.
Add rule-aware features only after this check: completion feasibility, penalty exposure, opponent retention, and the value of keeping or releasing a blocking pair.
Holding two sevens, discarding a third, and interpreting a discard as a partner signal are candidate strategies, not universal rules or certain observations of hidden hands.
Two sevens held by an opponent can prevent completion while retained; two discarded sevens may still be recoverable from the pile.
Track those locations and duplicate-face multiplicities rather than marking every discarded seven permanently unavailable.

## Research questions and acceptance criteria

| Question | Experiment | Evidence against the hypothesis |
| --- | --- | --- |
| Do learned prior coefficients improve the current MCTS policy? | Prior-only tuning against a frozen baseline, followed by unseen full matches at 250 ms per action | The lower confidence bound fails to exceed the registered improvement threshold |
| Is joint optimization more sample-efficient than simple search? | SPSA and random search with the same simulator-work budget and independent training runs | SPSA has no reliable advantage across runs or requires more work for the same result |
| Does an opponent archive prevent narrow adaptation? | Champion-only training versus a fixed-per-epoch league | League training fails to improve held-out opponents or mixed-partner play |
| Does improvement survive a different search budget? | Final policies at 100, 250, and 1000 ms per action | Gains disappear or reverse outside the training condition |
| Does the improvement transfer to the retained LLM opponent? | Periodic validation matches and a separate final LLM evaluation | LLM results do not improve, have inadequate precision, or are dominated by request failures |

The primary endpoint is the probability of winning a complete classic-rules match to the normal target score against frozen baseline MCTS, with team assignments balanced.
The proposed minimum meaningful gain is two percentage points: the final one-sided confidence bound must exceed a match score of 0.52 against that baseline.
This is a study-design choice to freeze before confirmatory runs, not an established property of Canasta.
A completed match has a winner; an action cap is not a draw.
Hand scores, match length, and heuristic agreement are secondary diagnostics.

Release additionally requires legal actions, valid card inventories, no information leaks, no repeated non-progress actions, and compliance with the registered runtime and memory limits.
Retain the current champion when the evidence is inconclusive.
No result from this study establishes Nash optimality or near-optimal Canasta play.
Information-set search addresses hidden information but retains approximation limits; the foundational [ISMCTS paper](https://eprints.whiterose.ac.uk/id/eprint/75048/) is the algorithmic reference.

## Changes required before training

The current adapter uses `tanh(scoreAction / 100)` as its prior, the same `scoreAction` for rollout decisions, and a fixed score-difference evaluation for truncated rollouts.
Changing `scoreAction` globally would therefore alter multiple mechanisms and the handcrafted and LLM baselines that also use it.
Freeze those baselines as versioned policies and introduce a separate feature-based prior for the candidate.

Setting `priorWeight` to zero is not a complete prior ablation in the current implementation.
The prior still orders unvisited actions, and the heuristic still controls most rollout moves.
A genuine tree-prior ablation must return zero from the prior function, disable its expansion ordering effect, and retain the separately declared rollout policy.

Implement explicit iteration-budget and time-budget modes.
For training, require exactly the declared number of completed simulations and deterministic reduction order; an emergency time limit produces an incomplete trial, not a comparable sample.
For deployment evaluation, use the actual time budget, including observation processing and inference, and measure deadline overruns.
Fixed iteration count does not imply fixed CPU work because rollout length and legal-action enumeration vary.
Record transition calls, generated actions, completed simulations, elapsed time, and memory.

The existing benchmark plays isolated hands from zero scores against the heuristic.
Extend the headless harness to use `startMatch`, `settleHand`, and `nextHand`, including dealer rotation and a fresh public history for every hand.
Keep the old hand benchmark as a separately labeled development diagnostic.

## Parameterization

Use a small feature model rather than a parameter for every search-tree node:

```text
H_theta(observation, action) = tanh(sum_i theta_i * feature_i / 100)
UCB score = mean_reward + C * sqrt(log(availability) / visits)
            + beta * H_theta / (visits + 1)
```

Start with approximately 12–20 coefficients that reconstruct the existing heuristic's distinctions.
Features cover action-type preferences, cards contributed to melds, pile size, completion of natural and mixed canastas, first-meld progress, wild-card expenditure, discard point cost, singleton ranks, and preservation of useful rank groups.
Keep terminal game rewards and rule enforcement fixed.
Legality, duplicate-card multiplicities, and opening-meld completion are constraints, not trainable preferences.

First prove that the reference coefficient vector reproduces the old heuristic on a versioned position corpus.
Express feature scales in rule-defined units or fixed documented bounds.
Do not fit normalization on validation or final-test positions.
Fix the divisor 100 initially; jointly tuning it and all coefficient scales creates an avoidable identifiability problem.
Parameterize each adjustable coefficient as `theta0[i] + scale[i] * z[i]`, with explicit finite bounds for `z` frozen after the pilot.
This permits initially zero coefficients to change and makes perturbations comparable across units.

Tune tree-prior coefficients first while keeping rollout coefficients, exploration, widening, rollout randomness, and state evaluation fixed.
Study rollout coefficients and search hyperparameters in later controlled experiments.
The tree-prior treatment includes its effect on expansion order and progressive widening; report this definition with the results.

Introduce information-aware features only in a second feature-set experiment.
Candidates include the probability that a discard helps the next opponent, known partner support for a rank, and uncertainty about opponents' ability to go out.
Compute them from that actor's own observation and inferred card distribution.
Never extract features from the simulator's real hidden hands, future stock, or deal seed.
Evaluate feature cost because a useful but expensive feature can weaken time-limited play by reducing search.

## Optimizer and opponent league

Use simultaneous perturbation stochastic approximation, SPSA, as the first joint optimizer.
It estimates an update for all coefficients from two perturbed parameter vectors, which suits noisy simulator outcomes with a modest coefficient vector.
This mechanism is described by [Spall](https://www.jhuapl.edu/SPSA/Pages/) and is used for parameter tuning in [Stockfish's testing system](https://official-stockfish.github.io/docs/fishtest-wiki/Fishtest-Mathematics.html).
These precedents motivate the experiment; they do not establish that SPSA is best for this engine.

For update `k`, draw independent signs `Delta[i]` in `{-1,+1}`, evaluate `z_plus = z + c_k * Delta` and `z_minus = z - c_k * Delta`, and use:

```text
gradient[i] = (fitness_plus - fitness_minus) * Delta[i] / (2 * c_k)
z_next[i] = project_to_bounds(z[i] + a_k * gradient[i])
```

Fitness is mean full-match win score against a frozen opponent mixture.
Evaluate the two perturbations on the same deal blocks, opponent assignments, dealer assignments, and corresponding policy RNG streams.
This pairing reduces avoidable noise; it does not make diverging trajectories identical.
Calibrate step and perturbation scales on training-only pilot positions, then freeze their schedules for each optimizer comparison.
Measure whether perturbations change action choices; near-zero sensitivity, saturation, or high gradient variance triggers a scale or feature review before a large run.
Do not claim smooth-objective convergence guarantees for this discrete-action search system.

Maintain separate optimizer state, candidate snapshots, a tested champion, and an archive.
An optimizer update is one completed two-perturbation update, not one game or one accepted promotion.
The optimizer may explore a temporarily worse point without replacing the champion.
Checkpoint exactly at updates 0, 100, 200, and so forth.

Freeze the opponent mixture for each 100-update epoch.
A starting mixture is 50% current champion, 25% archived policies, and 25% fixed baselines; substitute the initial baseline when an archive bucket is empty.
Keep immutable copies of all checkpoints and specify archive sampling and capacity before the run.
Start with uniform archive sampling; add adversarially selected opponents only as a separate experiment.
Maintain a payoff matrix to expose cycles where A beats B, B beats C, and C beats A.
This is a practical league inspired by research on [best responses to policy mixtures](https://arxiv.org/abs/1711.00832), not an implemented equilibrium solver.

Random search is the required simple comparator.
Use the same parameter bounds, initial corpus, independent training seeds, and total measured simulator-work budget.
Compare progress against cumulative work rather than update count alone.
Keep a zero-update control under the same evaluation schedule to measure evaluation noise.
Consider [CLOP](https://www.remi-coulom.fr/CLOP/) or covariance-adapting evolution only if SPSA is unstable or random search is competitive; introduce each as a new registered comparison.

## Deals, partners, and independent evidence

The experimental unit is a paired deal block, not an action or an individual rollout.
For each initial match seed, play two matches with candidate and opponent teams exchanged.
Balance the initial dealer across blocks and let the rules rotate the dealer during each match.
Both partners use the same policy in the primary experiment, but each sees only its own hand and public history.
Use additional policy-RNG replicates on a pilot subset to estimate simulation variance.
All observations derived from one match seed remain in the same statistical cluster.

Use separate deterministic streams for true deals, belief sampling, search tie-breaking, perturbations, opponent sampling, and evaluation assignment.
The true deal seed belongs to the runner and must not be visible to an agent.
Derive seeds from recorded run, split, block, leg, seat, and replicate identifiers, independently of worker completion order.
Commit split manifests and detect collisions in the actual engine seed space.

Reserve four disjoint families:

1. Training deals for optimizer updates, including training-only tuning of optimizer settings.
2. Fresh promotion deals for comparing a frozen candidate with the champion and opponent pool.
3. Validation deals and position suites for development decisions, including periodic LLM checks.
4. A sealed final test set opened only after the candidate, hypotheses, sample sizes, and analysis are fixed.

A viewed LLM checkpoint or repeatedly consulted validation result is not a final test.
If it changes the design, record that adaptation and obtain new final-test data.
Exclude all previously used development seeds, including the stored heuristic comparisons and seeds 11001–11004 in the mechanism pilot, from confirmatory sets.
Keep related states, all hands from one match, seat swaps, and RNG replicates in the same split.

Mixed-partner tests place the candidate beside frozen heuristic, MCTS, and available LLM partners, with role assignments balanced.
These tests measure cooperation with other policies rather than assuming that same-policy partnership transfers to human play.
Human-partner benefit remains a separate claim requiring human evaluation.

## Promotion and statistical analysis

Never promote from one winning batch.
Freeze a candidate before a promotion trial and use new paired blocks for that trial.
The primary gate is superiority to the incumbent; a second gate checks non-inferiority against a frozen opponent pool with a proposed two-percentage-point margin.
The pool and its weights remain fixed for the experiment's evaluation, even while the training league evolves.

The first implementation should use one fixed sample size per gate and no early success peeking.
Choose that sample size from an independent variance pilot and a declared power target of at least 80%.
For a pilot paired-block standard deviation `s` and a target distance `delta` from the null boundary, the normal approximation is:

```text
n_blocks approximately ((z_(1-alpha) + z_(0.80)) * s / delta)^2
```

For one unadjusted one-sided 5% test with `s = 0.5`, detecting a five-point difference from zero requires approximately 619 independent blocks, or 1238 matches.
Detecting two points under those assumptions requires approximately 3865 blocks.
These are planning examples, not sample-size guarantees or the final adjusted gate sizes.
Estimate the actual paired variance, account for the practical-effect boundary, and check power by simulation before fixing the main sample sizes.

Predeclare the maximum number of promotion comparisons.
For example, five training runs with ten checkpoint candidates and two statistical gates produce 100 hypotheses; a conservative family error budget of 0.05 assigns 0.0005 to each fixed-sample gate.
Use the actual planned family size, including comparisons added by optimizer or ablation arms, rather than reusing this example unchanged.
If this is unaffordable, reduce the number of attempted formal promotions and keep intermediate candidates as exploratory checkpoints.
Do not reduce error control after seeing results.

A later efficiency improvement can use a validated confidence-sequence or group-sequential implementation with a declared maximum sample size.
Ordinary repeated 95% intervals do not provide valid stopping rules.
[Time-uniform confidence sequences](https://arxiv.org/abs/1810.08240) supply a principled alternative, subject to their assumptions.
Do not transplant chess-specific SPRT outcome assumptions into Canasta without checking the paired-match sampling model.
Validate the chosen decision procedure on simulated nulls, known effects, ties within paired blocks, and correlated seed replicates before relying on it.

For final reporting, show raw wins and losses, paired match score, mean hand-score difference, interval estimates, per-opponent results, and resource use.
Resample complete seed blocks when bootstrapping; do not treat repeated hands or decisions as independent trials.
For algorithm-level claims, use at least five independent training runs, report all of them, and use a hierarchical analysis over training run and evaluation block.
Five runs are a starting replication target, not strong evidence for every small effect.
Report intervals and distributions rather than only the best seed, consistent with the evaluation concerns in [Agarwal et al.](https://proceedings.neurips.cc/paper_files/paper/2021/hash/f514cec81cb148559cf475e7426eed5e-Abstract.html).
Select any deployable checkpoint using validation data before opening its final test.

## Experiment matrix

| Experiment | Changed factor | Fixed controls | Output and stopping condition |
| --- | --- | --- | --- |
| E0 mechanism and measurement | Prior strength and RNG replay | Engine, positions, rollout policy, completed simulations | Reproducible legal decisions and measured parameter sensitivity; stop on incomplete searches or replay failures |
| E1 baseline and variance | Independent deals and RNG replicates | Frozen heuristic, current MCTS, and zero-tree-prior controls | Full-match completion, paired variance, work distribution, and sample-size calculation |
| E2 prior tuning | Learned tree-prior coefficients | Rollouts, value evaluation, legal actions, belief model, search settings | SPSA versus random search versus zero-update control under equal work budgets |
| E3 mechanism ablation | Prior only, rollout only, then both | Same features, training budget, and evaluation pool | Attribution of gains to each mechanism and their interaction |
| E4 opponent diversity | Champion-only versus league training | Optimizer and total work | Held-out opponent and mixed-partner results; full payoff matrix |
| E5 knowledge contribution | Public history enabled versus current-state-only belief | Exact own cards, visible cards, hand counts, rules | Whether memory helps, especially after pile pickups and duplicate-card plays |
| E6 budget transfer | 100, 250, and 1000 ms per action | Frozen learned and baseline policies | Strength-versus-latency curve and deadline-overrun distribution |
| E7 LLM validation | Candidate checkpoint and frozen anchor versus pinned LLM | Prompt, model, action interface, deal blocks, request settings | External matchup trend every 100 updates; fresh final comparison when funded |
| E8 locked confirmation | Frozen selected policies and unseen test blocks | Registered hypotheses and analysis | Final improvement, non-regression, legality, and resource verdicts |

Run E2 before expanding the feature set or simultaneously tuning the rollout policy.
Use full matches for the main optimizer fitness and final endpoint.
If the capacity pilot requires hand-level training as a cheaper substitute, register it as a separate low-fidelity experiment and require full-match confirmation before a strength claim.
Do not silently relabel hand wins as match wins.
Other rule presets and robbers rummy are transfer studies after the chosen primary-ruleset result; retain reusable runner, optimizer, logging, and analysis interfaces.

## LLM comparisons every 100 updates

Evaluate the checkpoint and a frozen initial MCTS anchor against the same pinned LLM on fresh paired blocks.
This anchor helps detect a provider change that would otherwise look like agent improvement.
Use a small, predeclared diagnostic budget at each checkpoint and a separately powered final comparison.
If the periodic sample is small, report it as a noisy monitoring result rather than a promotion certificate.
If the API budget is exhausted, record a skipped checkpoint explicitly and continue eligible local work.

Distinguish two comparisons.
The legacy product comparison keeps the retained LLM's original prompt and heuristic-ranked candidate list.
It measures the performance of those deployed systems, including their different move generators.
The decision-policy comparison gives both agents the same validated semantic action menu and the same available public-memory facts, with each acting from its own private hand.
The existing LLM sees at most 40 heuristic-selected options; freeze or control that pruning and test action-order sensitivity.
Expanding the LLM observation to include inferred memory creates a new comparator version and must be labeled accordingly.

Record model ID and any resolved provider/version information, date, prompt hash, reasoning settings, output limits, request IDs, usage, retries, latency, and actual billed or conservatively estimated cost.
Never log API keys, authentication headers, or private human game data.
Model aliases and API randomness can prevent exact replay; replaying cached responses is a distinct deterministic audit.
Do not report cached responses as new independent LLM samples.

For the main capability comparison, disable automatic model switching and heuristic fallback.
The current CLI already pins an explicit model, but its retained turn wrapper can still fall back to the heuristic; the research adapter needs an explicit failure outcome.
Use a bounded, predeclared retry policy.
Report service availability separately, retain every failed or unfinished match, and give conservative bounds for unresolved outcomes rather than selectively dropping them.
A separate reliability experiment may count failures as forfeits, provided it is labeled as end-to-end service performance.
The LLM chooses actions; the rules engine computes outcomes and scores.
An LLM's explanation or agreement with MCTS is not the success metric.

## Headless TypeScript architecture

Proposed interfaces keep the experiment runner independent of Canasta policy details:

```ts
interface Agent<Observation, Action> {
  decide(observation: Observation, context: DecisionContext): Promise<Decision<Action>>;
}

type Decision<Action> =
  | { kind: "action"; action: Action; simulations: number }
  | { kind: "failure"; reason: string };

interface DecisionContext {
  rng: () => number;
  signal: AbortSignal;
  budget:
    | { kind: "iterations"; count: number; emergencyTimeMs: number }
    | { kind: "time"; timeMs: number };
}
```

These interfaces are a design sketch, not existing exported APIs.
The game adapter owns authoritative transitions, legal actions, observation projection, terminal results, and public-history updates.
The parameterized policy owns features and prior coefficients.
The optimizer proposes coefficient vectors without mutating active agents.
The evaluator owns pairing, split membership, stopping rules, and statistics.
The LLM adapter owns requests and explicit failure records.

Use a bounded Node worker pool with one game task per worker and a separate API concurrency limit.
Keep the complete true deal inside the runner; send only the appropriate observation to each policy.
Allocate budgets and seeds before dispatch and aggregate in a stable order.
Pin policy and rules hashes for every job.
Use JSONL for append-only results and small validated JSON checkpoint manifests for parameters, optimizer state, RNG states, champion ID, archive, split versions, and spend reservations.

Resume from completed block IDs without counting duplicates.
Write checkpoints atomically and retain the last valid checkpoint.
Budget reservations must include in-flight LLM requests so parallel workers cannot each spend the remaining total.
Stop dispatching on cancellation or exhausted limits, account for in-flight work, and preserve partial results.
No training run should automatically modify the GUI's built-in parameters or publish a new bot.

## Verification before expensive runs

Require the following failure-sensitive checks before the corresponding stage:

- Feature reconstruction matches the frozen reference on ordinary positions and boundary cases.
- Own-hand and public-history observations remain identical when only hidden real cards change.
- Duplicate face counts, pile pickups, retractions, red threes, and stock depletion preserve inventory and knowledge invariants.
- An actor cannot use a teammate's hidden cards through features, logs supplied to a policy, or an RNG seed.
- A completed iteration-budget run replays exactly for the same observation, policy, seed, and runtime version.
- A true zero-prior control has no hidden heuristic expansion preference.
- Paired-team assignment, dealer balance, match settlement, and split isolation pass known-answer cases.
- The statistical gate controls false promotions on simulated nulls and has measured power for the intended effect.
- Incomplete games, invalid actions, zero-progress loops, worker crashes, malformed model output, and exhausted API budgets remain visible in results.
- An interrupted run resumes without losing completed blocks, duplicating results, or repeating already charged requests without an explicit retry record.

Illegal actions or information leaks stop the affected campaign and invalidate dependent results.
For strategy-induced action or hand caps, retain the candidate as unpromoted until the issue is resolved.
For infrastructure failures, retry the same planned block under a bounded policy and retain both attempts.
The user owns the compute and API budgets; the runner enforces them before work is dispatched.

## Increments and resource decisions

| Increment | Deliverable | Acceptance and next boundary |
| --- | --- | --- |
| 0 | Agreed primary ruleset and executable legality/scoring examples | Resolve the special-sevens question and any rules-engine gaps before training |
| 1 | Frozen policy manifests, separate feature weights, explicit search budget modes | Exact reference reconstruction and deterministic replay permit the measurement pilot |
| 2 | Headless full-match runner, paired blocks, JSONL output, resume | Known-answer pairing and match lifecycle plus failure recovery permit baseline measurement |
| 3 | Variance and capacity pilot with fixed opponents | Measured work, variance, cap rates, and funded sample sizes permit optimizer configuration to be frozen |
| 4 | SPSA, random-search comparator, champion/archive separation | Synthetic optimizer checks and repeated independent runs permit promotion trials |
| 5 | Pinned LLM research adapter and request-budget accounting | Mocked protocol and failure tests plus an authorized small live calibration permit periodic API evaluation |
| 6 | Ablations, locked confirmation, reproducible report | Registered statistical and operational gates determine promotion or an explicit inconclusive/negative result |

The inspected host exposes an AMD Ryzen 7 4800H, 16 logical CPUs, and approximately 62 GiB of RAM.
These observations are capacity hints, not a reservation of all those resources.
Start capacity measurements with one worker, then test two and four workers for throughput, memory, and scheduling interference.
Avoid drawing timing conclusions while unrelated workloads compete for the same resources.

Set hard limits for local CPU work, wall time, storage, maximum optimizer updates, maximum matches, total API spend, per-request spend reservation, and API concurrency before the campaign starts.
For `K` updates with `B` paired seed blocks per perturbation, two perturbations and two team assignments require `4 * K * B` matches per training run before validation or promotion costs.
Multiply by independent training runs and optimizer arms, and budget promotion and final evaluation separately.
Estimate API cost from observed requests per match and input/output token usage during an authorized calibration, including retries and both the candidate and anchor comparisons.
If the available budget cannot resolve the registered effect, report that limitation and run a smaller feasibility study.

Keep representative failure traces and all negative results.
The final report must separate training progress, validation selection, final-test evidence, live-service reliability, and browser integration.
Rollback consists of selecting the previous immutable policy artifact; changing coefficients must not require changing the rules engine.

## Executed mechanism pilot

The reproducible pilot is `scripts/probe-mcts-study.ts`, run with:

```sh
node --import tsx scripts/probe-mcts-study.ts > pilot.json
```

It prepares four positions from fixed deals with the frozen handcrafted policy, then varies `priorWeight` over 0, 0.5, 1, 2, and 4.
Each decision completes 32 simulations at depth limit 24, with a five-second emergency limit and the same policy RNG seed for paired conditions.
Each condition is repeated in reverse order.
All root-action statistics are retained, and incomplete decisions, illegal decisions, missing planned records, or replay disagreement cause an unsuccessful process exit.

The first completed probe produced 40 legal decisions and exact repeated action/visit results for all 20 repeated conditions.
Changing prior strength changed the selected action in two of the four positions and the root visit allocation in all four.
This establishes that the current mechanism is responsive and supports a small deterministic experiment under these conditions.
It does not identify an optimal coefficient, validate a full-match runner, or establish improved playing strength.
The pilot's zero-weight condition is the existing partial ablation, as described above.
Raw records and any repeat run are stored in `self-play-pilot.json` with configurations and source fingerprints.
Three complete harness runs produced the same actions and root statistics, with 40 legal, completed decisions per run.
The final run uses the typechecked driver; earlier driver revisions are archived with their records, and all three source fingerprints were verified.
These replays are repeated measurements of the same conditions, not 120 independent tests of playing strength.

The next substantive experiment is the reference-preserving feature refactor and full-match capacity/variance pilot.
Large self-play training and periodic paid LLM matches remain conditional on those checks and specified budgets.
