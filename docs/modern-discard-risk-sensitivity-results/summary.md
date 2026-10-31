The probe recorded 1279 positions in twelve completed hands, and all decisions met the two-simulation budget.
It found 146 positions where an opposing hand contained at most three cards and legal discards had at least two different point values.
The counts were 65, 27, and 54 at starting scores of 0, 3000, and 5000, respectively.
The predeclared coverage threshold was met, and the records replayed byte for byte.

This probe uses the current hand count and does not include pending bonus cards in that count.
It establishes neither the effect of a weight on prior rankings nor the strategic value of a high-point discard, which can also help an opponent take the pile.
A subsequent ranking probe includes pending bonus counts and tests whether specified weights change highest-prior action sets.
The source was commit `a20d2a0cacec6808099618a5a82532e199e3fa8a`, and the run used Node v22.22.1.
The stored driver uses absolute workspace paths and requires adaptation for another checkout.
