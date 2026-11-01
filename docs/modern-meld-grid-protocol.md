This exploratory training screen varies the `cardsMelded` tree-prior coefficient across −12, −4, 0, 4, 8, and 16.
The candidate otherwise uses the trained retention-weight-25 prior, and its opponent uses the handcrafted prior with retention weight 10.
Every policy uses two simulations per decision, depth three, the same rollout and cutoff evaluator, and a 30000 ms decision ceiling.
At two simulations, the screen mainly tests the ordering of unvisited actions rather than UCB allocation among visited actions.

For each weight, use eight paired deals at each symmetric starting score of 0, 3000, and 5000, with each dealer represented twice per score.
All six weights use the same deal and policy seeds for a given score and pair.
Both team assignments are played, yielding 48 single-hand scenarios per weight and 288 in total, with a 300-action hand cap.
The [configuration generator](modern-meld-grid-config-generator.mts) checks 24 distinct planned deals against earlier recorded and planned seeds.
The [runner](modern-meld-grid-runner.sh) validates each retained block and can resume completed legs.

After all hands finish, select the weight with the most hand wins plus half a point per tied hand.
Break a score tie by choosing the weight closest to the incumbent value 4, then the lower weight if still tied.
The [summary](modern-meld-grid-summarize.mts) validates the raw, source-bound legs before applying this rule.
Require every hand to finish and every decision to complete both simulations, and retain every leg including cancelled partial legs.
The working prediction is that a nondefault weight will score strictly higher than weight 4 in this training screen.
The selected weight is exploratory and must be evaluated on fresh full-match deals against both local baselines before promotion or LLM testing.
