This diagnostic repeats the earlier eight-versus-two simulation hand comparison on 12 fresh paired deals.
Both policies use the same handcrafted prior, rollout, cutoff evaluation, and depth three.
The candidate uses eight simulations per decision and the comparator uses two.
Use four paired deals at each symmetric starting score of 0, 3000, and 5000, with each dealer represented once per score.
Play both side assignments for each deal, giving 24 single-hand scenarios.
Use a 30000 ms decision ceiling and a 300-action hand cap.
The [seed check](modern-eight-vs-two-replication-results/seed-check.mts.gz) checked 12 distinct new deals against 1072 earlier or planned seeds.

The working prediction is that the eight-simulation policy scores higher in at least 14 of the 24 hands, matching the earlier pilot threshold.
Fewer hand wins falsify that threshold for these scenarios, not a population win rate.
Require every scheduled hand to end and every decision to complete its policy's declared simulation budget.
Retain and replay the records, count ties separately, and preserve partial records if the run fails.
The budgets differ, so a favorable result can reflect any effect of extra simulation and cannot isolate the UCB formula.
The single-hand sample does not establish full-match playing strength.
