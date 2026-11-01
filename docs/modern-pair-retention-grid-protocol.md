This exploratory training screen tunes the existing `discardPair` prior against the handcrafted prior.
The candidate weights are -100, -25, 0, 25, 50, and 100; the unchanged comparator has weight 10.
Positive weights favor retaining pairs, while negative weights test the opposite direction.
All other prior weights, rollout, and cutoff evaluation are identical between policies.
The existing seven and ace rules and penalties remain active.

For each coefficient, use 24 distinct deals and play both side assignments, for 48 single-hand scenarios per coefficient.
Use eight paired deals at each symmetric starting score of 0, 3000, and 5000, with each dealer represented twice per score and the same deal and policy seeds across all six coefficients.
Use two simulations per decision, depth three, a 30000 ms ceiling, and a 300-action hand cap.
Retain and validate every leg, require the declared simulation budget on every decision, and replay the records.
Do not classify a capped scenario as a completed match.

Score each completed hand as one for the candidate's higher settled hand score, zero for a lower score, and one half for a tie.
Select the candidate with the greatest mean score if it exceeds one half; otherwise retain the comparator weight 10.
If candidates tie, prefer the coefficient closest to 10 and then the smaller coefficient.
Stop selection if any scheduled hand is incomplete or misses a budget.
The selected coefficient is trained on these scenarios and needs fresh held-out full-match comparisons before promotion or any LLM test.
The screen and its selected winner cannot establish a population win rate or playing strength.
