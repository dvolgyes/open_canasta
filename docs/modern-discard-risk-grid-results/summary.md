The six-weight training screen completed all 144 scheduled hands with no incomplete hands or missed simulation budgets.
The [results](summary.json) ranged from 11–13 to 12–12 against the handcrafted policy.
No coefficient exceeded the predeclared 50% selection threshold, so the rule retained weight zero.
Rerunning the retained records reproduced the same summary.

The following comparison was made after the screen and is exploratory.
Across the six weights, 15 of the 24 matched hands had different final scores and four had different winning sides.
This shows that recorded outcomes varied, while the hand-win objective provided a coarse signal in this sample.
The [post-hoc score-margin calculation](posthoc-margin.json) uses the same training hands and was not part of the selection rule.
It does not establish which weight is best, and the 24 matched hands do not establish a population win rate.

The study used Node v22.22.1 and source commit `df9376b`.
Every retained JSON record was checked against the source-pinned worktree after formatting.
The predeclared [protocol](../modern-discard-risk-grid-protocol.md) and [runner](../modern-discard-risk-grid-runner/README.md) describe the schedule, scoring, selection, and replay.
