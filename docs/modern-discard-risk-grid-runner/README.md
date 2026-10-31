The compressed driver runs the configurations in the [training protocol](../modern-discard-risk-grid-protocol.md) and retains each leg in a separate source-bound study directory.
It checks each retained leg and requires an eligible hand-score summary before proceeding to the next configuration.
On a rerun, it asks each study to resume from its retained records and verifies them again.
Interrupted partial legs remain separate from completed legs.

The driver currently uses an absolute path to a detached worktree named `open-canasta-risk-grid` and expects that worktree to contain the committed configurations and matching dependencies.
Adapt the path for another machine and keep the source commit and Node version fixed for any resume or replay.
The compressed configuration generator records how the 18 configurations were constructed and checked for distinct deals.
