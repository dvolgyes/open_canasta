Compare weights zero and 100 on five handcrafted-policy hands at each symmetric starting score of 0, 3000, and 5000.
Use the same random seed for both searches at each position and follow the zero-weight policy's actions.
The working predictions are that fewer than 5% of positions with multiple visited root actions change their selected action, and that at least one sampled position has a playable action with a nonzero seven-blocked feature.
A result at or above 5% falsifies the first threshold, and no such playable action falsifies the second prediction for these sampled paths.
Record all decisions, simulation budgets, and positions with committed opposing sevens, and replay the sample exactly.
These correlated hands measure feature exposure and action sensitivity, not match strength or population frequencies.
