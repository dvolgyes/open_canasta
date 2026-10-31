Weights 25, 50, and 100 changed the highest-prior action set at 231, 259, and 297 of 1279 positions, respectively.
All twelve hands completed, every decision met the two-simulation budget, and the records replayed byte for byte.
The predeclared sensitivity threshold was met, but the correlated positions do not establish a population frequency, a final search-action difference, or match strength.
The prototype produced a tiny positive value of approximately `5.6e-17` for an impossible pair in two positions, which broke prior ties.
The subsequent implementation returns exact zero for those impossible cases and changed the corresponding ranking counts to 229, 257, and 295; all estimates otherwise agreed within `1e-12` in the migration check.
The original counts remain recorded above because they are the original probe result.

Its hypergeometric arithmetic matched 501 small relaxed-allocation cases, and the included check also covers guaranteed and impossible pair boundaries.
The model does not enforce every row bound or describe strategic opponent actions, and it ignores bonus-three replacement.
Its output is not a calibrated posterior or a probability that the opponent will take the pile.
A separate probe compares it with the existing constraint-respecting sampler, which is also not a ground-truth posterior.

The run and replay used Node v22.22.1 and the search and arena source at commit `14a1330`.
The stored drivers use absolute paths and require adaptation for another checkout.
