This exploratory CPU profile used Node v22.22.1 and source commit `2eb006dc8a9b35879f96cb0b0db7f7b926f1cadb`.
The [arena driver](arena-driver.mts.gz) played one seed from the weight-50 training configuration at two simulations and depth three.
The hand used 84 actions and 168 simulations, with no deadline stops.
The profile recorded 2206 samples, including startup, idle time, and profiler overhead.

Aggregating self samples by function and file gave 119 samples in `inferCards`, 119 in unnamed functions in `card-knowledge.ts`, and 148 in the Node performance clock.
These counts are not disjoint measures of full operations and do not establish which code dominates end-to-end runtime across deals.
The small sample suggests measuring belief inference, deadline-check frequency, and action generation on a broader workload before changing them.
Any optimization must preserve history constraints, identical-face uncertainty, legal action coverage, and deadline behavior.

The separate [calibration driver](calibration-driver.mts.gz) also calculated extra offline estimates at eligible positions.
Its [profile](calibration.cpuprofile.gz) is retained as a diagnostic but does not represent the normal arena workload.
The [arena profile](arena.cpuprofile.gz) and both compressed drivers contain absolute paths from the original workspace; adjust imports when replaying elsewhere.
