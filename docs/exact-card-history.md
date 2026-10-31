The research-only `exactCardHistory` function in [exact-card-history.ts](../src/bot/research/exact-card-history.ts) enumerates a small card-history model.
It is a reference for testing approximate inference, not the production rollout sampler.

The input gives an initial pool of unknown card faces, the number of cards in each hidden row, known public card faces, and an event sequence.
The initial unknown physical cards are allocated uniformly across the specified rows.
Duplicate faces receive their physical-copy multiplicity when the initial allocation is weighted.
The reported evidence probability is conditional on that initial pool, row counts, and public cards.

Events can move known faces from the public pool to a row, observe a discard face, transfer one uniformly chosen hidden physical card between rows, or reveal an exact row of faces.
The caller supplies a deterministic discard-likelihood function that returns a probability for each face in the acting hand.
The function receives that hand, the current public face multiset, the player, and the event index, but not other hidden rows.
It must describe a probability distribution over the distinct faces in the hand, conditional on a discard occurring.
The supplied `uniformDiscardLikelihood` models a uniformly chosen physical card and therefore gives repeated faces proportional probability.

The result contains posterior face multisets and their probabilities, plus the probability of the observed events under the supplied model.
The calculation enumerates the model's states and uses floating-point arithmetic, so numerical roundoff remains.
It returns explicit failure data for invalid input or likelihoods, impossible evidence, state-limit exhaustion, and detected numerical underflow.
It accepts at most 12 initial cards and 100000 distinct states, and it does not silently truncate a posterior.

The oracle does not enforce Canasta rules, infer an opponent's strategy, preserve meld or pile ordering, or reconstruct missing private history.
Its caller must supply a suitable event sequence and action model before its results can be interpreted as a posterior for a game.
