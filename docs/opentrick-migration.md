# OpenTrick migration plan

The reference is OpenTrick commit `7af1a45`.
Inventory its changes and later accepted changes by feature before marking the migration complete.
Preserve the Canasta rules, variants, OpenRouter bot, and `.env` key handling.
Old bookmarks, saved formats and mixed-version clients do not need backward compatibility.
Bridge rules, bidding, and its bot are not substitutes for Canasta behavior.

## Stages

1. Catalog the reference commits and compare shared modules, assets, settings, documentation, and tests.
   Record each feature as adopted, adapted, or inapplicable, with its reason and verification.
   Check existing Canasta behavior and OpenTrick's recorded decisions before choosing shared interfaces.
2. Port independent visual assets and foundations, then adapt themes, color settings, textures, typography, responsive layout, and accessibility to Canasta.
   Verify the desktop and phone table, card visibility, contrast, settings persistence, and loading of assets.
3. Map networking contracts and saved state before adapting discovery, relay selection, diagnostics, connection recovery, election, replication, and seat management.
   Assess untrusted messages, relay inputs, keys, and data sinks before changing the trust boundary.
   Verify malformed messages, authorization, reconnects, elections and mixed relay failures.
4. Adapt call management, device selection, media recovery, and network status to the revised transport.
   Verify permission denial, device changes, audio and video recovery, and privacy of diagnostics.
5. Adapt remaining shared interface features, translations, documentation, and build or deployment improvements.
   Review each Bridge-specific interaction for an equivalent Canasta use instead of copying it unchanged.
6. Integrate and exercise complete games with human and bot seats.
   Check the OpenRouter bot with the existing `.env` configuration without exposing the key, and keep the bot interface suitable for a later MCTS implementation.
   Run the full project checks, representative multi-browser and phone scenarios, and the applicable security review.

Each stage starts with a behavior check that fails before a change and passes after it where practical.
Keep changes reversible and commit verified increments.
Record material protocol changes and their security boundaries before adoption.
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
  The current host must confirm the seat before a takeover on its log, and the claim write checks the current seat holder.
  Three repeated browser trials cover both a returning host that retains its seat and one whose seat another browser took.
- [x] Give a newly created host the same setup preference as a host reopened from its personal link.
  Three browser trials verify that a frozen original host resumes after a successor takes over.
- [x] Resolve divergent tables with the same setup preference by entry count, then seat priority.
  Synchronization replaces the losing branch, so actions unique to that branch are lost and the current storage has no branch recovery.
  A participant with the table key can report a false position, so the table owner controls distribution of that key.
- [ ] Adapt delayed seeding, seeding expiry and reusable links without overwriting active tables (`1289053`, `0d53e52`, `8a9e355`).
- [x] Delay host-seat seeding while peers report an existing table, and verify recovery by a new browser after the host leaves.
- [x] Let the first eligible seat in setup-link order seed an abandoned table and ignore stale host reports.
- [x] Keep setup-link seats unavailable until the host's lobby arrives or the hostless timeout allows recovery.
  The host's current bot and occupied seats take precedence over the link's older setup.
- [x] Prevent an old election from changing authority while its shared-link seed is written.
  A fresh direct host announcement received during the write is retained, while an expired or disconnected announcement is discarded.
- [ ] Adapt seat claims, remembered seats, stale tabs, replacement and reconnect behavior.
- [x] Return a device whose seat another device took to the seat picker with a clear notice.
  Its URL keeps it as a visitor after reload, even when only one seat is free.
  A same-browser tab replacement keeps the existing read-only screen and retry control.
  Three browser trials each covered a displaced player and a displaced former host.
- [x] Retry a temporarily busy seat and permit reclaim of a free seat on the winning table.
- [x] Preserve connected peers when a failed claim creates a replacement replication.
  A simulated failed claim and a four-browser host-seat recovery verify that the new host sees existing players.
- [x] Let a holder reclaim a disconnected seat without waiting for the foreign-holder grace period.
  A host-local autoplay actor does not block the human owner from reconnecting, while another connected human peer still does.
- [ ] Adapt table expiry and restart from reusable links (`2ab19d1`, `11444c8`).
- [x] Clear the current tab's remembered seat when its table expires, while retaining the existing 24-hour expiry policy.
- [x] Offer a restart from a complete setup link on an expired table.
  Three solo and three multiplayer browser trials started a fresh session, while a key-only expired link offered no restart.
