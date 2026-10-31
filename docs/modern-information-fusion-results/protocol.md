Sample one hidden fair bit for a simulated opponent, who observes that bit and then guesses its value.
The first player has only one action, and the opponent receives reward one for a correct guess.
The exact value for an opponent that uses its observation is one, so the first player's value is zero.
Run 10000 fixed-seed iterations through the current generic tree with depth two and no heuristic priors.
The working prediction is that the reported first-player root mean lies between 0.40 and 0.60 because the tree merges the opponent's two distinct observations.
Replay the result exactly and record simulation count and source commit.
This is a constructed counterexample about the generic tree's information partition, not a measured Canasta match effect.
