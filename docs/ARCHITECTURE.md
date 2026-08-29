# PF2E Encounter Forge — Architecture

## Vocabulary

- **Encounter Forge**: planning and editing layer.
- **Encounter Blueprint**: reusable, serializable encounter plan.
- **Encounter Instance**: persistent state for one concrete deployment.
- **Encounter Director**: GM-facing live direction and decision UI.
- **Encounter Runtime**: authoritative background orchestration layer.

## Ownership rule

Encounter Forge owns encounter-specific state only: phases, objectives, participant roles, tactical groups, encounter tactics, trigger history, deployment identity, and orchestration state. Other Forge modules retain ownership of their native resources and runtimes.

## Persistence

Blueprints and Instances are stored as hidden-by-default JournalEntry documents under `Encounter Forge/Blueprints` and `Encounter Forge/Runtime`. The payload lives in `flags.pf2e-encounter-forge.repository`.

## Planning versus deployment

Planning and materialization are separate phases.

During composition, an Encounter Blueprint stores participant templates containing source provenance, level/portrait snapshots for planning, quantity, role, group, and future tactics references. No World Actor is created merely by adding a participant to the Blueprint.

Deployment converts those neutral templates into World Actors and creates one persistent Encounter Instance. This is the boundary where reusable planning data becomes one concrete playthrough.

## Participant source contracts

Core source types are:

- `document`: references an existing World or compendium Actor by UUID during planning; deployment copies it into the configured Encounter Actor folder.
- `creatureForge`: stores a neutral Creature Forge Blueprint/request during planning; deployment asks Creature Forge to create the World Actor through its public API.
- `npcForge`: stores a neutral NPC Forge model/request during planning; deployment asks NPC Forge to create the World Actor through its public API.

Encounter Forge never imports private classes from integrated modules.

## Actor materialization modes

Deployment supports two explicit modes.

### `per-type`

One World Actor is created for each Blueprint participant template. Quantity expands into multiple concrete runtime participant identities, but those identities reference the same World Actor. Later Scene deployment can create unlinked Tokens from that Actor.

### `per-participant`

Every concrete runtime participant receives its own World Actor. Repeated participants are numbered when materialized. This mode is intended for opponents that need independent persistent Actor state outside Token delta data.

## Actor destination

The GM can target the Actor Directory root or any existing Actor folder. Deployment can optionally create an Encounter-specific subfolder below that target. Automatically created subfolders use unique names (`Encounter`, `Encounter (2)`, etc.) so separate Instances do not silently share storage.

An auto-created deployment folder is stamped with Encounter Forge Instance metadata after successful persistence.

## Actor provenance

Every materialized Actor is stamped in `flags.pf2e-encounter-forge.participant`. The deployment metadata includes:

- original source provenance
- Blueprint ID
- participant template ID
- Encounter Instance ID and UUID
- Actor mode
- concrete runtime participant IDs represented by the Actor
- Actor destination folder
- materialization timestamp

Native creature/NPC content remains owned by the source Forge; Encounter Forge only adds encounter/deployment provenance.

## Encounter Instance deployment state

The prepared Instance stores:

- Blueprint ID, schema version, and saved Blueprint UUID
- optional Scene UUID and display-name snapshot
- Actor folder ID and name snapshot
- Actor materialization mode
- unique materialized World Actor UUIDs
- concrete runtime participants and their Actor UUID assignments
- concrete Token UUIDs and per-participant Token assignments
- Token placement mode and timestamp
- optional prepared Combat UUID/timestamp
- initial phase/objective state
- prepared status and timestamps

Actor hit points, conditions, equipment state, and other native Actor data are **not** duplicated into the Instance.

## Deployment transaction boundary

World Actor materialization and optional Scene preparation form one deployment transaction. Encounter Forge tracks every World Actor, Token, Combat, and automatically created Actor folder created by the attempt. If a later step fails, those documents are rolled back where possible and no half-built Instance should remain persisted.

The Instance payload is persisted only after the requested Actor and Scene preparation succeeds. Once the Instance document exists, its UUID is stamped back onto materialized Actors, Tokens, the Scene, the optional Combat, and an auto-created deployment folder. Failure of these final convenience back-reference stamps is logged but does not invalidate the already successful deployment.