- [ ] Adapt bot-seat persistence, host recovery, player absence and the conditions for starting or continuing play.
- [x] Keep the host and its local bots present when a background tab's timers are throttled.
  Configured bot seats remain reserved before their local actors start, and visitors cannot claim those seats or the host seat during the pause.
- [x] Resume a saved solo host without relay readiness when every other stored seat belongs to a host-local bot.
  A human-owned seat using autoplay still requires network recovery, and the resumed authority must be stored before hosting.
  Three offline Chrome runs verified that OpenRouter bot play resumes after reload with a mocked endpoint.
- [x] Preserve which players requested autoplay across a host reload, and let those players stop it afterward.
  The roster accepts only unique autoplay seats that are also bot seats.
  Three two-browser runs verified that the player's microphone remains on through host reload and after stopping autoplay.
- [x] Distinguish a player's own autoplay stop from a later host stop when roster and request responses arrive separately.
  Three two-browser trials verified both messages after a host reload while the call remained active.
- [x] Ask for confirmation before a host or player enables autoplay for their own seat.
  Cancellation sends no request, confirmation checks the current seat and control state, and stopping remains immediate.
- [ ] Verify storage integrity, limits, malformed input, stale authority, split tables and recovery using simulations and browser tests.

### Discovery and network diagnostics

- [ ] Adapt tracker scheduling, offer handling, retries and stale socket replacement (`718b51a`, `9d602e0`, `daa8f00`).
- [x] Spread tracker announcements away from the reconnect schedule and retain timeout bounds after suspension.
- [x] Allow one immediate rejoin within a minute of a network change or return to the page, even if the last peer disconnects after that event.
  Simulated network changes verify the immediate rejoin, its single-use limit, and normal backoff when the window expires.
- [x] Verify tracker recovery after initial offers are withheld while MQTT is unavailable.
  Three browser trials reconnect after the injected delay without relaxing the delay assertion.
- [ ] Add Nostr discovery and MQTT discovery to the combined transport, preserving one peer connection per pair (`63370e8`, `05577a9`).
- [x] Add MQTT discovery alongside trackers and test a four-player game using MQTT alone.
- [x] Reject malformed tracker and STUN settings without repeating their values in errors.
  Unit checks cover credential and query values, and the README states that build-time `VITE_` settings are public.
- [x] Keep tracker diagnostics bounded and omit tracker-supplied warning and failure text.
  A browser test sends multiline, oversized tracker messages and checks the console output.
  A hostile tracker can still send repeated messages and cause repeated warnings.
- [x] Replace relay sockets on network changes and long suspension, and retry discovery after a relay opens.
- [x] Replace apparently open relay sockets after a shorter hidden period if the page's timers were suspended.
  A simulated clock verifies both the normal short-pause path and replacement of tracker and MQTT sockets after a late tick.
- [x] Replace silent tracker and MQTT sockets after their respective time limits.
- [x] Offer optional frequent checks that close and repair a silent peer link while the page is visible and online.
  Timers restart after a pause or when checks become active, and diagnostics export only a close count.
  A false timeout can temporarily partition the table and risk actions on the losing branch.
- [ ] Obtain specialist review of the Nostr event-signing key lifecycle before enabling Nostr discovery.
  The [review brief](discovery-security-review.md) records the reference implementation, trust boundaries and required checks.
- [ ] Adapt relay configuration, defaults, disabling, backoff, silent-relay checks and reconnection after network changes or resume.
- [x] Adapt STUN probes and in-page WebRTC checks with privacy-preserving reporting (`5c53d63`).
- [x] Check a local WebRTC data channel and report candidate classes without addresses, including after network changes.
- [x] Report a refused diagnostic data channel and close its connections, while propagating unexpected errors.
  Simulated failure checks cover both probes, and real-browser checks verify the successful STUN and local data-channel paths.
  Three seat-picker browser trials verified a successful check and candidate labels that contain no addresses.
