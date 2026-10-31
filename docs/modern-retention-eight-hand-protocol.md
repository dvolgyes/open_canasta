This diagnostic compares the trained `discardPair` weight 25 with the handcrafted weight 10 at eight simulations per decision and depth three.
Both policies use the same remaining prior weights, rollout, cutoff evaluation, and computational budget.
Use four fresh paired deals at each symmetric starting score of 0, 3000, and 5000, with each dealer represented once per score.
Play both side assignments for each deal, giving 24 single-hand scenarios.
Use a 30000 ms decision ceiling and a 300-action hand cap.

The working prediction is that the weight-25 policy scores higher in at least 14 of the 24 hands.
Fewer hand wins falsify that threshold for these scenarios, not a population win rate.
Require every scheduled hand to end and every decision to complete eight simulations.
Retain and replay every leg, and count ties separately.
This pilot does not establish full-match playing strength or isolate UCB from other search mechanisms.
