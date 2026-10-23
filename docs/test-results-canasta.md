# Test results: canasta

Date: 2026-10-23.
This file records the tests of classic four-player partnership canasta on the peer-to-peer table.
The tests cover the rules engine, the table screen, the bots, the seats, the election, the chat and the call.

## Environment

| Item | Value |
| --- | --- |
| OS | Linux 7.2.11 (liquorix, amd64), one machine |
| Browser | Google Chrome 156.0.8078.47, headless, through the Playwright `chrome` channel |
| Test tools | Playwright 1.64.1 (one worker, no retries, traces off), Vitest 5.0.5, Node.js 22.22.1, TypeScript 7.0.2 |
| Site | Production build (`vite build`, Vite 8.3.4), served by `vite preview` on `http://localhost:4173`; the test harness page on `http://localhost:4174` |
| Discovery | `@trystero-p2p/core` 0.26.0 with a copy of its torrent strategy (`src/p2p/torrent.ts`): 3 offers in each table-room announce, and the event `stopped` when a page leaves a room; the three default public WebTorrent trackers: `wss://tracker.openwebtorrent.com`, `wss://tracker.webtorrent.dev` and `wss://open.ftorrent.com` |
| STUN | The default `stun:stun.cloudflare.com:3478`; no TURN |
| Call media | Chrome's generated test devices (`--use-fake-device-for-media-stream`) |
| Bot model | OpenRouter, `inception/mercury-3`, with the key from `.env` (live runs only) |

Each simulated person has a separate browser context, with its own IndexedDB, localStorage and holder.
The browser tests use the public trackers and real WebRTC links, and no fake network.
The `host-bots` spec is the one exception: a Playwright route answers the OpenRouter requests, so that spec spends no money.

## Browser suites

| Spec | Tests | What it checks |
| --- | --- | --- |
| `smoke` | 1 | One browser with four tabs: create, three seats from one link, ordered messages, the first deal |
| `bookmark` | 5 | The own-seat link (`selected_player`), the stored bookmark, and a link of another table |
| `auto-seat` | 2 | A page that has one seat on offer takes it without the picker |
| `p2p-mesh` | 12 | The full mesh, seats and replicated commands; host loss; a network change; failing first links; a latecomer; presence; call signaling only from bound seats; the call status after a reload; a wrong key; the receive cap; sibling tabs; a failed claim |
| `acceptance` | 13 | One link; the lobby offers only free seats; ordered messages; a reload; held and active seats; release of a silent seat; a reopened link; a host crash with a waiting message; all four browsers reopen; a lost result is stored once; a second game |
| `seat-timeout` | 3 | A frozen player and a frozen host show offline, their seats free after the timeout, and the thawed tabs are superseded |
| `election` | 8 | The host button and the witness rule, the automatic volunteer, simultaneous clicks, a reloading host, a thawed old host, a sibling tab |
| `resilience` | 6 | A tracker outage during play; a browser that blocks site data; old, foreign and damaged links; expiry after 24 h |
| `reconnect` | 8 | Crashes, reloads and absences with canasta turns: crash and reload of a follower, a turn that waits for an absent player, a host crash mid-hand, a crash after a draw, three players away, a frozen player |
| `host-bots` | 7 | Four host bots play a full hand and the host deals the next one; paused bots stay paused after a reload; a bot switch on the seat whose turn it is acts at once and keeps that person's call; a key entered on the create screen without bot seats is kept; a key changed in the table's key dialog reaches the running bots and is kept; a new key is tested with one model request on the create screen and in the key dialog: a 401 refuses it, another failure stores it and asks for a second click, Cancel during the test discards the key, and an empty key in the dialog pauses the bots |
| `call-audio` | 15 | Joining, the switches, Leave, cut links, the keyboard, reloads, four seats, a late microphone, rapid toggles, a vanished tab |
| `call-video` | 9 | The camera chooser, the tile states, a blocked camera, video only where both sides agree, a phone next to camera senders, a desktop that becomes compact |
| `call-no-camera` | 1 | A Chrome with a microphone and no camera device joins the call: Send camera is off with its reason, and audio arrives both ways |
| `call-lifecycle` | 9 | Forged call frames, a holder change, one player leaves, leaving the table, a relay-only browser, no address in any page |
| `call-recovery` | 5 | After a crash, a host change and a lost microphone permission, the call comes back with the same status |
| `layout` | 3 | The player-relative desktop table; the phone layout without sideways scroll, with the felt above the status, the scores, the dock and the controls, and seats without video tiles; the names of the call controls |