- [x] Probe configured STUN servers individually and report whether each answers.
- [x] Open the Network panel on the seat picker while keeping it closed by default at the table.
- [x] Adapt round trips, peer-quality measurements, network bars, connection summary and host quality matrix.
- [x] Measure ongoing peer round trips and show timeout bounds in the network panel.
- [x] Apply the round-trip timeout when a late echo arrives after browser suspension (`2f8d155`).
  Unit checks cover echoes before and after the deadline without a timer tick.
- [x] Show a privacy-preserving connection summary in the seat picker and waiting banners.
  It reports relay counts, WebRTC status, direct connections and whether a public address was found, without showing addresses or peer identifiers.
  Relay counts follow the selected language.
- [x] Show a latency-based network quality indicator beside connected human players.
- [x] Show the host a directed round-trip matrix from bounded, current-seat peer reports.
  Measurements are participant-reported diagnostics and do not affect game authority.
- [x] Verify directed quality measurements through delay, packet loss and reload.
  Three four-browser trials confirmed that delayed pings affect only the sender's row, dropped pings show a timeout, and measurements recover after reload.
- [x] Verify that host-local bots have no network indicators or matrix measurements before and after reload.
  Three solo-browser trials used a mocked OpenRouter endpoint.
- [x] Adapt diagnostics, page reports, debug export and controlled player reloads.
  Diagnostics cover the enabled tracker and MQTT transports; Nostr remains blocked on review.
- [x] Let the host copy a network diagnostic report with connection counts, round trips and bounded build reports.
  The export excludes table keys, API keys, addresses, peer identifiers, player names, cards and messages.
  Peer build values are untrusted reports and do not trigger actions.
- [x] Include connected players' coarse form, layout and viewport dimensions in host diagnostics.
  Dimensions are rounded to 100 pixels and bounded before transmission.
  Reports use the current host authority and seat generation, expire with the quality report, and contain no card identities or browser fingerprint strings.
  A holder of the shared table key may still report false diagnostic values or compete for a seat.
  Two-browser tests cover resize and disconnect, and wire tests reject invalid dimensions and stale bindings.
- [x] Let the host request a reload from compatible connected players.
  A guest accepts only its current host peer, authority and seat generation, then drains pending writes before reloading.
  A per-tab cooldown limits repeat requests across reloads, and a tab without usable session storage declines the automatic reload.
  A participant with the table key may still compete for host authority and request a reload after taking that role.
  The table owner controls who receives the key.
  Unit tests reject foreign and stale requests, and a two-browser test verifies seat recovery.
- [x] Show the host each connected player's reported build on the reload control and mark differing commits.
  Build identifiers are bounded hexadecimal text, and both the identifier and date remain untrusted peer reports.
  A two-browser test checks the tooltip, the mismatch indicator and removal on disconnect.
- [ ] Verify hostile or silent relays, invalid input, configured endpoints, relay isolation, reconnection and privacy.
- [x] Adapt the reference signaling browser tests for trackers and MQTT.
  Local relay simulations cover either transport alone, both together, failed and silent sockets, duplicate links, network changes, resume, and a latecomer after retries.
  The tests do not exercise Nostr or establish the behavior of public relays.

### Calls

- [x] Remove the unused call-preset chooser output (`b755386`).
  The call panel uses individual media switches, and their controller and browser tests remain in place.
- [x] Invite a guest when the current host enters a call, with an explicit choice to join or decline.
  Invitation display does not start media capture, and a declined invitation stays closed until the host starts another call.
  The host's call presence is a current-holder report from the replicated table; a participant with the shared key can still compete for host authority.
  Desktop and phone invitation tests and the full audio and video browser suites pass, including interruption of both tracker and MQTT discovery.
- [x] Adapt call invitation and presence, peer lifecycle, disconnects and recovery after host or player reload.
  The call mesh matches the reference behavior, and current-protocol browser checks cover invitations, absence and host reload.
- [x] Verify call recovery after a player or host crashes, including election handover and restored media switches.
  The browser tests also check permission renewal, stale call frames, seat replacement and media shutdown on exit.
- [x] Verify that a guest-to-guest video stream continues while the host reloads.
  Three Chrome trials checked frame growth during reload and the same receiving track afterward with fake media and a local relay.
- [x] Adapt microphone capture, camera selection, preview cancellation, device changes, permissions and no-camera behavior.
  The reference uses the browser's default microphone and offers camera selection.
  Browser tests cover the camera selector, simulated device-list changes, track replacement, permission failures and preview cancellation.
