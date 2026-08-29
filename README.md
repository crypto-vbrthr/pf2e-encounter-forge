# PF2E Encounter Forge

PF2e encounter planning and orchestration module in early alpha development.

## 0.1.0-alpha.6.3 — Per-Participant Token Display

Encounter deployment now supports both automatic staging and direct interactive placement on the selected Scene. A saved Blueprint can create its World Actors, place one Token for every concrete runtime participant, optionally prepare a Foundry Combat, and persist all resulting document references in the Encounter Instance.

The Encounter Runtime and Encounter Director remain intentionally inactive. This release prepares the stage; it does not yet run the performance.

### Per-participant Token display

Each Encounter participant now has Token-display overrides for the Tokens created during deployment:

- **Token name visibility** can inherit the Actor prototype or use Foundry-style Never, Controlled, Owner Hover, Hover, Owner, or Always modes.
- **HP bar visibility** offers the same modes. When explicitly overridden, Token Bar 1 is bound to PF2e `attributes.hp`.

These settings are Encounter-specific. They are persisted in the Blueprint, copied into concrete Encounter Instance participants, and applied only to the deployed Tokens. The source Actor and its prototype Token remain unchanged. This makes it possible, for example, to keep enemy names visible to the GM for battlefield overview while choosing whether players can see HP bars on a participant-by-participant basis.

### Deployment workflow

The Blueprint editor exposes **Deploy Encounter**. Deployment automatically saves the current Blueprint first, then opens a configuration dialog where the GM can choose:

- a target Scene, defaulting to the currently viewed/active Scene when available
- an existing Actor folder or the Actor Directory root
- whether to create a unique Encounter-specific Actor subfolder
- whether World Actors are created once per opponent type or once per concrete participant
- whether concrete opponents are placed as Tokens on the selected Scene
- whether Tokens are staged automatically at the Scene center or placed manually one by one on the map
- whether a Foundry Combat should be prepared
- whether existing PC/character Tokens on the Scene should also be added to that Combat
- whether the client should switch to the selected Scene after deployment

### Actor materialization

All supported participant sources converge on real World Actors during deployment:

- World/compendium Actor references are copied into the target Actor folder.
- Creature Forge participant blueprints are materialized through Creature Forge's public `createActor()` API.
- NPC Forge participants are materialized through NPC Forge's public document API.

Encounter Forge enforces the selected Actor destination after provider materialization so external Forge implementations do not need to own Encounter folder semantics.

`per-type` creates one World Actor per opponent template. Its concrete Tokens are unlinked and receive independent Token Actor state.

`per-participant` creates one World Actor for every concrete opponent. Its Token is linked to that individual Actor so persistent individual state can live on the World Actor.

### Scene placement

When Token placement is enabled, Encounter Forge creates exactly one Token for every concrete runtime participant. **Manual placement is selected by default**; automatic staging remains available when a quick center formation is preferred. Two placement modes are available:

- **Automatic staging** places the cast in a compact formation around the Scene center. Token size is considered when spacing the formation, and tactical groups remain together in stable participant order.
- **Manual placement** opens the selected Scene and uses Foundry's native sequential Token placement workflow. A ghost Token follows the cursor; left-click confirms each opponent, the mouse wheel can rotate the preview, and Esc cancels the deployment transaction. A compact placement HUD identifies the current opponent and progress.

Manual placement minimizes the Encounter Forge window while the GM works on the map. The actual clicked Token coordinates and rotation are persisted in the Encounter Instance.

Every generated Token receives Encounter Forge flags containing:

- Encounter Instance ID and UUID
- concrete runtime participant ID
- participant template ID
- tactical group ID

The Instance stores every Token UUID and each runtime participant's exact Token UUID, so later Runtime services do not need to rediscover identities from names or Actor types.

### Optional Combat preparation

Deployment can create a Foundry Combat for the selected Scene. Generated opponent Tokens are added as Combatants. If requested, character Tokens already present on that Scene are added as well.

Combat preparation deliberately does **not**:

- roll initiative
- activate/start combat
- start the Encounter Runtime
- execute tactics or phases

The Combat document and Scene receive back-references to the Encounter Instance after persistence.

### Prepared Encounter Instance

The Instance now records:

- saved Blueprint identity
- Scene UUID/name
- Actor destination folder
- Actor materialization mode
- materialized World Actor UUIDs
- concrete runtime participant identities and Actor UUIDs
- concrete Token UUIDs and automatic/manual starting positions (including rotation when available)
- Token placement timestamp/mode
- optional Combat UUID and preparation timestamp
- whether existing PC Tokens were included in the prepared Combat
- initial phase/objective state

Native Actor/Token state such as HP, conditions, inventory, spell resources, and PF2e rule data remains owned by Foundry/PF2e documents rather than being duplicated into the Instance.

### Transaction safety

Deployment is treated as one world-mutation transaction. If Actor materialization, Token placement, Combat preparation, or Instance persistence fails, Encounter Forge rolls back documents created by that attempt where possible:

- newly created Combat
- newly created encounter Tokens
- newly materialized World Actors
- automatically created Actor subfolder

A failed deployment should therefore not leave a half-built encounter scattered through the world.

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

### Still intentionally inactive

This build does **not** yet:

- start or restore the Encounter Runtime
- run objectives, phases, triggers, or tactical instructions
- provide authored deployment zones/Regions or tactical auto-positioning beyond center staging and manual placement
- open the Encounter Director

### Public deployment API

```js
game.modules.get("pf2e-encounter-forge").api.deployment.deploy(blueprint, {
  blueprintUuid: "JournalEntry...",
  sceneUuid: "Scene...",        // optional
  actorFolderId: "...",         // optional, null = Actor root
  createSubfolder: true,
  subfolderName: blueprint.name,
  actorMode: "per-type",         // or "per-participant"
  placeTokens: true,
  placementMode: "staging-center", // or "interactive"
  createCombat: false,
  includePlayerTokens: true
});
```

## Development

```bash
npm test
npm run check
```

## License

MIT. See [LICENSE](LICENSE).
