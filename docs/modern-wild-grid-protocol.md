# Wild-card prior training grid

This exploratory screen varies the `wildSpent` tree-prior coefficient across −20, 0, 10, 25, 50, and 100.
The candidate otherwise uses the retention-weight-25 prior, and its opponent uses the handcrafted prior with retention weight 10.
Positive wild-card weights penalize spending wild cards, while the negative weight rewards spending them.
All policies use eight simulations per decision, depth eight, the same rollout and cutoff evaluator, and a 30000 ms decision ceiling.
The simulation count and depth match, although individual simulations can require different amounts of computation.

For each weight, use eight paired deals at each symmetric starting score of 0, 3000, and 5000.
Represent each dealer twice per score.
All six weights use the same deal and policy seeds for a given score and pair.
Play both team assignments, giving 48 single-hand scenarios per weight and 288 in total, with a 300-action hand cap.
The [configuration generator](modern-wild-grid-config-generator.mts) checks the 24 new deals against 1954 recorded or planned seeds.
The [recorded-seed inventory](modern-wild-recorded-seeds.json.gz) collects numeric `seed` fields from 7548 frozen structured research files and adds the documented direct seeds 121 and 9137.
The [inventory script](modern-wild-seed-inventory.mts) reads the frozen [input list](modern-wild-seed-inputs.txt.gz) and can reproduce the inventory.
The check also includes the planned deal seeds from the earlier fixed study configurations.
It does not claim to detect seeds stored under other names or only in unstructured text.
The [runner](modern-wild-grid-runner.sh) validates each retained block and can resume completed legs.

After all hands finish, select the weight with the most hand wins plus half a point per tied hand.
Break a score tie by choosing the weight closest to the incumbent value 10, then the lower weight if still tied.
The [summary](modern-wild-grid-summarize.mts) validates the raw, source-bound legs before applying this rule.
Run the summary with `--configs-only` to validate all 18 configurations before play.
Require every hand to finish and every decision to complete eight simulations.
Retain every leg, including cancelled partial legs.
The working prediction is that a nondefault weight will score strictly higher than weight 10 in this training screen.

The selected weight is exploratory and must be evaluated on fresh full-match deals against both local baselines before promotion or LLM testing.
The common opponent differs from the candidate in retention weight as well as the tested wild-card weight.
The screen can rank these candidate weights on its training deals but cannot isolate their overall effect against the handcrafted prior.
