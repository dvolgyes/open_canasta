This exploratory training screen selects a coefficient for the opt-in relaxed pair-threat prior against the handcrafted prior.
The candidate weights are -100, -50, -25, 25, 50, and 100; zero is the unchanged incumbent.
Positive weights penalize discards that the relaxed model rates as more likely to match a next-opponent pair, while negative weights test the opposite direction.
The model is not a calibrated posterior or a probability that an opponent will actually take the pile.

For each coefficient, use 24 distinct deals and play both side assignments, for 48 single-hand scenarios per weight.
Use eight paired deals at each symmetric starting score of 0, 3000, and 5000, with each dealer represented twice per score and the same deal and policy seeds across all six weights.
Both sides use the same handcrafted features, rollout policy, two simulations per decision, depth three, and a 30000 ms ceiling.
Only the candidate's pair-threat coefficient differs.
Retain and validate every leg, require the declared simulation budget on every decision, and replay the records.
Do not classify a capped scenario as a completed match.

Score each completed hand as one for the candidate's higher settled hand score, zero for a lower score, and one half for a tie.
Select the candidate with the greatest mean score if it exceeds one half; otherwise retain weight zero.
If candidates tie, prefer the smaller absolute coefficient and then the negative coefficient.
Stop selection if any scheduled hand is incomplete or misses a budget.
The selected coefficient is trained on these scenarios and requires fresh held-out full-match comparisons before promotion or any LLM test.
The screen and its selected winner cannot establish a population win rate or playing strength.
