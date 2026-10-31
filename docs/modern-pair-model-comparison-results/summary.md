The probe reached all 36 scheduled positions in twelve hands and compared 222 position-rank combinations.
The [largest absolute difference](summary.json) between the relaxed estimate and the 500-sample frequency was approximately 0.055; the mean absolute difference was approximately 0.015.
No difference exceeded 0.15, so the predeclared prediction was not met on this sample.
Every policy decision met its simulation budget, and the records replayed byte for byte.

The sampled positions and ranks are correlated, and the sampled frequencies have Monte Carlo error.
As a post-hoc calculation, a simultaneous Hoeffding bound over all 222 comparisons adds approximately 0.095 to the largest observed difference at 95% coverage, assuming independent sampler draws at each fixed position.
The resulting upper bound is approximately 0.1502 for the largest difference on these fixed cases; the fixed pseudorandom seeds require the usual random-sampling interpretation.
The existing sampler is not a calibrated posterior, so this agreement does not establish that either method predicts actual opponents correctly.
The relaxed model also ignores bonus-three replacement and some allocation constraints.
The run and replay used Node v22.22.1 and the search and arena source at commit `14a1330`.
The driver uses absolute paths and the [saved relaxed model](../modern-pair-surrogate-ranking-results/model.mts.gz); both paths require adaptation for another checkout.
