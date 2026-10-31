Compare exploration constants square root of two and zero with the same handcrafted prior, rollout, eight simulations, and depth three.
Use 12 distinct paired deals with sides swapped, covering each combination of dealer seat and symmetric starting score 0, 3000, and 5000 once.
The working prediction is that the default exploration constant scores higher in at least 14 of the 24 settled hands.
Fewer wins falsify that observed threshold for these hands, not a population win rate.
Record each policy's actual decision and simulation counts, replay the records, and reject any hand with a missed budget or invalid termination.
This exploratory diagnostic changes the exploration term within the same tree search and does not compare UCB against root-only Monte Carlo.
It uses hand scores, not full-match outcomes, and cannot establish overall playing strength.
