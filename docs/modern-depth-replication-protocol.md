This fresh diagnostic repeats the equal-simulation comparison of search depths eight and three using the trained retention-weight-25 prior.
Both policies use eight simulations, the same rollout and cutoff evaluation, and a 30000 ms decision ceiling.
The deeper search can use more computation per simulation, so this is not an equal-time comparison.

Use eight fresh paired deals at each symmetric starting score of 0, 3000, and 5000, with each dealer represented twice per score.
Play both team assignments for each deal, giving 48 single-hand scenarios with a 300-action hand cap.
The [configuration generator](modern-depth-pilot-config-generator.mts) in `replication` mode checks these 24 planned deals against the original pilot and earlier recorded or planned seeds.
The working prediction is that depth eight scores higher in at least 29 of the 48 hands.
Fewer hand wins falsify that observed threshold for these scenarios, not a population win rate.

Require every hand to finish and every decision to complete eight simulations.
Retain all legs, including cancelled partial legs, and replay the source-bound records.
Count ties separately and report incomplete hands and deadline stops.
This hand-score diagnostic does not establish full-match strength, isolate UCB, or authorize LLM testing.
