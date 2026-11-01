This exploratory diagnostic compares search depths eight and three using the same trained retention-weight-25 prior and eight simulations per decision.
Both policies use the same rollout, cutoff evaluation, exploration settings, and 30000 ms decision ceiling.
The deeper search can use more computation per simulation, so this is an equal-simulation comparison rather than an equal-time comparison.

Use four fresh paired deals at each symmetric starting score of 0, 3000, and 5000, with each dealer represented once per score.
Play both team assignments for each deal, giving 24 single-hand scenarios with a 300-action hand cap.
The [configuration generator](modern-depth-pilot-config-generator.mts) checks the 12 planned deals against prior and currently planned seeds.
The working prediction is that depth eight scores higher in at least 14 of the 24 hands.
Fewer hand wins falsify that observed threshold for these scenarios, not a population win rate.

Require every hand to finish and every decision to complete eight simulations.
Retain all legs, including cancelled partial legs, and replay the source-bound records.
Count ties separately and report the number of deadline stops and incomplete hands.
The diagnostic does not establish full-match strength, isolate the effect of UCB, or authorize LLM testing.
Select any follow-up candidate before evaluating it on fresh full-match deals.
