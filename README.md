# PF2E Encounter Forge

PF2e encounter planning and orchestration module in early alpha development.

## 0.1.0-alpha.4.4 — Participant Composition + Integration Controls

### 0.1.0-alpha.4.4 fixes

- Participant add/edit/remove rerenders preserve the Encounter Forge editor scroll position instead of jumping back to the top.
- Library and integration-list scroll positions are preserved across ordinary in-place rerenders as well.
- Explicitly switching to a different/new/duplicated Encounter Blueprint still opens that document from the top.

### 0.1.0-alpha.4.3 fixes

- Persisted participant levels now survive save/reopen for Actor, Creature Forge, and NPC Forge participants.
- Tactical roles and group assignments are no longer cleared during save.
- XP contributions are recalculated from the restored participant level whenever a saved Blueprint is loaded.

The Encounter Forge can now assemble real encounter rosters while keeping planning data separate from World Actor creation.


### 0.1.0-alpha.4.2 fixes

- Integrated Creature Forge uses the same full two-column Concept / Creature layout as its standalone editor when enough width is available.
- Creature Forge participant level snapshots are recovered from either the generated blueprint or the current Creature Forge request.
- Per-participant and total encounter XP feedback updates live when level or quantity is edited.

### Participant sources

- Drag PF2e NPC Actors directly from the Actor sidebar or Actor compendiums into an Encounter Blueprint.
- Browse World Actors and Actor compendiums from the built-in participant source browser.
- Create or edit encounter participants through the public embedded Creature Forge editor when Creature Forge is active.
- Create or edit encounter participants through the public embedded NPC Forge editor when NPC Forge is active.
- Creature/NPC Forge planning stores their neutral source data in the Encounter Blueprint; World Actors are intentionally not created until the later Deployment block.

### Composition metadata

Each participant template can currently store:

- display name
- source provenance
- level snapshot
- portrait snapshot
- quantity
- encounter role
- tactical group
- future tactics profile reference
- adjustments/overrides placeholders

Tactical groups can be created, renamed, assigned, and removed in the Encounter Forge UI.

### PF2e encounter budget

The UI now evaluates standard PF2e creature XP values from party level −4 through party level +4 and multiplies them by participant quantity.

Threat budgets use the four-character baseline and adjust for party size:

- Trivial: 40 XP, ±10 per character
- Low: 60 XP, ±15 per character
- Moderate: 80 XP, ±20 per character
- Severe: 120 XP, ±30 per character
- Extreme: 160 XP, ±40 per character

A manual XP budget can still override the calculated target. Participants with unknown levels or levels outside the supported relative range are shown explicitly and make the budget analysis incomplete rather than silently guessing.

Public helpers are exposed through:

```js
game.modules.get("pf2e-encounter-forge").api.budget
```


### Integration manager

The library sidebar now exposes the configured Forge integrations. For each supported module it shows whether the module is installed, active, API-ready, disabled for Encounter Forge, or currently integrated. Ready integrations can be enabled or disabled per world without changing Foundry's own module activation state.

### Existing foundation

The module still includes:

- automatic PF2e party detection
- Actor Directory launcher for GMs
- ApplicationV2 Encounter Forge window
- persistent JournalEntry-backed Encounter Blueprint library
- Encounter Blueprint schema v1 and Encounter Instance schema v1
- optional Forge Integration Registry
- Participant Source Registry and Actor materialization contracts
- Actor folder service for future deployment
- primary-GM authority handling
- inert Encounter Runtime service skeleton

Deployment, token placement, live encounter hooks, objectives/phases/triggers editing, tactics execution, and the Encounter Director remain intentionally inactive in this block.

## Development

```bash
npm test
npm run check
```

## License

MIT. See [LICENSE](LICENSE).

