Follow the same twelve fixed handcrafted-policy hands as the initial discard-risk coverage probe.
For every legal action, compare its existing tree prior with hypothetical additions of 25, 50, and 100 times a discard-risk feature.
The feature is the discarded card's point value divided by 20, multiplied by `(4 - n) / 3` when the smallest opposing hand plus pending bonus count is at most three, and zero otherwise.
Both opposing card counts and pending bonus counts are public; the feature uses the acting hand, not hidden opponents' cards.
The working prediction is that at least one weight changes the highest-prior action set at five or more positions.
An altered prior ranking is only a sensitivity signal: it does not prove a different final search decision or an improvement in game value.
Keep the baseline policy and fixed seeds unchanged, require every simulation budget and legal transition, and replay the records.