### Runs

| Run | Scope | Result |
| --- | --- | --- |
| Single specs | Each spec alone, after the fixes listed below | Every spec passed in its last run |
| full | `npx playwright test`, all 15 specs in one run, at commit `5a2803b` | 102 of 102 passed in 20.8 minutes; no retry, no flaky test |
| `call-no-camera` | The spec added after the full run, alone, with `--repeat-each=3` | 3 of 3 passed, 7 s each |
| `host-bots` | The spec alone, after the key test was added | 7 of 7 passed in 54 s; tests 6 and 7 with `--repeat-each=3`: 6 of 6 passed; test 1 with `--repeat-each=5`: 5 of 5 passed |
| Phone layout | `layout` alone, then `call-video`, `call-audio` and `host-bots` together, after the phone layout change | 3 of 3 passed in 20 s; 31 of 31 passed in 3.9 minutes |

The full run above does not include `call-no-camera` or `host-bots` tests 4 to 7.
With the create screen and the key dialog of commit `cc5b5a1`, `host-bots` tests 6 and 7 failed, as they must.
Without the check for a closed dialog after the key test, the Cancel step of test 7 failed, because the cancelled key was stored.
In one earlier run of the spec with the same bot code, `host-bots` test 1 failed: after 200 s the table had not reached hand 2.
Its screenshot was deleted before it was examined, so the cause is not known; the 6 runs of test 1 after it passed in 12 s to 14 s.
Two temporary changes to the code made `call-no-camera` fail, as it must, and were then removed.
With Send camera enabled although no camera exists, the test failed at the disabled switch.
With a microphone request that also asks for a camera, the microphone failed and the test failed at the microphone state.

An earlier full run of the same code was stopped at test 79 because of a network fault on the test machine.
In that run, 4 `election` tests failed, and in each failure the pages reached 0 of 3 trackers; the next tests passed.
The run above was made after the fault ended.

Before the fixes, single-spec runs failed in `acceptance` (tests 6 and 7), `seat-timeout` (tests 1 and 2), `reconnect` (tests 2, 3 and 6), `p2p-mesh` (test 1) and `host-bots` (test 1).
The causes are in the two lists below: two were defects in the code, and the others were tests that did not match the current design.
The full run is one run, so it does not measure how often a test fails by chance.

## Engine and unit tests

`npx vitest run --project unit`: 1223 of 1223 tests passed in 45 files.
`npx vitest run` with the browser projects (headless Chrome, Vitest browser mode): `browser` 137 of 137 tests in 8 files, `browser-touch` and `browser-no-camera` 5 of 5 tests in 2 files.
All projects together: 1365 of 1365 tests in 55 files.

The engine tests (`tests/unit/canasta-engine.test.ts`) check the classic partnership rules as Pagat states them ([ADR 0007](adr/0007-canasta-engine-written-here.md)).
They cover the deal, the draw of one card, the frozen pile, the initial meld minimum by score, the pile take with a natural pair, red and black threes, going out with permission and concealed, and the scoring.
The random-play test plays 100 hands with seeds 1 to 100 and random legal actions.
In every hand, after every action, all 108 cards are accounted for; every listed action is accepted; and every hand reaches an end within 5000 actions.
The owner set 100 hands as enough for this test.

## Live bot runs

Each run used the production build, served under a sub-path as on the real site, on the public trackers, with `inception/mercury-3` and the `.env` key.
North was the hosting browser with autoplay, East and West were the host page's bot seats, and South was the bot CLI (`npm run bot`) in a separate process.
The owner set one game as enough for the bot test; each run played one full hand, from the deal to the hand score.

| Run | Duration | South's CLI actions | Hand score | Spend (host page counter) | Spend (key usage change) |
| --- | --- | --- | --- | --- | --- |
| 1 | 187 s | 40 | N-S 1775, E-W 390 | $0.01461 | $0.019746 |
| 2 | about 100 s | 17 | N-S 1045, E-W 235 | $0.00855 | $0.009240 |

