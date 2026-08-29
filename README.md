# PF2E Encounter Forge

PF2e encounter planning, deployment, and live encounter-direction module in early alpha development.

## 0.1.0-alpha.7.2 — Reopen Encounter & Unobstructed Placement

This patch adds a safe lifecycle undo for accidentally completed encounters and keeps the canvas fully clear during interactive Token placement.

### Reopening a completed Encounter

A completed Encounter now exposes **Undo completion** in the Encounter Director. After GM confirmation, the same Encounter Instance returns to `active` without resetting its tactical history. Current phase, objective progress, already-fired triggers, participant states, decisions, logs, World Actors, Tokens, and prepared Combat remain intact. This is intentionally an undo of an accidental completion, not a fresh replay/reset of the Encounter.

The operation is also available through `game.modules.get("pf2e-encounter-forge").api.runtime.reopen()`.

### Interactive placement window behavior

When manual Token placement starts, the deployment dialog is closed as before and the **entire Encounter Forge window is temporarily hidden**, including its title bar. This leaves the Scene canvas unobstructed for Foundry's native Token placement workflow. The Forge is restored and brought back to the front after placement finishes or is cancelled.

## 0.1.0-alpha.7.1 — Director Participant Cards

This patch improves the live Director participant overview while retaining the Runtime/Director MVP from alpha.7. The **Encounter Forge** remains the planning workshop, the **Encounter Director** is now the GM-facing live control desk, and the **Encounter Runtime** is the authoritative background orchestration layer that watches Foundry/PF2e state and persists encounter-specific state.

### Encounter Director

The Director is a separate ApplicationV2 window and can be opened from:

- the clapperboard button in Encounter Forge
- the Combat Tracker when logged in as a GM
- `game.modules.get("pf2e-encounter-forge").api.ui.openDirector()`

It prefers the Encounter attached to the current Combat, then the current Scene, then the currently bound Runtime Instance, and finally the newest prepared/active/paused Instance.

The Director currently shows:

- Encounter status and Scene/Combat association
- current round and turn known to the Runtime
- current phase and manual phase switching
- objectives with progress controls and completion/reopen actions
- concrete participants as visual Actor cards with portrait, stable display name, level, role/group metadata, state badge, and a full live HP bar
- pending GM decisions created by triggers
- persistent Encounter log
- number of already-fired triggers

Lifecycle controls support **Start**, **Pause**, **Resume**, and **Complete**. Completion is persistent and stops trigger evaluation without destroying Actors, Tokens, Combat, or Encounter history.

### Runtime activation and restoration

A prepared Encounter stays inert until one of two things happens:

1. the GM presses **Start Encounter** in the Director, or
2. a Foundry Combat prepared by that Encounter actually starts.

Only the primary active GM is authoritative for Runtime mutations. On world ready, active and paused Encounter Instances are restored automatically. Merely prepared Instances are deliberately not auto-restored or started.

If the Runtime is switched to another Encounter while one is active, the previous Instance is persisted as paused first rather than leaving multiple encounters marked active.

### Runtime event monitoring

The Runtime now normalizes relevant Foundry document hooks into Encounter events. The MVP observes:

- Combat round changes
- Combat turn changes
- Combatant defeated/restored state
- Encounter Token changes
- Encounter Token deletion
- Encounter Actor changes

The Runtime stores encounter-specific consequences only. Native HP, conditions, inventory, spell resources, Token position, and PF2e rules remain owned by the normal Foundry/PF2e documents. The Director reads live HP from the concrete Token Actor when available.

### Trigger and GM-decision MVP

Blueprint triggers can already be evaluated when authored through data/API/add-on content. A trigger uses a normalized Runtime event and optional declarative conditions, for example:

```js
{
  id: "round-four-awakening",
  event: "combat.roundChanged",
  conditions: [
    { field: "round", operator: "gte", value: 4 }
  ],
  actions: ["enter-awakening"]
}
```

The trigger fires once by default. Consequential actions are presented to the GM as a **Director decision** unless the trigger explicitly opts into automatic execution.

The first supported Runtime actions are:

- `phase.transition`
- `objective.progress`
- `director.message`

The Blueprint editor does not yet provide authoring UI for phases, objectives, triggers, and actions. The Runtime/Director contracts are in place first so the next authoring block can target a stable execution model.

### Persistent Runtime state

The Encounter Instance continues to be the single source of truth for one concrete playthrough. Runtime additions include:

- active/paused/completed status
- `startedAt`, `pausedAt`, and `completedAt`
- current phase
- objective state/progress
- participant encounter state
- fired-trigger IDs
- pending/resolved GM decisions
- bounded persistent log
- current Runtime round/turn snapshot

World reloads therefore do not erase the Director's memory.

### Existing planning and deployment features

The module also includes:

- automatic PF2e party detection
- persistent JournalEntry-backed Encounter Blueprint library
- participant composition from World/compendium Actors, Creature Forge, and NPC Forge
- tactical groups and encounter roles
- per-participant Token name and HP-bar display policy
- live PF2e encounter XP budgeting
- optional integration manager for supported Forge modules
- Actor materialization into a GM-selected Actor folder/subfolder
- one Actor per opponent type or one Actor per concrete participant
- automatic or manual interactive Scene Token placement
- optional Foundry Combat preparation with existing PC Tokens
- rollback-safe deployment transaction

### Still intentionally deferred

This MVP does **not** yet provide:

- Blueprint-editor UI for authoring phases, objectives, triggers, or tactical instructions
- automatic tactical movement or AI-controlled opponent turns
- Aura Forge, Affliction Forge, Effect Forge, Weather Forge, Loot Forge, or Item Forge Runtime actions
- authored deployment Regions/zones
- encounter outcome/reward orchestration

Those can now be layered onto the stable Director/Runtime boundary instead of being mixed into planning or deployment code.

### Public Runtime API

```js
const ef = game.modules.get("pf2e-encounter-forge").api;

await ef.runtime.activate(instanceId);
await ef.runtime.pause();
await ef.runtime.resume();
await ef.runtime.setPhase("phase-2");
await ef.runtime.adjustObjective("ritual", 1);
await ef.runtime.resolveDecision(decisionId, "accept");
const snapshot = await ef.runtime.inspect(instanceId);
await ef.runtime.complete();
```

## Development

```bash
npm test
npm run check
```

## License

MIT. See [LICENSE](LICENSE).
