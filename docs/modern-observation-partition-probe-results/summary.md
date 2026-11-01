# Observation partition sensitivity result

The [fixed probe](../modern-observation-partition-protocol.md) completed 20 comparisons with 16 simulations for each policy at every position.
The selected action changed in zero positions, so the prediction of at least one change was not met for this trajectory.
The sorted root visit distributions differed at decisions 2, 13, and 17.
The retained results replayed byte for byte, excluding elapsed times.

The source was fixed before the probe as Git tree `9f9a69703b1f087586d444a03aca478160ccbb47` and ran with Node `v22.22.1`.
The [source patch](source.patch.gz) applies to commit `0d9064d` and reproduces that tree.
The SHA-256 of the [raw results](results.jsonl) is `bdc1cea59d977c7cea15b8fa30ac11ce7e0f9d9dc79b653313f26f55c5b884f4`.
The SHA-256 of the [driver](../../scripts/modern-observation-partition-probe.ts) is `4784a0560122ef91c6c11e1c09bb1fe7fad4c21478ccfe6a675bfb408efa2db6`.

These correlated positions do not establish how often the partition changes decisions elsewhere, whether it improves playing strength, or whether the key captures complete player memory.
The partition remains disabled by default.
