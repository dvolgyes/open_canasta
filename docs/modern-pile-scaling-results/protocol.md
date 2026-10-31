Follow the same 12 fixed handcrafted-policy hands used in the earlier pair-threat ranking probe.
At every position, compare the top-prior action sets from pair-threat weight 50 and from weight 50 multiplied by `1 + min(pile size, 8) / 8`.
Use the corrected existing pair-threat function and the same handcrafted baseline features for both scores.
The adjustment is an exploratory ranking probe, not a claim that pile size measures pickup value or that either policy is stronger.
The working prediction is that at least five positions change their highest-prior action set.
Require every action to be legal, every search to complete two simulations, every hand to end within 300 actions, and the records to replay exactly.
The correlated hands and post hoc choice of scaling factor do not establish population frequency or match strength.