The host page counter sums the costs that OpenRouter reports for the answers to the host page's three bots.
The key usage change is the change of the key's usage figure from before to after the run, so it also includes South's CLI requests; this is the probable reason that it is higher.
The CLI fetched the prompt template from the sub-path (`/open_canasta/bot-prompts/turn.txt`, status 200).
The run logs show no refused command and no page error other than two 404 responses for a missing file at the page load.

## Defects found by these tests

| Defect | Evidence and fix |
| --- | --- |
| After a reload that kept the seat, the other call pages kept the old link to the reloaded page, so the call showed a failed connection to that seat | `p2p-mesh` test 8 and `call-recovery`; the call mesh now forgets a returned peer that does not answer the greeting within 10 s (`src/call/mesh.ts`), with two unit tests in `tests/unit/call-mesh.test.ts` |
| With Send camera turned on before Join, the controller refused the confirmed preview track, so Join did nothing | `call-video` test 2; `prepareVideo` refuses only inside the call (`src/call/call.ts`), with a unit test in `tests/unit/call-controller.test.ts` |
| Unused texts stayed in the catalogs, and 33 canasta texts had no translation | A scan of the `t()` keys; the unused texts were removed, and `src/i18n-canasta.ts` translates the canasta texts in all eight languages |
| The table rebuilt every action button, and the autoplay buttons in the seat labels, on each render, so a tap during a render could be lost | `tests/browser/table-section.test.ts`; the buttons are kept between renders |
| The create screen stored the OpenRouter key only when a seat was a bot, so a key entered for later autoplay was lost, and the table asked for it again | Reported by the owner, and shown by a probe in Chrome; `host-bots` test 4. Create now stores the field whenever it differs from the stored key (`src/ui/create.ts`) |
| The bot label for taking the pile onto a meld with no hand card read "with ," | `tests/unit/canasta-text.test.ts` |
| In a 1280×720 window, the action bar under the own hand ended at y = 836, below the window | `layout` test 1; a more compact table (`src/ui/style.css`, `src/ui/table.ts`) |
| A bot could undo its turn ("Reset turn") and play the same moves again without end; in `host-bots` test 1 the host page sent about 12,500 model requests in 3 minutes and the hand did not end | With option 0 on every turn, 66 of 100 random hands looped. The bots are now offered only actions after which the turn can still end, with a 4-step lookahead (`botActions` in `src/bot/heuristic.ts`), and "Reset turn" only at a dead end. Three unit tests in `tests/unit/bot-turn.test.ts`: option 0 and random options over seeds 1 to 40 end every hand with no reset. A live model could also have looped and spent money |
| A new browser that chose the configured host seat (from the shared link's setup) while a live host's lobby offered it started a second table with itself as host; the live host then answered it "superseded" | `seat-timeout` test 2, with temporary logs: the host refused the newcomer's greeting because the newcomer's table had another holder at the same generation. A page that has a host's lobby now claims the seat from that host and seeds no table (`choose` in `src/p2p/table.ts`, amendment of [ADR 0005](adr/0005-reusable-table-link-bootstrap.md)). |
| A newcomer sometimes did not connect for minutes, although three live pages were in the table room | `seat-timeout` test 2, with the tracker frames: the trackers give each offer to one peer at fixed places in their join-order list, and Trystero sends one offer in each announce. All 30 offers of the newcomer went to a frozen tab and a tab that had left the room. The table room now sends 3 offers in each announce, and a page that leaves a room tells the trackers with the event `stopped` (`src/p2p/torrent.ts`, amendment of [ADR 0004](adr/0004-p2p-table-elected-host.md)), with three unit tests in `tests/unit/p2p-torrent.test.ts`. With 3 offers, the test passed 9 of 9 times |

Two changes were design decisions, not defects: the right sidebar was removed at the owner's request, and its contents moved into one collapsible drawer; a turn marker shows the seat whose turn it is.
At the owner's request, a new OpenRouter key is now tested with one model request before it is stored (`checkHostApiKey` in `src/bot/browser-openrouter.ts`, 8 unit tests in `tests/unit/host-key-check.test.ts`).
Two probes of the production build against the real OpenRouter, with no route stub, checked the two main results.
An invalid dummy key got HTTP 401, which the page could read; the create screen refused the key and did not store it.
The `.env` key got HTTP 200 from `inception/mercury-3`; the table opened after 851 ms, and the key was stored.
At the owner's request, the phone layout puts the felt at the top, and a compact device shows the seats without video tiles, because it has no video (`src/ui/style.css`, `table.setForm` in `src/ui/table-screen.ts`).
Before the change, `layout` test 2 failed at both new checks: the status was above the felt, and the tile of East was visible.

## Test corrections and acceptance changes

The e2e specs play canasta turns: a draw from the stock, then a discard.
The corrections below change what a test expects; each is recorded with the reason.

- `reconnect` tests 2 and 3, and `p2p-mesh` test 1: after a crash, the player now reopens the shared link instead of the own-seat link.
  The host refuses a second active peer on a seat (unit tests "does not let a second active peer take over a named seat" and "does not bind a second active peer to the same seat generation" in `tests/unit/p2p-host-engine.test.ts`).
  Right after a crash, the host still counts the crashed page as connected, so the own-seat link shows "superseded".
  With the shared link, the lobby offers the seat again after the seat grace, and the page takes it because it is the only seat on offer.
  The owner asked to keep this reopen path.
- `p2p-mesh` test 8: after a reload, the own-seat link binds the seat again at the same seat generation, so the test now expects the same generation instead of a higher one.
  The call still comes back, which is what the test protects.
- `layout` test 3: outside the call, the switches choose what Join starts with, so a switch that is on is turned off for the check; on a phone the video switches are shown but disabled.
- `layout`: the spec checks the own hand and the action bar; it has 3 tests instead of 4.
- Every spec that types a message opens the drawer first, because the messages are in the collapsible drawer.
- `resilience`: the damaged-key case searches for the key from the fragment, because a query name can also end in "k=" (`bot_fallback=`).
- `acceptance` tests 6 and 7, and `reconnect` test 6 (three players crash, the host among them): a player who closed the table while no host was reachable reopens with their own URL, not the shared link.
  Since [ADR 0005](adr/0005-reusable-table-link-bootstrap.md), the shared link opens the seat picker, and with no host lobby it offers all four seats, so it cannot restore a seat; the own URL names the seat.
- `seat-timeout` test 1 expected a seat to stay held for SEAT_HOLD_MS (3 minutes), but the host frees an offline seat after SEAT_GRACE_MS (15 s).
  The test now checks that the seat is not offered within about 8 s of the silence and is offered after the seat grace; the superseded check on the thawed tab is unchanged.
- `reconnect`: the check that no tab offers a move counts the move buttons (`[data-action]`).
  The ported selector `[data-testid^="action-"]` also matched the action bar and the action note, so it counted 2 on every tab.
- `reconnect`: a sender now waits until its transcript shows the earlier messages, then expects the whole list with its new message.
  The old check counted the sender's lines before it typed, so it failed when the earlier messages reached the sender after the count.
- `reconnect`: after the draw, the test expects the first-meld prompt, because nobody has melded in that match.
  The old expectation was the prompt that shows only after a side's first meld.
- `election`: before a test closes the host, each seated page waits until its send note is empty, which shows that the page is bound to its seat and in sync.
  The host row can show before the host's seat binding reaches a page, and a page without that binding cannot become the host.
  Without the wait, 3 of 6 and 4 of 6 runs of the affected test failed with "Only a seated player can become the host"; with it, the spec passed 24 of 24 tests in 3 runs.
- `seat-timeout` test 2 waits HOST_LOST_MS plus 10 s for the "waiting for the host" message, because the other players see a frozen host as unreachable only after their last reports of it are HOST_LOST_MS old.

## Limits of this evidence

- All browsers run on one machine, so STUN and NAT traversal are not exercised.
- Only headless Chrome on Linux was tested; the compact layout is tested with phone-size viewports, not on a real phone.
- A frozen page is simulated with a debugger pause.
- The public trackers are third-party services, so every run depends on them.
- The live bot runs are two hands with one cheap model; they show that the prompt, the indexed choices and the spend counter work, not that the bots play well.
- The `host-bots` spec answers every request with option 0, so it tests the bot plumbing, not the model.
- The key test was checked against the real OpenRouter only on the create screen, and only for a 401 and a 200; the other failures are stubbed.
- The replicated state holds every hand and the stock (ADR 0004), so hidden information depends on the players' honesty; no test checks it.
- A crashed tab that reopens its own-seat link is shown "superseded" until the host sees the old page offline; "Try seat again" or the shared link takes the seat back.
- Each run used one worker on a shared machine; the durations are not performance measurements.
