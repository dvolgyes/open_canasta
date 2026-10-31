Follow 24 fresh fixed handcrafted-policy hands, with each dealer represented twice at each symmetric starting score of 0, 3000, and 5000.
At each position with at least two legal discard ranks for which the next opponent's public meld state permits pickup, choose one rank using a separate fixed-seed random stream.
Record the relaxed pair estimate and, only as an offline label, whether the simulator's next-opponent hand plus pending bonuses actually contains at least two cards of that rank before bonus-three replacement.
The bot's search receives only its normal observation and public history; hidden cards are never supplied to its policy.
The working prediction is that the absolute difference between the mean estimate and observed pair frequency is below 0.05 on these sampled positions.
Record position counts, mean prediction, observed frequency, Brier score, and fixed probability-bin summaries; require every simulation budget and legal transition and replay the records.
Positions from the same hand are correlated, so this is an exploratory calibration diagnostic for the handcrafted simulator, not independent evidence about human or LLM opponents.
Before inspecting calibration outcomes, add an exploratory 10000-replicate percentile bootstrap for the pooled signed calibration gap, resampling whole hands within each score-and-dealer stratum with fixed seed 81427.
Require both scheduled hands in every stratum to have at least one recorded position; otherwise report the bootstrap as ineligible rather than dropping a hand.
The small number of independent hands and the percentile bootstrap do not guarantee nominal coverage.
