Start with one publicly known A card and one uniformly drawn unknown card from a distinct A copy, B, and C.
The player takes the known A, then discards one of their two physical cards uniformly at random, and the observer sees that the discarded face is A.
The working prediction is that the exact posterior probability of another A remaining is one half, while sampling from the current face-count bounds gives a frequency within 0.02 of one third.
Exhaustively enumerate the six equally likely initial-hand and discard choices, condition on the observed face, and compare with 20000 fixed-seed samples from `inferCards` and `sampleCards`.
This deliberately specified random-discard model is not a claim about how an actual Canasta opponent chooses a card.
Replay the output exactly and preserve both the model assumptions and the result.
