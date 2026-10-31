Under the specified model, the probability of observing the discard is one half.
There are nine equally weighted observed initial-deal and physical-discard events, and two leave a pair of the rank in the player's hand.
The exact conditional pair probability is therefore `2/9`, approximately 0.2222.

The [relaxed model](result.json) gives `1/6`, approximately 0.1667, and 3340 of 20000 fixed-seed samples from the current bounds-based sampler contained a pair, a frequency of 0.167.
The result replayed byte for byte.
This is a posterior mismatch for the explicitly specified uniform-discard model; it is not a measured error for real opponents.
It demonstrates that close agreement between the relaxed estimate and the current sampler cannot establish calibration.

The run used Node v22.22.1 and the staged source snapshot recorded with the [pair-threat screen](../modern-pair-threat-grid-runner/README.md).
The stored driver uses absolute workspace paths and requires adaptation for another checkout.
