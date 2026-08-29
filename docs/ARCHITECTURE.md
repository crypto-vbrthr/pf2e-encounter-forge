# PF2E Encounter Forge — Architecture Foundation

## Vocabulary

- **Encounter Forge**: planning and editing layer.
- **Encounter Blueprint**: reusable, serializable encounter plan.
- **Encounter Instance**: persistent state for one concrete deployment.
- **Encounter Director**: future GM-facing direction and decision UI.
- **Encounter Runtime**: authoritative background orchestration layer.

## Ownership rule

Encounter Forge owns encounter-specific state only: phases, objectives, participant roles, encounter tactics, trigger history and orchestration state. Other Forge modules retain ownership of their native resources and runtimes.

## Persistence

Blueprints and Instances are stored as hidden-by-default JournalEntry documents under `Encounter Forge/Blueprints` and `Encounter Forge/Runtime`. The payload lives in `flags.pf2e-encounter-forge.repository`.

## Participant materialization

Participant sources resolve through a registry. Core source types are:

- `document`: copies an Actor from a world or compendium UUID into the world.
- `creatureForge`: asks Creature Forge to create a world Actor.
- `npcForge`: asks NPC Forge to create a world Actor.

Every materialized Actor is stamped with provenance in `flags.pf2e-encounter-forge.participant`.

## Optional integrations

The integration registry is deliberately dynamic. Encounter Forge has no hard module dependencies beyond PF2e. It currently recognizes Creature Forge, NPC Forge, Effect Forge (Critical Forge), Aura Forge, Affliction Forge, Item Forge, Loot Forge and Weather Forge.

## Runtime authority

Only the primary active GM should execute Encounter Runtime mutations. The foundation implements the authority contract and runtime service boundaries, but no gameplay hooks or encounter actions are enabled yet.

## GM-facing Forge UI

Starting with `0.1.0-alpha.2`, the planning layer is exposed through an ApplicationV2 window launched from the Actor Directory. The UI persists only Encounter Blueprints through the BlueprintRepository. It does not start, restore, deploy, or mutate Encounter Instances.

The public API exposes `api.ui.open()` as the stable launcher. The Actor Directory button is a convenience integration and not a persistence or runtime dependency.
