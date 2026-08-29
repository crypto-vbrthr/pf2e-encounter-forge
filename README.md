# PF2E Encounter Forge

PF2e encounter planning and orchestration module in early alpha development.

## 0.1.0-alpha.5.1 — Deployment & Actor Materialization

Encounter Blueprints can now be turned into persistent, prepared Encounter Instances. The Deployment block deliberately stops before token placement and live orchestration, keeping the transition from planning data to world documents explicit and reversible.

This maintenance build also keeps the deployment dialog above the main Encounter Forge window and explicitly enforces the selected Actor destination folder after every provider materializes its World Actor. This is important for providers such as Creature Forge whose public Actor creation contract does not itself assign the supplied folder.

### Deployment workflow

The Blueprint editor now exposes **Deploy Encounter**. Deployment automatically saves the current Blueprint first, then opens a dedicated configuration dialog where the GM can choose:

- an optional target Scene, defaulting to the currently active Scene when available
- an existing Actor folder or the Actor Directory root
- whether to create a new Encounter-specific Actor subfolder
- the subfolder name
- whether World Actors are created once per opponent type or once per concrete participant

Encounter-specific subfolders use unique names instead of silently mixing a new Instance into an existing same-named folder.

### Actor materialization

All supported participant sources now converge on real World Actors during deployment:

- World/compendium Actor references are copied into the target Actor folder.
- Creature Forge participant blueprints are materialized through Creature Forge's public `createActor()` API.
- NPC Forge participants are materialized through NPC Forge's public document API.

The Blueprint participant name is respected for the materialized Actor. In per-participant mode repeated opponents are numbered (`Guardian 1`, `Guardian 2`, and so on).

Materialized Actors receive Encounter Forge provenance and deployment metadata in `flags.pf2e-encounter-forge.participant`, including Blueprint/template identity, Instance identity, Actor mode, concrete runtime participant IDs, and the destination folder.

### Prepared Encounter Instance

Deployment expands Blueprint quantities into concrete runtime participants and persists an Encounter Instance under `Encounter Forge/Runtime`.

The Instance records:

- Blueprint ID and saved Blueprint UUID
- optional target Scene UUID and name snapshot
- Actor destination folder ID and name snapshot
- Actor materialization mode
- concrete runtime participant IDs
- World Actor UUIDs assigned to every runtime participant
- the unique set of World Actors created by this deployment
- prepared status and materialization timestamp

In `per-type` mode all runtime participants of one template share one World Actor reference, ready for later unlinked Token deployment. In `per-participant` mode every runtime participant receives a separate World Actor.

### Transaction safety

Actor materialization is treated as one deployment transaction. If a participant fails to materialize before the Instance is persisted, Encounter Forge removes Actors created by that failed attempt and removes an automatically created deployment folder. A half-built Encounter Instance is not saved.

### Still intentionally inactive

This build does **not** yet:

- place Tokens on the Scene
- create Combatants or a Combat encounter
- assign deployment zones
- start or restore the Encounter Runtime
- run objectives, phases, triggers, or tactical instructions
- open the Encounter Director

The selected Scene is stored on the prepared Instance so the next deployment block can continue from a stable target without guessing.

### Existing planning features

The module also includes:

- automatic PF2e party detection
- Actor Directory launcher for GMs
- persistent JournalEntry-backed Encounter Blueprint library
- participant composition from Actors, Creature Forge, and NPC Forge
- tactical groups and encounter roles
- live PF2e encounter XP budgeting
- optional integration manager for supported Forge modules
- Encounter Blueprint schema v1 and Encounter Instance schema v1
- primary-GM authority handling and inert Encounter Runtime service skeleton

### Public deployment API

```js
game.modules.get("pf2e-encounter-forge").api.deployment.deploy(blueprint, {
  blueprintUuid: "JournalEntry...",
  sceneUuid: "Scene...",       // optional
  actorFolderId: "...",        // optional, null = Actor root
  createSubfolder: true,
  subfolderName: blueprint.name,
  actorMode: "per-type"         // or "per-participant"
});
```

## Development

```bash
npm test
npm run check
```

## License

MIT. See [LICENSE](LICENSE).
