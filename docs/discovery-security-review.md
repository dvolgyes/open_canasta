# Discovery and community security review

Status: community review required.
The community interface remains disabled.
The project owner is the risk owner.
An independent cryptography and security specialist must review the community design and implementation before that feature is enabled.
On 2026-10-30, the project owner said they reviewed the code and found it acceptable from a security perspective.
The owner subsequently confirmed that the OpenTrick Nostr principles had been reviewed and approved their use in this port.
The community identity design remains unselected.

## Nostr discovery

The reference is OpenTrick commit `7af1a45`, especially `src/p2p/nostr.ts`, `src/p2p/relay-socket.ts` and `src/p2p/signaling.ts`.
The owner approved applying the reviewed OpenTrick Nostr principles to this port.
The comparison does not establish that every deployment has the same risks.
The reference uses `@noble/secp256k1` version `3.2.0` and signs Nostr events with a key generated when the adapter module loads.
On 2026-10-30, the npm registry reported version `3.2.0`, a last package modification on 2026-08-30, and the same library repository linked below.
The project uses that version for its Nostr adapter.
The same module-scoped public key is placed in events for topics handled by that module instance.
That reuse can let a relay correlate those events, including events for different tables in the same instance.
The reference does not persist the signing key, and the inspected adapter has no explicit key-rotation or erasure operation.
The port keeps that lifecycle, including its cross-table correlation property.

[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) defines event identifiers, public keys and Schnorr signatures.
The [library documentation](https://github.com/paulmillr/noble-secp256k1) describes its key and signature interfaces.
The reference parser reads a subscription ID, topic tag and content from incoming events without checking the event signature.
A valid signature alone would establish control of an event key, not membership in a private Canasta table.
The port retains OpenTrick's signaling model and does not treat a relay event signature as proof of table membership.

The boundary includes untrusted relay frames, subscription identifiers, event tags, event content and relay status text.
The inspected reference passes socket data to JSON parsing and can log relay-provided text.
Review frame and field limits before parsing, routing to the correct subscription, replay and flood behavior, and a bounded diagnostic sink that does not expose secrets or trust terminal control text.
Verification must include malicious and silent relays, malformed and oversized frames, forged and replayed events, reconnects, multiple relay types and one connection per peer pair.
Record any remaining availability and correlation risks with the project owner.

## Community formation

The existing `src/community/transport.ts` separates public discovery from private formation and bounds received message size and rate.
The formation key is shared by members, and the transport supplies connection peer identifiers without proving which member controls each connection.
A member who knows the shared key can therefore claim another member's public identifier before that member connects.
The current separate vote messages do not resolve that identity problem.

Before exposing formation, durable voting, replacement or recovery, the reviewer must assess an independently authenticated participant identity and its full creation, binding, storage, recovery, revocation and loss lifecycle.
The design must define how an authenticated identity is bound to a connection and to a particular vote or seat transition.
It must also specify how to handle replay, simultaneous sessions, crash recovery, member replacement and loss of a credential.
Tests must exercise impersonation and recovery with real peers, not only simulated message delivery.
No identity or cryptographic mechanism is selected by this note.

## Review outcome

The reviewer should record the reviewed source revision, approved or rejected design, required changes, test evidence and residual risks.
The project owner must resolve any remaining risk decisions before release.
Until the community review is complete, the migration checklist retains that blocker.