- [x] Join with the other selected media when a player cancels the camera preview during Join.
  Canceling a camera switch during a call changes nothing, and closing the screen does not join a call.
  Browser tests cover denied camera access, cancellation and preview disposal.
- [x] Adapt self-view, mirroring, voice indicator, call controls and mobile call layout.
  Desktop and phone browser tests cover these controls, media state and orientation changes.
- [x] Show a local camera preview on desktop using the already authorized track.
  Hiding the preview leaves camera transmission active, and leaving the call or turning off the camera detaches the preview.
  A two-player browser test checks consent, local visibility and continued outgoing video.
- [x] Allow a compact device to send a confirmed camera and preserve call switches through rotation.
- [x] Add the reference portrait and landscape form preferences with immediate preview and cancellation.
  A phone test confirms that changing the setting does not start media capture when the call is off.
- [x] Give a landscape phone or tablet a board with call controls beside it while retaining the compact call policy.
  Rotation during an active audio call keeps the existing capture, and a crosswise-joker regression checks board and action visibility at 844 by 390 pixels.
- [x] Show an optional voice indicator for received audio without video, and release its audio processing when the call or table ends.
  A two-browser call test checks sound activity, the appearance setting, cancellation, and the receive-audio switch.
- [x] Adapt call policy for absent players, solo play and bot-controlled seats without changing Canasta seat ownership.
- [x] Disable calls without another connected human seat and end a call after continuous absence.
  A command-line bot reports automation in its hello, and the host associates that report with its current seat generation for call availability.
  The report is untrusted and does not authorize actions or change seat ownership.
  A live OpenRouter game with three command-line bots verified that the call stays unavailable while the bots play.
- [x] Dim the desktop and phone call controls when no other connected player seat is available.
  The indication clears when a player joins and returns after the call ends on absence.
- [x] End a player's call when the host assigns that seat to a bot, while preserving the call for player-requested autoplay.
  Current hosts must include both bot seats and player-requested autoplay seats in their roster.
  Incomplete rosters are rejected, and the peer hello version reflects the changed protocol.
  Browser checks cover call presence, both bot-seat policies and host recovery.
- [ ] Verify call security, consent, media shutdown and recovery across browsers.
- [x] Smoke-test table entry and call joining in Firefox with two browser sessions and fake media.
  A later two-session Firefox check observed inbound audio byte growth at both players with fake media.
  It does not establish physical speaker output.
  A camera check confirmed the preview and observed decoded video and increasing inbound bytes at the guest.
  Headless Firefox on this machine reported no fine pointer and used compact mode, so the check enabled the existing landscape desktop-view preference before receiving video.
  Firefox logged a script timeout when the browser closed an active table; a second run that left the call and table first did not reproduce the warning.
  Three later direct active-call shutdowns and one orderly shutdown did not reproduce the timeout.
  Each direct shutdown logged an InvalidStateError in Firefox's WebRTCChild actor, while the orderly shutdown did not.
  This observation does not establish the cause of the earlier timeout or the effect of that Firefox-internal error.
  The Chrome call suites cover media recovery and consent, but they do not resolve those Firefox observations.

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
- [x] Adapt bookmarkable entry pages, shared and personal links, single-player setup and solo controls.
- [x] Add a solo entry that starts South with three host-managed OpenRouter bots using the existing key, model and rule settings.
  A browser test covers the missing-key error and starts a hand with a mocked OpenRouter endpoint.
- [x] Keep the solo name label, field and start button on one row on a narrow phone.
  A browser test checks the row and horizontal overflow at 320 pixels in all nine languages.
- [x] Add bookmarkable solo and multiplayer setup pages with static build output for project subdirectories.
  Table fragments still take precedence on reload, and a solo game started from its entry page resumes after reload.
- [x] Open a clean multiplayer setup URL when leaving a table or choosing a new game.
  Browser tests cover exit from both multiplayer and solo tables.
- [x] Label the table action **New table** on desktop and phones, including its accessible name.
- [x] Offer native sharing on touch devices, with clipboard fallback on a failed share and no fallback after cancellation.
  Copied and shared links explicitly select no seat, so a recipient chooses even when only one seat is free.
  Browser checks cover the automatic creation copy, desktop copying, phone sharing, reload and a remembered seat.
