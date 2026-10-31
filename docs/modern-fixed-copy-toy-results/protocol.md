Compare the existing sampler with uniform physical allocations for two identical A faces and one each of B and C, split into two hands of two cards.
Condition the first hand to contain at least one A.
The working prediction is that the sampler assigns both As to the first hand at a frequency within 0.02 of one third and more than 0.08 away from the uniform-physical-allocation probability of one fifth.
The first sampling attempt always satisfies the specified bounds, so the flow fallback is not involved.
This compares two explicit allocation models and does not claim that either is the true posterior for a particular public history.
Use 20000 fixed-seed samples, enumerate labelled physical deals exactly, and replay the output.
