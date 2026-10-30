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