- [x] Shorten the table-link fragment and keep the peer protocol version check in the hello message.
  Keep the current 32-byte key until an independent specialist reviews a change to the key length.
- [x] Use compact setup query fields for seats, the host, bot seats and the selected player.
  Keep Canasta rule and OpenRouter model configuration in the setup query.
- [x] Preserve the option for a host bot to play its own seat, including all-bot games used to test Canasta.
  The reference restriction that the host seat must be human does not apply to this project.
- [x] Ask the player before a shared link reclaims a seat remembered by this browser.
  A player's own link names its seat and can reopen it directly.
  New browser-wide seat records are no longer written, and existing records keep their 24-hour cleanup.
  The four-browser acceptance sequence verifies both shared-link confirmation and personal-link recovery after a lost message acknowledgement.
- [x] Return a personal link to the seat picker when another player has taken its seat.
  Another tab in the same browser still supersedes the page after the retry period.
- [x] Adapt player profiles, editable names, compass seating, seat grids and persistence.
- [x] Replace the creation and seat-picker tables with accessible compass seat grids, including phone layouts and explicit host selection.
- [x] Arrange the creation seats as a compass while preserving the existing names, host selection and bot controls.
- [x] Default a new table's creator to South, while keeping an explicit host in a bookmark.
- [x] Show all four seats on a compass in the picker and explain unavailable host, bot, taken and same-browser seats.
  Available seats remain selectable, and automatic selection respects an explicit no-seat link.
- [x] Keep phone compass cards readable and wrap network diagnostic values within the viewport.
  Entry-layout tests cover the creation form and seat picker at 320, 390 and 844 pixels.
- [x] Use the reference bot tile artwork above the seat caption while retaining each OpenRouter model's artwork.
  A browser test checks the caption boundary and that the model artwork loads.
- [x] Remove duplicate letters from player avatars and enlarge the tile captions.
  The caption retains the seat and player name, and its reserved height keeps the bot artwork clear.
- [x] Normalize and validate display names, retain a personal name locally, and support self-naming seats without using names for authorization.
- [x] Normalize new-table and bookmark names to NFC, reject control characters, and retain an explicitly edited creator name in the browser.
  Bookmarked names and generated defaults do not overwrite that personal preference.
  Table configuration parsing also rejects non-normalized names and control characters at storage and network boundaries.
- [x] Allow an empty non-host name at creation and ask the joining player for a name.
  The creator must enter a name.
- [x] Store profile changes and name revisions in the table log and replay them in snapshots.
- [x] Require player profiles in every newly stored table record and reconstruct them during synchronization.
  Records without profiles are rejected; older saved tables are outside the supported format.
  Unit checks cover creation, missing-profile rejection, log replay, host recovery and seeding.
  Browser checks cover IndexedDB writes, player naming, host handover and opening a bot seat.
- [x] Reject obsolete stored bot-model aliases and the old pre-variant classic-rules encoding.
  The former legacy-rules test now verifies rejection, as old saved formats are outside the requested compatibility scope.
  Current model IDs, CLI model classification and Canasta rule presets remain supported.
- [x] Use the current profile protocol without negotiating support for older clients.
  The peer hello version changes with this protocol, and name edits still validate seat generations and name revisions.
  Old clients are outside the supported deployment and election beats do not authenticate protocol versions.
- [x] Require a seat generation and profile revision in each claim and in every lobby seat.
  The host rejects a stale generation or revision before changing a seat.
  Protocol `p2p-v4` introduced this message format, and the current `p2p-v5` adds the automated-peer report.
  Eight browser flows covered seat selection, naming, host return and bot recovery; the live OpenRouter CLI check also passed.
  A holder of the shared table key can still claim any available seat.
- [x] Verify that compatible clients preserve names during a host handover in three browsers.
- [x] Add host name editing and player name entry with generation and revision checks, then verify reconnects, replacement, calls and bot seats.
  Three two-browser trials verified audio before and after renaming without another microphone capture.
- [x] Let a guest name a placeholder seat, remember a successfully claimed name, and show the name to the host and bot.
  Browser tests cover creation, direct and shared links, claim, replication, reload and the browser preference.
