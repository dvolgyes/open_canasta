Compare the default full tree with a root-only tree, using the same handcrafted prior, rollout, exploration constant, eight simulations, and total evaluation depth three.
Use 12 distinct paired deals with sides swapped, covering each combination of dealer seat and symmetric starting score 0, 3000, and 5000 once.
The working prediction is that full tree search scores higher in at least 14 of the 24 settled hands.
Fewer wins falsify that observed threshold for these hands, not a population win rate.
Record each policy's actual decision and simulation counts, replay the records, and reject any hand with a missed budget or invalid termination.
The root-only control still uses UCB allocation at the root, so this measures a tree-depth change rather than UCB against uniform sampling.
The hand-score diagnostic cannot establish a full-match strength difference.
