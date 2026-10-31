# Modern meld-prior training result

The completed [training grid](modern-meld-grid-protocol.md) evaluated six meld-prior weights against the handcrafted prior.
The retained [source-bound records](modern-meld-grid-results) contain 288 completed hands across 24 paired deals per weight.
Every configuration passed its retained-result validation, with no incomplete hands or decision deadline stops.

| Meld weight | Wins | Losses | Ties |
| --- | ---: | ---: | ---: |
| -12 | 22 | 26 | 0 |
| -4 | 28 | 20 | 0 |
| 0 | 22 | 26 | 0 |
| 4 | 31 | 17 | 0 |
| 8 | 30 | 18 | 0 |
| 16 | 29 | 19 | 0 |

The predefined selection rule retained the incumbent weight 4.
The prediction that another weight would score strictly higher was not met.
The candidates shared the same paired deals, but individual hand outcomes are correlated and these training results do not establish a population win rate or a full-match improvement.
All candidates used the retention-weight-25 prior, while the opponent used the handcrafted retention weight 10.
The screen therefore does not isolate the meld coefficient from all other policy differences.

The weight 8 and 16 blocks ran in a second worktree at the same source revision and were copied into the primary result store before final validation.
The selector revalidated all retained legs against their configurations, source fingerprints, and decision budgets.
This result does not promote a bot or authorize paid model testing.
