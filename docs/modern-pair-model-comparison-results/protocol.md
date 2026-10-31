Follow the same twelve fixed handcrafted-policy hands used by the ranking probes.
In each hand, collect the first eligible discard-choice position at or after decisions 5, 25, and 45, without reusing a position.
An eligible position has at least two legal discard ranks for which the next opponent's public meld state permits a pickup.
For every eligible rank at those positions, compare the relaxed pair estimate with the fraction of 500 fixed-seed allocations from the existing constraint-respecting sampler in which the next opponent's current hand and pending bonuses contain at least two matching cards.
The working prediction is that at least one sampled position has an absolute difference above 0.15 for some rank.
Require every policy simulation budget and legal transition, record missing scheduled positions, and replay the output exactly.
The existing sampler is not calibrated and is not a ground-truth posterior; this comparison tests model disagreement, not real-opponent accuracy.
