The fixed calibration diagnostic completed 24 hands and recorded 1180 positions.
The mean relaxed pair estimate was 0.18968 and the observed frequency was 0.25508.
The absolute difference was 0.06540, which exceeded the predeclared 0.05 threshold.
The Brier score was 0.15643.
The complete records replayed byte for byte, and every decision met its two-simulation budget.

The exploratory stratified hand-cluster bootstrap gave a 95% percentile interval of approximately [-0.07940, -0.05085] for estimate minus observed frequency.
The interval has no guaranteed nominal coverage with only two hands in each score-and-dealer stratum.
It describes these simulator policies and the declared sampling scheme, not human or LLM opponents.
The label measures a matching pair before bonus-three replacements, not a legal or chosen pile pickup.
The positions within a hand are correlated.

An exploratory breakdown after seeing the result found an estimate of 0.24092 and frequency of 0.21888 over 233 positions in decisions 0 through 19.
For decisions 20 through 39, the corresponding values were 0.22414 and 0.31405 over 242 positions.
For decisions 40 through 59, they were 0.18287 and 0.29880 over 251 positions.
These groups were selected after inspection and need an independent test before they motivate a correction.

The driver and analysis scripts are compressed alongside the records.
Their absolute import paths identify the original workspace and need adjustment when replayed elsewhere.
The experiment used the code in the source snapshot recorded in [the grid runner](../modern-pair-threat-grid-runner/README.md), with Node v22.22.1.
The snapshot predates this result document and does not include it.
