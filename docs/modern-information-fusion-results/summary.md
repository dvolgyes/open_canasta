The current tree gave the first player's only action a mean value of 0.5074 after all 10000 requested simulations.
The exact first-player value against an opponent that sees and uses the bit is zero.
The result matched the predeclared prediction and replayed byte for byte without elapsed time.

The search shares opponent nodes for the same action history across sampled opponent observations, although the optimal response in this game changes with the opponent's observed bit.
The opt-in `informationKey` search interface partitions the acting player's tree statistics by a caller-supplied observation key.
With the same seed and the opponent's bit in that player's key, the [first player's estimated value](partition-result.json) was 0.0032 after 10000 simulations.
The regression test checks that the estimate is below 0.05 and that inconsistent root observation keys are rejected.
This addresses the example, but it does not establish the best Canasta fix.
Changing the tree also needs checks that each simulated player uses only its own information and that hidden-state details are not exposed to the real player.
The modern adapter does not yet supply an information key, and callers remain responsible for including the acting player's identity and remembered information without another player's hidden information.
The root-key consistency check cannot prove that a key excludes information that the acting player cannot observe.
The key partitions statistics within an action-history node; it does not merge distinct histories that an acting player cannot distinguish.
Games with hidden actions therefore need a separate treatment of what the tree's action history reveals.
The effect on Canasta decisions and match results is not measured here.

The original run used Node v22.22.1 and the generic search at commit `828deee6528882533305d5bee18553bc8bdb1221`.
The information-partition result used the subsequent working-tree change that introduced `informationKey`.
The stored driver uses absolute paths into the original workspace and requires those paths to be adapted for another checkout.
