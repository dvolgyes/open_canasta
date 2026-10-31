# LLM diagnostic after the local study

This protocol is declared before any paid request and before the local promotion and zero-prior results are available.
All 1000 local matches must complete first.
The paid driver checks every expected match file, paired seed and seat, source revision, completed winner, MCTS policy, and simulation count before it reads `.env`.

Test the reference weights and the final trained candidate against the retained LLM policy.
Use one paired block for each policy, with the same fresh deal seed and dealer for both comparisons.
Run the reference pair first, then the candidate pair.
If both weight vectors are identical, omit the duplicate comparison.
This is at most four full matches, subject to the aggregate USD 1 limit.
A failed or unfinished match stays incomplete; it does not count as a loss, win, or draw.
Stop the paid stage at the first incomplete match or unresolved charge.

Use the repository's Mercury 3 opponent family through OpenRouter, pinned to `inception/mercury-3-20261019` if the public model catalog provides that ID; otherwise use the existing `inception/mercury-3` ID and record that alias limitation.
Restrict routing to Inception, with provider fallbacks disabled.
Use the existing prompt and legal-choice menu, including public card-memory bounds, with reasoning disabled and a 4096-token output cap.
The menu contains at most 40 actions selected by the existing heuristic.
This comparison therefore measures the retained LLM agent, including its action menu, rather than unrestricted model reasoning.
The MCTS policies retain eight simulations per decision at depth 12.

## Spending and data boundary

Read the API key from `.env` only after local verification succeeds.
Keep it out of prompts, arguments, output, and result files.
Do not change the shared key's account limits.
Record each request durably before dispatch, allow only one outstanding request, and disable automatic retries.
The shared request journal covers both comparisons.
An existing paid-output directory blocks a new invocation, so restarting the command cannot reset this study's budget.

The request guard checks current catalog prices and context limits before generation.
For a text-only request, reserve the entire model context at the maximum prompt price plus the output cap at the maximum completion price.
Round costs upward to nanodollars and include a 5% margin for the possible BYOK platform fee.
Only dispatch when accounted spend plus the new reservation is at most USD 1.
Send provider price ceilings on every request, disable plugins, and require parameter support.
Reject unknown charges, out-of-range token counts, or costs above the reservation.
This relies on OpenRouter enforcing its documented price and token controls and reporting usage correctly.
It is a local study spending guard, not a change to the shared account's protection settings.

The model returns only an index into a supplied legal-action menu.
The existing parser checks the index, and the game engine checks the action again.
No model output becomes a shell command, path, or privileged tool call.
Only simulated game observations are sent to the provider.

## Interpretation

Record both policy results, every charged or unresolved request, aggregate reported cost, and the more conservative accounted cost.
Do not use these games to tune weights or change promotion thresholds.
Four matches cannot establish reliable superiority over LLMs.
The result is a small diagnostic for gross decision failures and for feasibility of a larger, separately funded benchmark.

Price routing and unit definitions follow the [OpenRouter provider-selection documentation](https://openrouter.ai/docs/guides/routing/provider-selection).
The distinction between a local ledger and account limits follows the [OpenRouter spending-control documentation](https://openrouter.ai/docs/guides/best-practices/spend-controls).
