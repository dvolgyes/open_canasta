# ADR 0009: Version stored game data

## Context

Some future game changes can make stored table state unusable.
The owner does not require compatibility with old saved games.
Names, language, appearance, and unrelated applications' data do not depend on the game-state format.

## Decision

Use one storage version for the game records in IndexedDB and browser storage.
Treat a missing version marker as version 1, so this rollout keeps existing records.
When a later build raises the version, remove only game records from browser and tab storage and recreate the IndexedDB game stores.
Keep data marked with a newer version when an older build opens.

## Consequences

A deliberate version increase ends locally stored games and removes their recovery records.
A rollback cannot use a newer IndexedDB version until the browser data is cleared.
An older tab closes its database connection when the upgrade starts.
User preferences and keys outside the game-record prefixes remain.

## Alternatives Considered

Migrating each historical game format would preserve games but add compatibility code that the owner does not need.
Clearing all browser storage would also remove preferences and data belonging to other applications.
