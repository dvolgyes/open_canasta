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
- [x] Prefer the closest clockwise seat among equal replicas when both setup links name the same host seat.
  Beats validate the optional host seat, but a participant with the table key can still misreport its preference and affect a tie.
  The table owner controls who receives that key.
- [x] Relay a fresh host report as soon as a direct host beat arrives.
- [x] Hand the host role back to a synchronized seat closer to the setup link's host seat.
- [x] Resolve divergent tables with the same setup preference by entry count, then seat priority.
  Synchronization replaces the losing branch, so actions unique to that branch are lost and the current storage has no branch recovery.
  A participant with the table key can report a false position, so the table owner controls distribution of that key.
- [ ] Adapt delayed seeding, seeding expiry and reusable links without overwriting active tables (`1289053`, `0d53e52`, `8a9e355`).
- [x] Delay host-seat seeding while peers report an existing table, and verify recovery by a new browser after the host leaves.
- [x] Let the first eligible seat in setup-link order seed an abandoned table and ignore stale host reports.
- [x] Prevent an old election from changing authority while its shared-link seed is written.
  A fresh direct host announcement received during the write is retained, while an expired or disconnected announcement is discarded.
- [ ] Adapt seat claims, remembered seats, stale tabs, replacement and reconnect behavior.
- [x] Retry a temporarily busy seat and permit reclaim of a free seat on the winning table.
- [x] Preserve connected peers when a failed claim creates a replacement replication.
  A simulated failed claim and a four-browser host-seat recovery verify that the new host sees existing players.
- [x] Let a holder reclaim a disconnected seat without waiting for the foreign-holder grace period.
  A host-local autoplay actor does not block the human owner from reconnecting, while another connected human peer still does.
- [ ] Adapt table expiry and restart from reusable links (`2ab19d1`, `11444c8`).
- [ ] Adapt bot-seat persistence, host recovery, player absence and the conditions for starting or continuing play.
- [x] Keep the host and its local bots present when a background tab's timers are throttled.
  Configured bot seats remain reserved before their local actors start, and visitors cannot claim those seats or the host seat during the pause.
- [x] Resume a saved solo host without relay readiness when every other stored seat belongs to a host-local bot.
  A human-owned seat using autoplay still requires network recovery, and the resumed authority must be stored before hosting.
  Three offline Chrome runs verified that OpenRouter bot play resumes after reload with a mocked endpoint.
- [ ] Verify storage compatibility, limits, malformed input, stale authority, split tables and recovery using simulations and browser tests.

### Discovery and network diagnostics

- [ ] Adapt tracker scheduling, offer handling, retries and stale socket replacement (`718b51a`, `9d602e0`, `daa8f00`).
- [x] Spread tracker announcements away from the reconnect schedule and retain timeout bounds after suspension.
- [ ] Add Nostr discovery and MQTT discovery to the combined transport, preserving one peer connection per pair (`63370e8`, `05577a9`).
- [x] Add MQTT discovery alongside trackers and test a four-player game using MQTT alone.
- [x] Replace relay sockets on network changes and long suspension, and retry discovery after a relay opens.
- [x] Replace silent tracker and MQTT sockets after their respective time limits.
- [ ] Obtain specialist review of the Nostr event-signing key lifecycle before enabling Nostr discovery.
- [ ] Adapt relay configuration, defaults, disabling, backoff, silent-relay checks and reconnection after network changes or resume.
- [ ] Adapt STUN probes and in-page WebRTC checks with privacy-preserving reporting (`5c53d63`).
- [x] Check a local WebRTC data channel and report candidate classes without addresses, including after network changes.
- [x] Probe configured STUN servers individually and report whether each answers.
- [ ] Adapt round trips, peer-quality measurements, network bars, connection summary and host quality matrix.
- [x] Measure ongoing peer round trips and show timeout bounds in the network panel.
- [x] Show a latency-based network quality indicator beside connected human players.
- [x] Show the host a directed round-trip matrix from bounded, current-seat peer reports.
  Measurements are participant-reported diagnostics and do not affect game authority.
- [ ] Adapt diagnostics, page reports, debug export and controlled player reloads.
- [ ] Verify hostile or silent relays, invalid input, configured endpoints, relay isolation, reconnection and privacy.

### Calls

- [ ] Adapt call invitation and presence, peer lifecycle, disconnects and recovery after host or player reload.
- [ ] Adapt microphone and camera selection, preview cancellation, device changes, permissions and no-camera behavior.
- [ ] Adapt self-view, mirroring, voice indicator, call controls and mobile call layout.
- [x] Allow a compact device to send a confirmed camera and preserve call switches through rotation.
- [x] Add the reference portrait and landscape form preferences with immediate preview and cancellation.
  A phone test confirms that changing the setting does not start media capture when the call is off.
- [x] Give a landscape phone or tablet a board with call controls beside it while retaining the compact call policy.
  Rotation during an active audio call keeps the existing capture, and a crosswise-joker regression checks board and action visibility at 844 by 390 pixels.
- [x] Show an optional voice indicator for received audio without video, and release its audio processing when the call or table ends.
  A two-browser call test checks sound activity, the appearance setting, cancellation, and the receive-audio switch.
- [ ] Adapt call policy for absent players, solo play and bot-controlled seats without changing Canasta seat ownership.
- [x] Disable calls without another connected seat and end a call after continuous absence while retaining calls for bot-controlled human seats.
  A separately connected CLI bot is still counted as a connected seat because the protocol does not identify it as a bot.
- [ ] Verify call security, consent, media shutdown and recovery across browsers.

### Community, entry and players

