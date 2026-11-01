This exploratory optimization replaced repeated JSON serialization in the inference convergence loop with explicit change tracking.
It was compared with the source at commit `7bf88aa` on 120 reconstructed observations, using five alternating-order timing rounds after an equality and warmup pass.
The baseline and candidate returned identical serialized bounds on all 120 inputs.
The median candidate-to-baseline inference-time ratio was approximately 0.956, below the 10% improvement used for this screen.
The five ratios ranged from approximately 0.933 to 1.019.
An independent execution of the same benchmark and corpus reproduced equal bounds and gave a median ratio of approximately 0.980.
The second execution is a timing repeat on the same inputs, not an independent position sample.

The observations come from 15 correlated, face-key-reconstructed trajectories, and the original physical-card choices cannot be verified from those logs.
They are useful fixed computational inputs, not a representative sample of all histories or proof that the two implementations are behaviorally equivalent.
The benchmark ran on a shared machine while other studies were active, so the timings do not establish an end-to-end game-speed improvement.
The candidate was not adopted.

The [corpus generator](corpus.mts), [benchmark](benchmark.mts), [measured output](summary.json), [timing repeat](replay.json), and [candidate patch](candidate.patch.gz) preserve the probe.
To reproduce it, extract `src/bot/card-knowledge.ts` from `7bf88aa` as an absolute-path baseline file, copy it as a candidate file, and apply the decompressed patch to the candidate.
Run the benchmark from the repository root with the absolute baseline and candidate paths.