- [x] Add the host player-name editor, including stale-edit checks and the option to open a bot seat to a new player.
- [x] Let the desktop host open the player-name editor from a seat name or video caption with a mouse or keyboard.
  Guests and compact layouts do not expose the shortcut.
- [x] Recover from a name-required refusal when a link's saved bot setup is older than the host's current seat state.
  A two-browser test opens a bot seat and joins it as a named human.
- [x] Adapt title, host and bot indicators, turn notifications, wake lock and build identification.
- [x] Group host-only player, network and reload controls in a Host controls dialog while preserving guest reset requests.
  The dialog closes on host loss, before opening the player editor, and when requesting a reset.
- [x] Move upright-phone host player controls into that dialog without changing bot-seat or autoplay permissions.
  The host sees the connected players and can change a bot seat, while sideways layouts keep the table controls.
- [x] Keep active pages awake when supported, including reacquisition after visibility changes.
- [x] Retry a pending wake-lock request after the page becomes visible again, and release a grant received while hidden.
  Unit checks cover refusal, a late grant and a successful pending request without repeated acquisition.
- [x] Sound one hidden-page alert per Canasta turn, including turns that have several actions.
  Three four-browser trials verified an alert at the start, no extra alert after drawing and another alert on the next turn.
- [x] Name absent players with their seat letters in waiting prompts and host refusal messages.
  Unnamed seats use their translated compass direction, and display names do not authorize actions.
- [x] Identify the host, bot-played seat and active turn in the browser tab title.
- [x] Show the build's base commit date and hash beside the language selector.
  The label identifies the base commit, so it does not identify uncommitted source changes.
- [x] Provide a local Reload control that drains queued table work before navigating.
  A browser test verifies that the seat and saved messages return after reload.
- [x] Exchange bounded build dates on heartbeats and offer a player-controlled reload when a connected peer reports a newer date.
  A peer's date is untrusted and does not prove that an update exists.
  Unlike the reference, a peer report does not reload the page automatically, so fabricated dates cannot cause a reload loop.
  Browser tests cover report delivery, disconnect, and the requirement for a click.
- [ ] Verify direct links, reloads, cross-device seat choice, name validation and community recovery.

### Appearance and interaction

- [x] Add the default board texture (`f391f1e`; browser image-load test).
- [x] Add persistent board and card texture levels, and apply them to Canasta cards and melds.
- [x] Add the reference paper texture to desktop side panels with a persistent setting.
- [x] Add a persistent card shadow strength control with live preview and cancellation.
- [x] Keep appearance settings scrollable inside the screen, with Save and Cancel fixed below the content.
  Browser checks cover a 320-pixel phone and preserve preview, cancellation and saved settings.
- [x] Apply the reference card shadow to card backs and all selected and marked card states while retaining their indicators.
- [x] Apply the same shadow control to desktop player tiles, network meters, the call panel and its join button.
  Compact controls do not get those panel shadows.
- [x] Add the reference rank and suit size choices and default, with a scrollable phone hand for enlarged text.
- [x] Mark the current seat, add a turn frame, and allow players to configure the frame, turn text, and network bars.
  Turn names meet 4.5:1 contrast in the light and dark palettes.
  On narrow phones with enlarged cards, the pile count shares the label row so a crosswise joker and top card fit below it.
- [x] Show connection warnings and absent-player prompts in the reference alert colors.
  Ordinary turn prompts retain their normal colors, and alert text meets 4.5:1 contrast in each palette.
- [x] Show compact call, share, reload and new table icons on phones, with accessible names and the existing desktop call panel on larger layouts.
  The game actions appear once and fit on one row at 320 pixels in all nine languages.
  Phone Reload restores the seat and saved messages after draining queued work.
- [x] Match the desktop call panel to the player tile size, with media switches in the caption and call actions below it.
  The local preview remains independent of the video sent to other players, and the controls fit in all nine languages.
- [x] Place a phone hand result in the board between the other players and the viewer's hand.
  Browser geometry checks cover 320, 360 and 390 pixel widths, score-panel overflow and sideways behavior.
- [x] Add the reference color palettes and persisted theme and light/dark selection, with page, card and button contrast checks.
- [x] Apply theme sheet colors to the desktop call panel, table controls, scores and hand result.
  The score highlight and Join and Leave call actions meet 4.5:1 contrast in all eight palettes.
  The action colors mix the reference hue with the sheet text color because some reference hues fall below that contrast.
