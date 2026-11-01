The depth-eight policy scored higher in 14 of 24 hands, and the depth-three policy scored higher in 10.
There were no tied hands.
Depth eight scored 4–4 at starting score 0, 6–2 at 3000, and 4–4 at 5000.
The result met the predeclared 14-hand observed threshold.

All 24 hands finished, with no missed simulation budgets.
Depth eight made 1,237 decisions and completed 9,896 simulations.
Depth three made 1,207 decisions and completed 9,656 simulations.
Each retained block was validated by the source-bound hand summary and replayed to the same study summary.
The study used the search and arena source at commit `287c5a7`.

This small pilot measures hand scores, not full-match win rates.
The deeper search may use more time per simulation, and the result does not isolate the effect of UCB.
It does not establish a population advantage or authorize LLM testing.

See the [protocol](../modern-depth-pilot-protocol.md) and the retained summaries for [score 0](score-0/summary.json), [score 3000](score-3000/summary.json), and [score 5000](score-5000/summary.json).
