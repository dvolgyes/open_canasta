The compressed driver runs the configurations in the [training protocol](../modern-pair-threat-grid-protocol.md) and retains each leg in a separate source-bound study directory.
It checks every retained leg and requires an eligible hand-score summary before proceeding.
On a rerun, it resumes each study from its retained records and verifies them again.
Interrupted partial legs remain separate from completed legs.

The driver uses an absolute path to a detached worktree named `open-canasta-pair-grid` and expects matching source, configurations, and dependencies there.
Adapt the path for another machine and keep the source commit and Node version fixed for resume or replay.
The compressed configuration generator records how the 18 configurations were constructed and checked for distinct deals.
The screen started from base commit `14a1330` plus the retained [source snapshot patch](source-snapshot.patch.gz), before the feature commit, because the unchanged research CLI test timed out under concurrent machine load.
The uncompressed patch has SHA-256 `5289e1b7ef0780bf5bc9e29e0e83074997124d1fafed29f88a5ef40dd28a8b54`, and the worktree source and configurations were compared with the staged files before the screen started.
The source-bound study manifests record the exact runtime fingerprint, and full repository verification remains required before committing the feature.
Under sustained machine load, the unchanged research CLI test timed out both on the staged source and on the earlier `a20d2a0` worktree.
A warmed Node compilation cache allowed an isolated run to pass, but the complete suite still timed out on that test while passing 1963 others.
Restricting the unchanged test to four CPUs did not resolve the timeout under the same load.
The separate [timing diagnostic](cli-timing.mjs.gz) repeated the five CLI scenarios and their behavioral assertions with the warmed Node cache; all passed, but their [subprocess times](cli-timing-result.json) totaled approximately 20.8 seconds.
Three subsequent [isolated test trials](cli-timeout-trials.json) with the warmed cache all hit the unchanged 20-second timeout under load.
A further full run paused the training screen and passed 1963 tests, but the same test took approximately 21.2 seconds and timed out.
That run also identified formatting errors in two newly added calibration JSON files, which were corrected after the formatter check.
These diagnostics do not replace the required full pre-commit run.
The verification owner is this working session; the next check is an unchanged full run when machine load permits.
