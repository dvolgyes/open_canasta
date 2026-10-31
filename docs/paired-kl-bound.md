The paired lower bound is a supplementary one-sided confidence bound for full-match studies.
Each seat-swapped deal pair contributes zero, one half, or one according to the candidate's number of wins.
The target is the average expected pair score across the scheduled dealer positions.

For independent scores in the interval from zero to one, inequality 2.1 in [Hoeffding's 1963 paper](https://www.cs.rpi.edu/academics/courses/spring06/random/hoefding.pdf) bounds the upper tail without requiring the scores to have identical distributions.
For observed mean `q`, pair count `n`, and one-sided error probability `alpha`, the lower bound solves `D(q || p) = log(1 / alpha) / n` for `p` below `q`, where `D` is binary relative entropy.
The bound is zero when `q` is zero and is `alpha ** (1 / n)` when `q` is one.
The implementation returns the conservative side of its numerical bracket.

The held-out protocol uses `alpha = 0.025` for each of the two local opponents.
The union bound then gives at least 95% simultaneous coverage for their lower bounds under the independent-pair model.
For a uniform-dealer target, subtract half the sum of the absolute differences between the scheduled and uniform dealer weights.
That total-variation adjustment is conservative because each dealer's expected pair score is bounded between zero and one.
The fixed pseudorandom seeds make the experiments reproducible; the statistical interpretation depends on treating the deals as samples from the stated random-deal model.
The bound is specified for a fixed sample and is not an optional-stopping rule.
The stated coverage does not control error across an unlimited sequence of adaptively selected candidates.

After a study has stopped and released its lock, run:

```sh
node --import tsx scripts/modern-kl-bound.ts CONFIG.json OUTPUT_DIRECTORY 0.025
```

The command verifies the saved configuration, source fingerprint, Node version, scheduled plans, and retained match records.
It reports no lower bound when any planned pair is missing, incomplete, hypothetical, or misses its simulation budget.
It also reports the existing paired Hoeffding interval, the number of unpaired legs, and the selected error probability.
