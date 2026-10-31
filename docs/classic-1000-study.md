# Classic Canasta: 1000-match study

The user authorized 1000 matches against MCTS opponents, broader perturbations, a zero-prior comparison, and at most USD 1 of LLM testing only after those local matches finish.
This protocol is fixed before the run.
The earlier pilot remains development evidence.

## Allocation and hypotheses

| Phase | Matches | Purpose |
| --- | ---: | --- |
| 70 SPSA updates, one paired block per perturbation | 280 | Explore a wider coefficient domain |
| Candidate versus incumbent, 100 paired blocks | 200 | Test promotion superiority |
| Candidate versus reference, 100 paired blocks | 200 | Measure the reference matchup |
| Incumbent versus reference on the same blocks | 200 | Control the reference matchup |
| Candidate versus zero-prior MCTS, 30 paired blocks | 60 | Test whether learned priors help |
| Reference versus zero-prior MCTS on the same blocks | 60 | Test whether the original priors help |
| Total | 1000 | Complete local prerequisite before paid testing |

Each pair uses the same seed and dealer with the candidate on N-S and then E-W.
The outcome is the average of the two full-match wins, not hand wins or action agreement.
Training, promotion, and zero-prior validation use separate seed namespaces.
The master seed is 1779033703.
Before execution, a seed audit rejected the provisional value 20261101 because four generated deals overlapped the earlier pilot.
The selected seed generates 300 distinct deal blocks across the four namespaces, with no overlap with the recorded pilot deals.
The executable configuration is [classic-1000-training.json](classic-1000-training.json).

The first hypothesis is that broader coefficient perturbations can find a candidate that meets the existing promotion gates.
Failure to meet either gate retains the incumbent.
The second hypothesis is that priors help at this search budget.
A better zero-prior result would count against that hypothesis.
The zero-prior policy returns zero for every action's tree prior, removing its UCB bonus and expansion ordering, while keeping the same rollout policy.
This is a tree-prior ablation, not a rollout-heuristic ablation.

## Fixed search and optimization settings

Every MCTS decision must complete eight simulations at depth 12 within a 60000 ms emergency limit.
This increases the search budget from the earlier four-simulation pilot.
All local opponents receive the same search budget.
At most four paired jobs execute concurrently, each using two Node workers.
Each worker retains the existing 512 MiB old-generation heap limit.
The declared wall limit is 86400000 ms per stage invocation; this is a bound, not a runtime estimate.

The normalized coefficient domain stays `[-1, 1]`, but the mapping is now `reference + 4 * abs(reference) * z`.
All reference coefficients are nonzero.
This permits sign reversal and values from -3 to 5 times each reference coefficient.
The initial perturbation is 0.6, versus 0.2 in the earlier pilot, with the same decay exponent.
The step coefficient is 0.8, versus 0.3, and the stability constant remains 10.
The first two probes therefore use coefficient multipliers -1.4 and 3.4, assigned by independent perturbation signs.
The UCB prior-bonus multiplier remains 1; this study varies feature coefficients rather than that separate hyperparameter.
Legality, belief inference, rollout scoring, and reward evaluation remain fixed.

Training uses the existing frozen-per-epoch champion/archive/reference mixture.
The final update is the only promotion checkpoint in this run.
The promotion family error budget remains 0.05: each of the two one-sided Hoeffding gates uses alpha 0.025.
Superiority requires the lower bound above 0.5; reference-matchup non-inferiority requires its lower bound above -0.02.
These conservative bounds can miss a real but modest improvement at this sample size.
No threshold will be relaxed after seeing the results.
The zero-prior comparisons use alpha 0.025 per one-sided endpoint and are separate development diagnostics; they do not select or promote another policy.
One training run cannot establish optimizer reliability across training seeds or strength at larger search budgets.

## Execution and recovery

```sh
node --import tsx scripts/run-classic-1000.ts OUTPUT_DIRECTORY
node --import tsx scripts/run-classic-1000.ts OUTPUT_DIRECTORY --resume
```

The driver completes training and promotion, then evaluates both the candidate and reference against zero-prior MCTS.
It writes `local-complete.json` only after checking that all 1000 retained leg records are complete and use MCTS policies on both sides.
It never reads credentials or calls an LLM.
The LLM stage must separately verify these records before loading the `.env` key.
Its aggregate spending limit is USD 1, including failed requests and any calibration.

The runner retains every result, policy, seed, source fingerprint, and completion status.
An unfinished search or match remains incomplete and blocks completion of this study.
An infrastructure or engine correction requires its own recorded version and recovery decision; failed outcomes cannot silently become draws or disappear.
Completed legs can be replayed only with matching source and configuration fingerprints.
Concurrent jobs retain input-order reduction and drain started work before propagating a failure.
The reference weights remain the browser default unless a later explicit deployment step changes them.