## Scene and Combat boundary

Scene preparation is owned by `SceneDeploymentService`, not by the Runtime. It consumes concrete runtime participants and their already materialized World Actor references.

For every concrete runtime participant, Scene deployment creates exactly one Token and stores its Token UUID back on the participant. `per-type` deployments create unlinked Tokens from the shared World Actor; `per-participant` deployments create linked Tokens from the participant's individual World Actor. The recorded placement coordinates are an initial staging snapshot only; current position remains native Token state and must not be shadow-copied into Encounter state.

The initial placement mode is `staging-center`: a compact, size-aware formation centered on the Scene. It is intentionally a staging formation for GM adjustment, not tactical automatic placement. Authored deployment zones/Regions can be layered on top in a later block without changing participant identity semantics.

Optional Combat preparation creates a Foundry Combat for the selected Scene, adds the generated opponent Tokens as Combatants, and can also include existing character Tokens already on the Scene. It does not roll initiative, start combat, or start the Encounter Runtime.

The Scene and Combat receive Instance back-references after persistence. Native Token and Combat state remains owned by Foundry/PF2e.

## Encounter budget service

The budget service is independent of deployment and exposed through `api.budget`. It implements standard PF2e relative creature XP for party level −4 through party level +4, standard four-character encounter budgets, and per-character adjustments. Unknown/out-of-range participant levels produce an explicit incomplete analysis rather than inferred XP.

## Optional integrations

The integration registry is dynamic. Encounter Forge has no hard module dependencies beyond PF2e. It recognizes Creature Forge, NPC Forge, Effect Forge (Critical Forge), Aura Forge, Affliction Forge, Item Forge, Loot Forge, and Weather Forge.

## Runtime authority

Only the primary active GM executes Encounter Runtime mutations. Prepared deployments remain inert until explicitly started or their prepared Combat begins; active/paused Instances can be restored on world ready.

## GM-facing UI

The planning layer is exposed through an ApplicationV2 window launched from the Actor Directory. The Deployment dialog is a separate ApplicationV2 surface because deployment is a concrete world mutation, not merely an editor operation.

The Encounter Director remains a separate surface: Forge is the workshop, Deployment puts the cast on the production, Director is the live control desk.


## Interactive Scene placement

`SceneDeploymentService` owns the stable Encounter-to-Scene contract. For `placementMode: "interactive"` it delegates the canvas interaction to `InteractiveTokenPlacementService`, which uses Foundry VTT 14's public `TokenLayer.placeTokens()` workflow. The interactive service owns only Scene viewing, preview/placement interaction, and the temporary placement HUD. Encounter identity, persistence, Combat preparation, and rollback remain owned by the normal deployment pipeline.

Pressing Esc produces a deployment cancellation error rather than a partially prepared Encounter Instance. The outer deployment transaction therefore retains a single rollback boundary across World Actor materialization, Token placement, Combat creation, and Instance persistence.

## Encounter Runtime MVP

The Runtime is no longer inert as of `0.1.0-alpha.7`. It binds to at most one Encounter Instance on the authoritative GM client and owns encounter-specific live orchestration state only.

Concrete Runtime services are:

- `EventService`: converts relevant Foundry document hooks into normalized Encounter events.
- `TriggerService`: evaluates declarative Blueprint triggers while an Instance is active.
- `PhaseService`: resolves and validates Blueprint phases against the Instance current phase.
- `ObjectiveService`: exposes Blueprint objective definitions paired with Instance objective state.
- `ParticipantService`: resolves concrete Token/Actor documents and produces live participant snapshots without duplicating native PF2e state.
- `TacticsService`: resolves Encounter-owned tactics profile metadata; active tactical recommendation logic remains intentionally minimal.
- `ActionService`: dispatches supported Encounter actions through stable handlers.
- `RuntimePersistenceService`: serializes Runtime saves through the Instance repository.

The Runtime remains authoritative-GM-only for mutations. A prepared Instance may be inspected by the Director without activation, but trigger processing occurs only while `instance.status === "active"`.

### Runtime lifecycle

Supported transitions are:

