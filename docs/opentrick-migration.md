# OpenTrick migration plan

The reference is OpenTrick commit `7af1a45`.
Inventory its changes and later accepted changes by feature before marking the migration complete.
Preserve the Canasta rules, variants, saved-table behavior, OpenRouter bot, and `.env` key handling.
Bridge rules, bidding, and its bot are not substitutes for Canasta behavior.

## Stages

1. Catalog the reference commits and compare shared modules, assets, settings, documentation, and tests.
   Record each feature as adopted, adapted, or inapplicable, with its reason and verification.
   Check existing Canasta behavior and OpenTrick's recorded decisions before choosing shared interfaces.
2. Port independent visual assets and foundations, then adapt themes, color settings, textures, typography, responsive layout, and accessibility to Canasta.
   Verify the desktop and phone table, card visibility, contrast, settings persistence, and loading of assets.
3. Map networking contracts and saved state before adapting discovery, relay selection, diagnostics, connection recovery, election, replication, and seat management.
   Assess untrusted messages, relay inputs, keys, and data sinks before changing the trust boundary.
   Verify malformed messages, authorization, reconnects, elections, mixed relay failures, and saved-table compatibility.
4. Adapt call management, device selection, media recovery, and network status to the revised transport.
   Verify permission denial, device changes, audio and video recovery, and privacy of diagnostics.
5. Adapt remaining shared interface features, translations, documentation, and build or deployment improvements.
   Review each Bridge-specific interaction for an equivalent Canasta use instead of copying it unchanged.
6. Integrate and exercise complete games with human and bot seats.
   Check the OpenRouter bot with the existing `.env` configuration without exposing the key, and keep the bot interface suitable for a later MCTS implementation.
   Run the full project checks, representative multi-browser and phone scenarios, and the applicable security review.

Each stage starts with a behavior check that fails before a change and passes after it where practical.
Keep changes reversible and commit verified increments.
Record any incompatible saved-state or protocol change and its migration and recovery path before adoption.
The inventory and the full integration checks determine completion; this plan alone does not establish parity.
