# Host-seat recovery investigation

The earlier full browser run failed while waiting for a replacement host-seat page to reach the table or a retry state.
The other player contexts had closed before screenshots were taken, so that failure did not identify its cause.
The built site came from `c9ab581`, while the development harness changed during that run.
Later stable-source trials passed, including the full browser run at `2160767`.

At `e57de2b`, a ten-trial production-build run passed nine cases and failed once during initial seating, before the replacement-host step.
The failure was a 45-second timeout in the shared `pick` helper while waiting for the requested seat title or an enabled seat button.
Screenshots taken after failure showed all four seats in a dealt game, but did not record the browser titles at the failure point.
The test used a local tracker fixture while the default MQTT brokers remained enabled.

A controlled browser probe removed the seat button between the helper's button-count and enabled-state queries, then set the expected title.
The original helper timed out at the same polling assertion because the enabled-state query waited on the removed locator.
The revised helper passed the same probe and continues to require the expected seat title.
This demonstrates a test-helper race that can explain the initial-seating failure, but does not prove the cause of that failure or of the earlier replacement-host timeout.
The replacement-host wait also counted locators before reading their state, so a disappearing retry button or table could block that poll in the same way.
The revised wait reads the relevant table and seat state together and still requires every player to reach the recovered position.
The browser regression checks automatic seating when the picker disappears between locator operations.
Three full local-signaling recovery flows passed after the helper fix, three more after the recovery-wait change, and one after the duplicate-view checks.
These flows used the local tracker fixture with MQTT and STUN disabled, so they do not establish behavior through public relays.

An instrumented run under the original relay conditions captures each page's title, available seat buttons, table phase and position before cleanup if initial seating fails.
It also retains the existing capture around the replacement-host wait.
All twenty trials in that instrumented run passed without reproducing either timeout.
Three revised recovery trials also passed with the local tracker fixture and default MQTT and STUN settings.
Those trials do not establish that any particular public broker delivered a message.

The full browser run at `1825255` failed the simultaneous host-election case before its agreement check.
Both pages had previously shown an enabled host button, but one scheduled callback found that its button was no longer enabled or visible.
The failure did not record when each callback fired or why the button was unavailable, so it does not establish whether timer scheduling, an automatic claim or another event caused the result.
The test now records each callback time and button state while retaining the requirement that both clicks reach enabled buttons.
Eight instrumented trials overlapped the full suite and shared the machine and public relays.
Six passed, one again found an unavailable button, and one reached both clicks but failed the subsequent host-stability check.
The second failure showed North as host in the surviving page snapshot, but the expected host and the other page's state were not recorded at the point of failure.
These observations do not establish whether the host change was transient or persistent.
Eight further trials with persistent timing and host-history capture all passed.
Their callbacks fired zero or one millisecond after their scheduled time, with both buttons enabled.
The scheduled clicks were 29.9 to 30.9 seconds after the original host closed; that wall-clock interval does not establish when either page's absence clock started.
These passing trials did not reproduce either failure or determine its cause.
Twelve more trials recorded the host view at each callback and the later host views if stability failed.
All twelve passed, and every callback found an enabled button with no host shown.
Their callbacks fired zero or one millisecond after the target, 29.8 to 31.0 seconds after host closure.
The twelve trials overlapped the full browser run and therefore shared its machine and public relays.
In the first three subsequent passing trials, the pages' banners showed 10 to 13 seconds of host absence at the scheduled clicks.
That observation does not support automatic volunteering at the 30-second threshold in those trials, despite the roughly 30-second wall-clock interval since host closure.
The original failures did not capture the absence clocks, so their cause remains unknown.
One later trial captured a different host-stability failure.
Both pages clicked at the same millisecond with no host shown, and their absence banners showed 10 and 12 seconds.
The helper first observed agreement on East, then found no host on either page and saw North on both pages within 263 milliseconds.
Both pages continued to show North throughout the following ten seconds.
The configured host seat was West, so North has priority over East under the adopted clockwise handover rule.
This demonstrates that the test's requirement to keep the first agreed host rejects a permitted handover; it does not explain the unavailable-button failure.
Another instrumented trial reproduced the same East-to-North sequence.
Both callbacks fired in the same millisecond with enabled buttons and host-absence banners of 11 and 12 seconds.
Both pages showed North within 267 milliseconds of the failed observation and continued to agree for ten seconds.
The test now waits for both pages to show North, then requires North to remain their common host for eight seconds and checks message delivery.
This retains the stability and delivery checks and adds an explicit check of the preferred host.
Twelve trials with the corrected stability check passed, including both enabled clicks and message delivery.
They did not reproduce the separate unavailable-button failure.
The simultaneous-click test now holds each page's outgoing data-channel frames until both click callbacks have run, then sends the frames in order.
This creates a repeatable concurrent-claim scenario even if the browser schedules one callback after the other.
The test still requires both buttons to be enabled, North to become and remain host for eight seconds, and messages to arrive at both pages.
The hold models a brief network delay and does not establish the cause of the earlier unavailable-button failure.
Twelve concurrent-claim trials passed with the frame hold.
Four further trials recorded two to six held frames per page and also passed the election and delivery checks.
The test now requires each page to send at least one frame during the hold.
Four trials with that explicit frame requirement passed.