- [x] Use theme-aware error colors for setup, pending messages and rejected commands.
  Browser checks verify 4.5:1 contrast against their page and sheet surfaces in all eight palettes.
- [x] Use the reference green and orange four-suit palette by default while keeping saved choices.
- [x] Adapt persisted settings and immediate application, including accessible desktop and phone controls.
  Browser checks cover live preview, cancellation, saving and reload, including a 320-pixel phone.
- [x] Adapt theme palettes, automatic light and dark appearance, first-paint theme and suit-color schemes.
  Browser checks cover automatic system changes, explicit appearance, first-paint settings and contrast in every palette.
- [x] Adapt adjustable board, card and panel textures, card marks, font sizes, turn markers and shadows.
  The board settings and geometry tests exercise the controls and their effects on Canasta cards and panels.
- [x] Adapt desktop hand sizing, side cards, player tiles, board labels and game result placement to Canasta.
  Browser checks cover four viewer positions, hand fitting, side cards, labels and hand and match results.
- [x] Adapt phone board geometry, visible hands, card readability, controls, dialogs and result placement.
  Browser checks cover narrow and sideways layouts, enlarged card labels, settings actions and hand results.
- [ ] Adapt translations for every new shared control and verify coverage and color contrast.
- [x] Apply the selected palette to the camera preview dialog and its backdrop.
  Browser checks cover the dialog colors in all eight palettes and camera preview selection and cancellation.
- [x] Show the nine suit-color choices as labeled symbol previews with translated accessible descriptions.
  Browser checks compare each preview with its card colors across all palettes, and a phone flow verifies preview, cancellation, saving and reload.

### Bot, distribution and release

- [x] Preserve OpenRouter key handling, model selection, bot prompts, decision and fallback behavior while adapting host controls and pacing.
  Comparison with the initial Canasta commit found no changes to the heuristic, prompt text or offered turn choices.
  The turn runner localizes failure messages while retaining the heuristic fallback, and a live CLI game completed a model-backed turn without fallback.
- [x] Restart host-bot decisions after a reset or a return to an earlier position, and discard delayed decisions when the game changes.
  A rejected action from an obsolete position does not stop the runner.
- [x] Remember a host's bot pause per table in that browser, so an earlier personal link cannot restart the bots.
  Three mocked OpenRouter trials verified the earlier-link pause and explicit resume, and the existing reload and key recovery checks passed.
  If browser storage is unavailable, the pause lasts only until the page closes.
- [x] Verify that a paused host's bots remain paused when a guest takes over and the original host returns.
  Two repeated three-browser trials passed using local tracker signaling and a mocked OpenRouter endpoint.
- [x] Wait for all four seats before the first deal, then allow the acting player or bot to continue while another seat is away.
  The acting seat must still be present, and a temporary host wait retries the same bot decision without another model request.
  Actions accepted on a losing partition can be lost during table convergence.
  The four-browser peer test and the complete reconnect sequence verify play, host takeover, and recovery of missed actions.
- [x] Pace bot actions for readability, counting model time toward the minimum and cancelling stale timers.
  The host can save a local delay from one to sixty seconds in the model dialog, and CLI bots use the one-second default.
  Bridge bidding and auction pauses have no Canasta equivalent.
- [x] Make the CLI bot approve a reset requested from its seat and take turns in a new match.
  A delayed decision is discarded when the position changes, including while the bot submits a reset vote.
  The CLI recovery tests use simulated table events and a simulated model, so they do not establish network recovery for a CLI process.
- [x] Stop the CLI process after leaving its table on SIGTERM even if relay sockets remain open.
  The process-level test uses unreachable local relay endpoints and does not establish shutdown against live public relays.
- [x] Require the match number in human and bot actions so a host rejects an action queued before a reset when its hand and action counters recur.
  Old actions without a match number are rejected.
- [x] Compare applicable OpenRouter key and balance checks with the retained bot implementation and adapt them without exposing credentials.
  Browser checks cover key validation and balance labels, and diagnostic export checks exclude API keys.
