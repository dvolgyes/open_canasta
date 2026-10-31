The predeclared ranking probe completed 12 hands and 1279 positions with all search budgets met.
The pile-scaled pair-threat adjustment changed the highest-prior action set in 51 positions, exceeding the predicted minimum of five.
All changed positions were in the play phase, with pile sizes from five to 46 cards.
The records replayed byte for byte.
After adding the new term with its default zero weight, the same 1279-position driver reproduced the original records byte for byte.

The sampled hands share trajectories and do not establish a population frequency or match strength.
The scaling factor and the cap of eight cards are exploratory choices, not estimates of pile value or a pickup probability.
The driver uses the source at commit `2eb006dc8a9b35879f96cb0b0db7f7b926f1cadb` and contains absolute workspace imports that need adjustment on another machine.
The [pair-pile weight](../../src/bot/modern-search.ts) is separately configurable, applies only at the current root, and defaults to zero.
It adds the weight times `min(pile size, 8) / 8` to the ordinary pair-threat weight.
The signed weight requires training and independent match evaluation before any promotion.
