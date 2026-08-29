# PF2E Encounter Forge — Architecture Foundation

## Vocabulary

- **Encounter Forge**: planning and editing layer.
- **Encounter Blueprint**: reusable, serializable encounter plan.
- **Encounter Instance**: persistent state for one concrete deployment.
- **Encounter Director**: future GM-facing direction and decision UI.
- **Encounter Runtime**: authoritative background orchestration layer.

## Ownership rule

Encounter Forge owns encounter-specific state only: phases, objectives, participant roles, tactical groups, encounter tactics, trigger history and orchestration state. Other Forge modules retain ownership of their native resources and runtimes.

## Persistence

Blueprints and Instances are stored as hidden-by-default JournalEntry documents under `Encounter Forge/Blueprints` and `Encounter Forge/Runtime`. The payload lives in `flags.pf2e-encounter-forge.repository`.

## Participant composition vs. materialization

Planning and deployment are deliberately separate.

During composition, an Encounter Blueprint stores a participant template containing source provenance, a level/portrait snapshot for planning, quantity, role, group, and future tactics references. No World Actor is created merely by adding a participant to the Blueprint.

Core source types are:

- `document`: references an existing world or compendium Actor by UUID during planning; deployment later copies it into the configured Encounter Actor folder.
- `creatureForge`: stores a neutral Creature Forge Blueprint/request during planning; deployment later asks Creature Forge to create the World Actor.
- `npcForge`: stores a neutral NPC Forge model/request during planning; deployment later asks NPC Forge to create the World Actor.

Every materialized Actor will be stamped with provenance in `flags.pf2e-encounter-forge.participant`.

## Participant source UI

The planning UI can currently obtain participants from:

- Actor drag-and-drop from the Actor Directory or Actor compendiums.
- A source browser that lazily indexes one world/compendium source at a time.
- Creature Forge's public embedded editor contract.
- NPC Forge's public embedded editor contract.

Encounter Forge never imports private UI classes from those modules.

## Encounter budget service

The budget service is independent of the UI and exposed through `api.budget`.

It implements standard PF2e relative creature XP for party level −4 through party level +4 and the normal four-character encounter budgets plus per-character adjustments. Unknown/out-of-range participant levels produce an explicit incomplete analysis rather than inferred XP.

An explicit Blueprint `threat.budget` overrides the automatically calculated target but does not alter the underlying rules-budget calculation, which remains available for comparison.

## Optional integrations

The integration registry is deliberately dynamic. Encounter Forge has no hard module dependencies beyond PF2e. It currently recognizes Creature Forge, NPC Forge, Effect Forge (Critical Forge), Aura Forge, Affliction Forge, Item Forge, Loot Forge and Weather Forge.

## Runtime authority

Only the primary active GM should execute Encounter Runtime mutations. The foundation implements the authority contract and runtime service boundaries, but no gameplay hooks or encounter actions are enabled yet.

## GM-facing Forge UI

The planning layer is exposed through an ApplicationV2 window launched from the Actor Directory. The UI persists only Encounter Blueprints through the BlueprintRepository. It does not start, restore, deploy, or mutate Encounter Instances.

The public API exposes `api.ui.open()` as the stable launcher. The Actor Directory button is a convenience integration and not a persistence or runtime dependency.