- [x] Check new OpenRouter keys without a paid model request and retain the Canasta bot's model and fallback behavior.
  The [documented credits endpoint](https://openrouter.ai/docs/api/api-reference/credits/get-credits) says it requires a management key.
  The current test key reports that it is not a management key, but the endpoint returned HTTP 200; treat that access as optional because the published contract does not guarantee it.
  A successful key check does not establish model access or available account credit.
- [x] Allow players to reveal the OpenRouter key while editing it.
  The key is masked by default and is masked again when the table dialog closes.
- [x] Translate browser bot progress, slow-response and retry messages without changing model selection.
  Desktop and phone tests check visible Hungarian setup, gameplay, bot progress and settings, while catalog tests check all eight translations and their placeholders.
- [x] Translate bot failure and heuristic-fallback messages in the browser while retaining the CLI's English diagnostics.
  A mocked HTTP 503 table test verifies the localized fallback and continued play.
- [x] Complete a partial OpenRouter key prefix only when the remaining text has the reference's 64-character hexadecimal shape.
  Other credential shapes are left unchanged apart from trimming, and the CLI continues to read `.env` directly.
  The [OpenRouter key-creation example](https://openrouter.ai/docs/api/api-reference/api-keys/create-keys) uses that shape but does not promise that all future keys will use it.
- [x] Show optional account credit at the start of a bot-played hand and distinguish a key limit from an account balance.
  A key change or host change invalidates outstanding reads; unavailable credit information does not block play.
- [ ] Adapt bot CLI lifecycle, recovery, clean shutdown, host takeover and end-to-end test fixtures.
- [ ] Keep a clear decision interface for a later Canasta MCTS engine; do not replace the current engine.
  The current `TurnChooser` accepts a prompt and numbered, heuristic-filtered choices rather than a typed game view.
  `legalActions` also omits some valid larger melds, and `HandView` does not expose a turn-start snapshot for simulation of `resetTurn`.
  A later search interface needs an explicit player-visible state, a defined action-generation contract and validation of the returned action at the game boundary.
  The current OpenRouter prompt, ranking and fallback remain unchanged while that contract is unresolved.
- [ ] Review build configuration, licensing, deployment, documentation and relevant reference tests.
- [x] Distribute the Trystero adapter and MQTT.js license texts with the site and link their notices from the guide.
  The notices identify these components and do not claim to inventory every transitive dependency.
- [x] Update the player guide and screenshots for the current setup, table controls, calls, network settings and command-line bot.
  The screenshots use a local mock service and contain no real API key or table link.
- [ ] Run full regression checks, desktop and phone game flows, offline and mixed-relay recovery, call scenarios and an OpenRouter-backed game where access is available.
- [x] Run the full 196-case browser suite against the migrated implementation.
  The first run passed 183 cases, skipped the opt-in live case, failed three cases, and skipped nine later audio cases after one failure.
  The failed no-camera tooltip assertion expected the old labeled control, and the simultaneous-election helper captured an intermediate host before both pages converged on North.
  The audio test expected the call to remain joined for up to 120 seconds despite the adopted 15-second absence policy.
  The corrected audio sequence and no-camera case passed all 16 cases, and three simultaneous-election trials passed agreement, stability and message delivery.
  A separate live OpenRouter CLI run passed using the key in `.env`.
- [x] Repeat the full browser suite after those corrections.
  At commit `f60c66f`, 198 cases passed and the opt-in live case was skipped.
  Later profile and protocol changes passed separate storage, naming, call and live OpenRouter checks, but were not part of that full run.
- [ ] Resolve the intermittent host-seat recovery timeout observed in the later full browser run.
  The replacement page did not reach the expected table or retry state within 90 seconds, and the existing screenshots were taken after the other players closed.
  Six isolated trials against later code passed, so the cause remains unknown.
  The test now captures picker and player state before cleanup if the timeout recurs.
- [x] Exercise CLI bots using the OpenRouter key in `.env` through a live Canasta turn without a model fallback.
  The three CLI bots also exited with status 130 after SIGTERM.
  The live check also passed after the roster protocol change.
- [x] Provide a command for the opt-in live OpenRouter browser test and document its key and billing requirements.
- [ ] Review every reference commit and source difference for omissions, record exclusions and complete the security and release review.

Bridge auctions, contracts, trick play, bidding guides, and Bridge-specific engines do not apply directly to Canasta.
Their shared usability or reliability mechanisms remain in the tasks above.
