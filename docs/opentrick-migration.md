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

## Task list

The list groups related reference changes into deliverable features.
Each unchecked item requires comparison with the reference, adaptation, and behavioral verification.
Record features already present and their evidence before closing their item.

### Table and reliability

- [x] Bound concurrent outbox writes and release capacity after failures (`34060ff`; outbox concurrency tests).
- [ ] Adapt persisted writes, shutdown, retry, synchronization, replication and their race fixes.
- [ ] Adapt host election priority, fresh authority reports, handover and table merge behavior (`27b1c36`, `9f5fa9d`).
- [ ] Adapt delayed seeding, seeding expiry and reusable links without overwriting active tables (`1289053`, `0d53e52`, `8a9e355`).
- [ ] Adapt seat claims, remembered seats, stale tabs, replacement and reconnect behavior.
- [ ] Adapt table expiry and restart from reusable links (`2ab19d1`, `11444c8`).
- [ ] Adapt bot-seat persistence, host recovery, player absence and the conditions for starting or continuing play.
- [ ] Verify storage compatibility, limits, malformed input, stale authority, split tables and recovery using simulations and browser tests.

### Discovery and network diagnostics

- [ ] Adapt tracker scheduling, offer handling, retries and stale socket replacement (`718b51a`, `9d602e0`, `daa8f00`).
- [ ] Add Nostr discovery and MQTT discovery to the combined transport, preserving one peer connection per pair (`63370e8`, `05577a9`).
- [x] Add MQTT discovery alongside trackers and test a four-player game using MQTT alone.
- [x] Replace relay sockets on network changes and long suspension, and retry discovery after a relay opens.
- [ ] Obtain specialist review of the Nostr event-signing key lifecycle before enabling Nostr discovery.
- [ ] Adapt relay configuration, defaults, disabling, backoff, silent-relay checks and reconnection after network changes or resume.
- [ ] Adapt STUN probes and in-page WebRTC checks with privacy-preserving reporting (`5c53d63`).
- [ ] Adapt round trips, peer-quality measurements, network bars, connection summary and host quality matrix.
- [ ] Adapt diagnostics, page reports, debug export and controlled player reloads.
- [ ] Verify hostile or silent relays, invalid input, configured endpoints, relay isolation, reconnection and privacy.

### Calls

- [ ] Adapt call invitation and presence, peer lifecycle, disconnects and recovery after host or player reload.
- [ ] Adapt microphone and camera selection, preview cancellation, device changes, permissions and no-camera behavior.
- [ ] Adapt self-view, mirroring, voice indicator, call controls and mobile call layout.
- [ ] Adapt call policy for absent players, solo play and bot-controlled seats without changing Canasta seat ownership.
- [ ] Verify call security, consent, media shutdown and recovery across browsers.

### Community, entry and players

- [ ] Adapt community discovery, formation, durable merge votes, matchmaking, bot cover and seat replacement (`1217410`, `16d9850`).
- [ ] Adapt bookmarkable entry pages, shared and personal links, single-player setup and solo controls.
- [ ] Adapt player profiles, editable names, compass seating, seat grids and persistence.
- [ ] Adapt title, host and bot indicators, turn notifications, wake lock and build identification.
- [x] Keep active pages awake when supported, including reacquisition after visibility changes.
- [ ] Verify direct links, reloads, cross-device seat choice, name validation and community recovery.

### Appearance and interaction

- [x] Add the default board texture (`f391f1e`; browser image-load test).
- [x] Add persistent board and card texture levels, and apply them to Canasta cards and melds.
- [ ] Adapt persisted settings and immediate application, including accessible desktop and phone controls.
- [ ] Adapt theme palettes, automatic light and dark appearance, first-paint theme and suit-color schemes.
- [ ] Adapt adjustable board, card and panel textures, card marks, font sizes, turn markers and shadows.
- [ ] Adapt desktop hand sizing, side cards, player tiles, board labels and game result placement to Canasta.
- [ ] Adapt phone board geometry, visible hands, card readability, controls, dialogs and result placement.
- [ ] Adapt translations for every new shared control and verify coverage and color contrast.

### Bot, distribution and release

- [ ] Preserve OpenRouter key handling, model selection, bot prompts, decision and fallback behavior while adapting host controls and pacing.
- [ ] Compare applicable OpenRouter key and balance checks with the retained bot implementation and adapt them without exposing credentials.
- [ ] Adapt bot CLI lifecycle, recovery, clean shutdown, host takeover and end-to-end test fixtures.
- [ ] Keep a clear decision interface for a later Canasta MCTS engine; do not replace the current engine.
- [ ] Review build configuration, licensing, deployment, documentation and relevant reference tests.
- [ ] Run full regression checks, desktop and phone game flows, offline and mixed-relay recovery, call scenarios and an OpenRouter-backed game where access is available.
- [ ] Review every reference commit and source difference for omissions, record exclusions and complete the security and release review.

Bridge auctions, contracts, trick play, bidding guides, and Bridge-specific engines do not apply directly to Canasta.
Their shared usability or reliability mechanisms remain in the tasks above.
