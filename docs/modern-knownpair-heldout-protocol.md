The exploratory handcrafted screen selected the weight-50 known-pair candidate for further evaluation after an observed 12–8 result.
That selection and the single position used to choose the weight are not held-out evidence.
Compare the candidate with the handcrafted prior and zero tree prior on separate fresh seed splits, each with 50 seat-swapped pairs and 100 planned full matches.
Use two simulations and depth three per decision, and retain every completed or incomplete leg with its simulation-budget status.
The runs were stopped and resumed from retained legs in a detached worktree at their original source commit, with additional pauses to free CPU for verification.
The interrupted partial legs are recorded separately and do not contribute wins or losses.
The working predictions are at least 60 wins against the handcrafted prior and at least 90 wins against zero tree prior in their respective 100-match studies.
Fewer wins falsify the corresponding observed threshold for these matches, not a population win rate.
Report paired confidence intervals and do not treat an observed ratio alone as confidence that the underlying rate exceeds a target.
After the studies started, and before examining their held-out outcomes, add a supplementary one-sided lower bound by inverting inequality 2.1 of [Hoeffding's 1963 paper](https://www.cs.rpi.edu/academics/courses/spring06/random/hoefding.pdf).
Each deal pair contributes its mean win score in the interval from zero to one.
The bound assumes independent deal pairs but does not require identical distributions across dealer seats.
The 50-pair schedule uses dealer seats 13, 13, 12, and 12 times, so subtract 0.02 from the scheduled-dealer lower bound when reporting a conservative uniform-dealer lower bound.
This adjustment bounds the largest possible difference between the scheduled and uniform dealer averages when each dealer's expected score lies between zero and one.
Use a one-sided error probability of 0.025 for each local comparison, so the union bound gives at least 95% joint coverage for the two lower bounds under that model.
The fixed pseudorandom seeds are a reproducibility mechanism, so the statistical interpretation depends on treating those deals as samples from the stated random-deal model.
The joint coverage statement applies to this fixed candidate and these fixed studies, not to an unlimited sequence of adaptively selected candidates.
Later adaptive candidates need a predeclared error-spending plan or a genuinely independent final confirmation.
Report this bound alongside the original paired Hoeffding interval and distinguish the observed ratios from either bound.
At this sample size, a 99–1 record would still leave the unadjusted one-sided lower bound below 0.90, while a 100–0 record would yield a uniform-dealer lower bound of approximately 0.909.
The zero tree-prior baseline retains the handcrafted rollout and cutoff evaluator.
LLM testing remains closed unless both local targets are met with sufficient evidence.
