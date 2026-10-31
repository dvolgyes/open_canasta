The fixed candidate uses the handcrafted modern prior plus pair-threat weight 50, selected by the completed six-weight training screen.
The first held-out studies scored 61–39 against the handcrafted prior and 97–3 against zero tree prior, but did not establish the requested population rates.
Run new, independent studies of 200 paired deals and 400 full matches against each baseline.
Use the same two simulations, depth three, decision ceiling, match rules, and side-swapping method as the first held-out studies.
Use distinct deal seeds across these studies and all retained previous paired records.
Do not change the candidate or stop on interim outcomes.
The [configuration generator](modern-pair-confirm-config-generator.mts.gz) checked 400 distinct planned seeds against 462 earlier recorded deal seeds and the direct calibration and ranking seeds.
The studies run from the frozen grid worktree after its source and study runner were compared with commit `69360f0`.

Each dealer is used exactly 50 times per study, and each pair contributes its mean match-win score in [0, 1].
Require every match to complete and every decision to meet the simulation budget.
Report wins, losses, incomplete matches, deadline stops, the paired Hoeffding interval, and the one-sided paired relative-entropy lower bound at alpha 0.025 per opponent.
Under independent sampled deal pairs, fixed candidate and study definitions, and the intended uniform-dealer random-deal model, the union bound gives at least 95% simultaneous coverage for the two lower bounds.
The fixed pseudorandom seeds stand in for samples from that distribution.
The confirmation uses fresh deals and does not reuse earlier validation outcomes.

With no ties or incomplete matches, at least 239 wins against handcrafted play make its lower bound exceed 0.50.
At least 278 wins against handcrafted play make its lower bound exceed 0.60, and at least 381 wins against zero tree prior make its lower bound exceed 0.90.
The first threshold tests an advantage over handcrafted play; it does not meet the stronger 60% objective by itself.
Only the latter two simultaneous lower bounds can open the local statistical gate for a subsequent LLM evaluation.
The zero-tree-prior baseline retains the handcrafted rollout and cutoff evaluator.

This sample is not well powered to establish a true handcrafted win rate just above 0.60.
For an illustrative independent and identically distributed three-outcome model with pair scores 0, 0.5, and 1 occurring with probabilities 0.14, 0.50, and 0.36, the probability of reaching the 278-win threshold is approximately 0.00018.
Those probabilities were estimated from only 50 earlier pairs, so this is a design illustration, not a reliable forecast of the new study.
The same illustrative model gives approximately 0.72 probability of reaching the 239-win threshold.
The [power calculation](modern-pair-confirm-power.mjs.gz) evaluates the full discrete distribution without normal approximation.
An inconclusive target bound must not be treated as failure to improve or as evidence of a 60% rate.
