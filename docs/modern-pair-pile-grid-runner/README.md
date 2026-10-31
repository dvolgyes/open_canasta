The compressed driver implements the [pile-weight training protocol](../modern-pair-pile-grid-protocol.md).
It uses a detached `open-canasta-pile-grid` worktree, stores every leg through the source-bound modern study runner, and validates each saved result before selecting a coefficient.
It retains cancelled partial legs separately and supports resuming from completed legs.
The absolute worktree paths in the driver need adjustment for another workspace.

The [configuration generator](config-generator.mts.gz) checked the 24 distinct training deals against 862 earlier or planned deal seeds, including the running confirmation studies and the direct ranking and calibration seeds.
All six weights use the same deals and policy seeds at each starting score.
The screen starts from base commit `2eb006dc8a9b35879f96cb0b0db7f7b926f1cadb` plus the retained [source snapshot](source-snapshot.patch.gz).
The uncompressed patch has SHA-256 `a5be8ed34eddf592ed3080b23767705042d6290d95ac543302c50a4f8c4d5a42`.
Its source, study runner, and configurations were compared with the staged files before starting the screen.
The full pre-commit run passed, but the following commit hook timed out on the unchanged 20-second research CLI test after 23.2 seconds while 1963 other tests passed.
The feature remains staged until a normal commit-hook run succeeds.
