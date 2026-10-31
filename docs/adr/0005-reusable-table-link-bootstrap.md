# ADR 0005: Reusable table links bootstrap an expired table

Status: accepted (2026-10-20).
Amended on 2026-10-22: a page that has a host's lobby claims the host seat from that host and never seeds a table.
Before this note, a new browser that chose the configured host seat from a live host's lobby started a second table with itself as host, and the live host then refused it as superseded.
Amended on 2026-10-23: the text calls the game a table, not a room, as the code does; the decision is unchanged.
Amended on 2026-10-29: a browser with no replica waits for 30 seconds online without a host before it seeds the configured host seat.
A recent beat or lobby reporting an existing table postpones the seed until 30 seconds after that report.
An isolated browser can still seed a separate table when it cannot reach the players who hold the existing game.
Amended on 2026-10-30: any eligible seated browser can seed after the wait when it hears no eligible seat closer clockwise to the configured host seat.
When separately seeded tables later meet, the table with more entries wins, with seat priority breaking a tie.
Amended on 2026-10-30: a shared link without a seat parameter asks the player to select a remembered seat.
A player's own link names the seat and can reopen it directly.
Amended on 2026-10-30: the seat picker shows all four seats and marks unavailable seats.
When only one seat is available it can be selected automatically, except that a shared link does not automatically reclaim this browser's own seat.

## Context

ADR 0004 stores table state in each player's browser and now expires an idle table after eight hours.
The table URL already carries the four player names, the host seat, and the table key.
The player-specific URL carries `pl`, while the shared URL omits it.
The host needs to reopen a weekly table even when its local copy has expired or is missing.

## Decision

A complete table setup in the URL allows the page to clear its local expiry tombstone when it has no local replica.
The page shows all four seats while no host lobby or remembered seat is available.
When an eligible page selects a seat, it waits online and seeds the local replica from the URL setup if no higher-priority eligible seat or recent evidence of an existing table is present.
The seat order starts at the configured host seat and continues clockwise.
The table link omits `pl`; a player's own URL keeps it for reload.

## Consequences

The same table URL can start a fresh session after local expiry or data loss.
The fresh session loses the old hand, scores, and seat claims.
The table key remains a bearer capability, so anyone with the link can select the host seat and bootstrap the table.
The existing trusted-player model and host-election tie-break govern simultaneous host attempts.
If separated pages create divergent tables, convergence replaces the losing branch and can discard actions unique to it.
The host bootstrap requires persistent browser storage.

## Alternatives Considered

- Keep expired tables permanently expired and require a new table key each week.
  This preserves separation between sessions but requires the host to create and redistribute a new link.
- Keep a create screen without a table key as the reusable link.
  This avoids table revival but does not let players join the same lobby from that link.