- [ ] Adapt community discovery, formation, durable merge votes, matchmaking, bot cover and seat replacement (`1217410`, `16d9850`).
- [x] Port and test community seating rules, bounded directory advertisements, route validation, and durable merge votes.
  These components are not connected to the Canasta user interface or transport yet.
  Community participants can choose their own public identifiers, so independent connections alone do not prove distinct people.
- [x] Add a separate, bounded community transport over the existing tracker and MQTT strategy.
  Local browser tests cover twelve discovery peers, private-channel continuity, and rejection of a different key.
- [x] Validate fixed community seat admissions and require the community capability before a host admits a client.
  Seat replacement and bot cover still need their own authorized state transitions.
- [x] Adapt the matchmaking session to carry the surviving host's Canasta rules and OpenRouter bot configuration.
  The session is covered by simulated formation and recovery tests and is not yet exposed in the interface.
- [ ] Authenticate individual community participants before exposing formation, durable voting, or recovery.
  The private room key is shared, and a room participant can claim another member's public identifier before that member connects.
  The session now requires separate vote messages, but the room transport does not establish which member controls each connection.
  Owner: project security reviewer.
  Resume when an authenticated identity and recovery design has passed the required security review; verify impersonation, reconnect, and crash recovery against real peers before enabling the interface.
- [ ] Adapt bookmarkable entry pages, shared and personal links, single-player setup and solo controls.
- [x] Reopen a browser's remembered seat from a shared link when the link has no explicit seat parameter.
  The existing tab lock prevents taking a seat held by another tab, and an explicit seat parameter retains priority.
- [ ] Adapt player profiles, editable names, compass seating, seat grids and persistence.
- [ ] Adapt title, host and bot indicators, turn notifications, wake lock and build identification.
- [x] Keep active pages awake when supported, including reacquisition after visibility changes.
- [x] Identify the host, bot-played seat and active turn in the browser tab title.
- [x] Show the build's base commit date and hash beside the language selector.
  The label identifies the base commit, so it does not identify uncommitted source changes.
- [ ] Verify direct links, reloads, cross-device seat choice, name validation and community recovery.

### Appearance and interaction

- [x] Add the default board texture (`f391f1e`; browser image-load test).
- [x] Add persistent board and card texture levels, and apply them to Canasta cards and melds.
- [x] Add the reference paper texture to desktop side panels with a persistent setting.
- [x] Add a persistent card shadow strength control with live preview and cancellation.
- [x] Add the reference rank and suit size choices and default, with a scrollable phone hand for enlarged text.
- [x] Mark the current seat, add a turn frame, and allow players to configure the frame, turn text, and network bars.
  Turn names meet 4.5:1 contrast in the light and dark palettes.
  On narrow phones with enlarged cards, the pile count shares the label row so a crosswise joker and top card fit below it.
- [x] Add the reference color palettes and persisted theme and light/dark selection, with page, card and button contrast checks.
- [x] Use the reference green and orange four-suit palette by default while keeping saved choices.
- [ ] Adapt persisted settings and immediate application, including accessible desktop and phone controls.
- [ ] Adapt theme palettes, automatic light and dark appearance, first-paint theme and suit-color schemes.
- [ ] Adapt adjustable board, card and panel textures, card marks, font sizes, turn markers and shadows.
- [ ] Adapt desktop hand sizing, side cards, player tiles, board labels and game result placement to Canasta.
- [ ] Adapt phone board geometry, visible hands, card readability, controls, dialogs and result placement.
- [ ] Adapt translations for every new shared control and verify coverage and color contrast.

### Bot, distribution and release

- [ ] Preserve OpenRouter key handling, model selection, bot prompts, decision and fallback behavior while adapting host controls and pacing.
- [x] Restart host-bot decisions after a reset or a return to an earlier position, and discard delayed decisions when the game changes.
  A rejected action from an obsolete position does not stop the runner.
- [x] Make the CLI bot approve a reset requested from its seat and take turns in a new match.
  A delayed decision is discarded when the position changes, including while the bot submits a reset vote.
  The CLI recovery tests use simulated table events and a simulated model, so they do not establish network recovery for a CLI process.
- [x] Include the match number in new human and bot actions so a host rejects an action queued before a reset when its hand and action counters recur.
  Hosts still accept actions without a match number for compatibility with older clients, so those clients retain the old stale-action risk.
  Older hosts ignore the additional field and do not enforce the new check.
- [ ] Compare applicable OpenRouter key and balance checks with the retained bot implementation and adapt them without exposing credentials.
- [x] Check new OpenRouter keys without a paid model request and retain the Canasta bot's model and fallback behavior.
  The [documented credits endpoint](https://openrouter.ai/docs/api/api-reference/credits/get-credits) says it requires a management key.
  The current test key reports that it is not a management key, but the endpoint returned HTTP 200; treat that access as optional because the published contract does not guarantee it.
  A successful key check does not establish model access or available account credit.
- [x] Show optional account credit at the start of a bot-played hand and distinguish a key limit from an account balance.
  A key change or host change invalidates outstanding reads; unavailable credit information does not block play.
- [ ] Adapt bot CLI lifecycle, recovery, clean shutdown, host takeover and end-to-end test fixtures.
- [ ] Keep a clear decision interface for a later Canasta MCTS engine; do not replace the current engine.
- [ ] Review build configuration, licensing, deployment, documentation and relevant reference tests.
- [ ] Run full regression checks, desktop and phone game flows, offline and mixed-relay recovery, call scenarios and an OpenRouter-backed game where access is available.
- [x] Exercise CLI bots using the OpenRouter key in `.env` through a live Canasta turn.
- [ ] Review every reference commit and source difference for omissions, record exclusions and complete the security and release review.

Bridge auctions, contracts, trick play, bidding guides, and Bridge-specific engines do not apply directly to Canasta.
Their shared usability or reliability mechanisms remain in the tasks above.