```text
prepared -> active <-> paused -> completed
```

A prepared Encounter can be activated explicitly by the Director or automatically when its prepared Foundry Combat starts. On world ready, only active or paused Instances are restored. Prepared Instances stay inert.

Switching the single Runtime binding to a different Instance automatically persists a currently active Encounter as paused first.

### Runtime event contract

`EventService` emits normalized objects through the internal event bus. Initial event types include:

- `combat.roundChanged`
- `combat.turnChanged`
- `participant.defeated`
- `participant.restored`
- `participant.hpChanged`
- `participant.tokenUpdated`
- `participant.actorUpdated`
- `participant.tokenDeleted`

Blueprint triggers listen to `encounter.event`, not raw Foundry hooks. This prevents trigger definitions from depending on Foundry callback signatures.

### Trigger and decision boundary

Triggers are data, never executable JavaScript stored in the Blueprint. The MVP supports an event name plus declarative conditions such as:

```js
{
  id: "round-four",
  event: "combat.roundChanged",
  conditions: [{ field: "round", operator: "gte", value: 4 }],
  actions: ["phase-two"]
}
```

Triggers fire once by default and are recorded in `instance.triggeredEvents`. Consequential actions create a persistent pending GM decision unless a trigger explicitly opts into automatic execution.

The first action types are deliberately small:

- `phase.transition`
- `objective.progress`
- `director.message`

Integrated Forge actions will be added through `ActionService` later rather than by embedding integration logic inside TriggerService or the Director.

## Encounter Director MVP

The Director is a separate GM-facing ApplicationV2 surface. It contains no encounter rules of its own. It consumes Runtime inspection snapshots and invokes public Runtime operations.

The Director shows:

- lifecycle state
- Scene and prepared Combat association
- Runtime round/turn snapshot
- phase selection
- objective progress/state
- concrete participant state and live HP
- pending trigger decisions
- persistent Encounter log

The Director subscribes to Runtime bus notifications and rerenders on relevant changes. It can be opened from Encounter Forge or the Combat Tracker. Selecting an Instance for viewing does not itself mutate that Instance; mutation starts only when the GM invokes a lifecycle/action control or the prepared Combat starts.

This preserves the project vocabulary boundary: **Forge plans, Deployment materializes, Director communicates, Runtime executes, Instance remembers.**


## Encounter Flow authoring

As of `0.1.0-alpha.8`, the Blueprint editor authors the Runtime flow directly rather than treating these sections as raw extension data. Flow data remains plain serializable objects, never executable JavaScript.

The authoring model consists of:

- **phases**: ordered Encounter states; the first phase initializes `EncounterInstance.currentPhaseId`
- **objectives**: definitions whose progress/state live in the Encounter Instance
- **actions**: reusable declarative Runtime instructions
- **triggers**: normalized Runtime event listeners with optional phase/participant scope, conditions, execution policy, and action references

Initial authorable action types are `phase.transition`, `objective.progress`, and `director.message`. Initial event types are normalized Combat round/turn changes and participant HP/defeat/restore/Token-removal events. `participant.hpChanged` includes `hpValue`, `hpMax`, and `hpPercent` snapshots read from native PF2e Actor state; these values are event payload only and are not shadow-persisted into the Encounter Instance.

`TriggerService` supports `activePhaseId` as an Encounter-owned scope filter in addition to participant and condition filters. Consequential actions still default to a persistent GM decision unless the trigger explicitly opts into automatic execution.

`analyzeEncounterFlow()` provides authoring-time structural analysis. Dead references are hard validation errors. Unreachable phases and scoped phase cycles are warnings because they can be intentional in hand-directed encounters. The public `api.flow` surface exposes this contract for add-ons.

### Flow event chaining

Runtime-authored actions can emit normalized Encounter events that are consumed by the same TriggerService as Foundry/PF2e events. Objective progress emits `objective.progressChanged` and a one-time transition into the completed state emits `objective.completed`. Combat round advancement also emits `combat.roundEnded` before `combat.roundChanged` when a real round has completed. This lets Blueprints express chains such as round end → objective progress → objective target reached → phase transition without embedding JavaScript in the Blueprint.
