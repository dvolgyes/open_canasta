The depth-eight policy scored higher in 30 of 48 hands, and the depth-three policy scored higher in 18.
There were no tied hands.
Depth eight scored 11–5 at starting score 0, 10–6 at 3000, and 9–7 at 5000.
The result met the predeclared 29-hand observed threshold.

All 48 hands finished, with no missed simulation budgets.
Depth eight made 2,408 decisions and completed 19,264 simulations.
Depth three made 2,317 decisions and completed 18,536 simulations.
Each retained block was validated by the source-bound hand summary and replayed to the same study summary.
The study used the search and arena source at commit `287c5a7`.

Treating each of the 24 paired deals as one bounded observation gives a descriptive 95% Hoeffding interval of approximately [0.348, 0.902] for the mean hand-win score.
This interval assumes the fixed pseudorandom deals represent independent draws from the intended deal distribution.
It does not correct for the broader adaptive search for candidates.
The small sample does not establish a full-match advantage, and the deeper search may use more time per simulation.
The result does not isolate the effect of UCB or authorize LLM testing.

See the [protocol](../modern-depth-replication-protocol.md) and retained summaries for [score 0](score-0/summary.json), [score 3000](score-3000/summary.json), and [score 5000](score-5000/summary.json).
