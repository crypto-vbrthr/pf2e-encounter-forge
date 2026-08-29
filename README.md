# PF2E Encounter Forge

## 0.1.0-alpha.8.4 — Objective & Round-End Flow Triggers

The Flow authoring layer can now express chained encounter logic such as “increase ritual progress at the end of every round, then enter the next phase when the objective target is reached.” Triggers can listen for round-end, objective-progress, and objective-completion events and can be scoped to a specific objective directly from the UI.

The bundled Rune Altar example demonstrates this pattern.

## 0.1.0-alpha.8.3 — Encounter Library Row Polish

Saved Encounters in the left library now use a dedicated card layout with clearly separated, left-aligned name and party/threat metadata. Each row also has its own trash control, so an Encounter can be deleted directly from the library without first hunting for the editor-footer action. Deletion still uses the existing confirmation dialog.

## 0.1.0-alpha.8.2 — Encounter Library Layout Polish

The left Encounter library is now structured as a compact tool area followed by a clearly labeled saved-encounter list. New, Example, Refresh, and Director controls are contained in a two-column labeled toolbar, and the whole library column now guards against horizontal overflow when the window is resized.

PF2e encounter planning, deployment, and live encounter-direction module in early alpha development.

## 0.1.0-alpha.8.1 — Live Flow References & Onboarding Example

This patch polishes Encounter Flow authoring and adds an onboarding encounter so a new GM can immediately see how the pieces fit together. Phase, objective, participant, group, and action names now propagate live to every dependent dropdown/linked-action label while editing.

Fresh worlds receive **Example: The Unstable Rune Altar** on the first Encounter Forge launch. Existing worlds can create or reopen it with the graduation-cap button in the Encounter library toolbar. The sample is intentionally independent of specific bestiaries: its opponent entries are clearly marked placeholders that demonstrate budget, roles, groups, and participant-scoped triggers, and deployment remains disabled until they are replaced with real participants.

The example demonstrates a moderate-budget encounter, three phases, a Runtime-managed objective, a GM-managed objective, an automatic repeating round trigger, a 50% HP phase transition requiring GM confirmation, and a leader-defeated transition.

The underlying **Encounter Flow** authoring surface remains the Runtime's declarative screenplay editor:

### Flow authoring

The editor now supports:

- ordered **phases**, with the first phase becoming the Instance start phase
- **objectives** with persistent progress targets
- Runtime **actions** for phase transitions, objective progress, and Director messages
- **triggers** bound to normalized Runtime events
- optional trigger scoping to one active phase or participant
- reusable declarative trigger **conditions**
- one-shot/repeating and enabled/disabled trigger policies
- GM-confirmed actions or explicit automatic execution
- linking multiple prepared actions to one trigger

The first authorable normalized events are Combat round/turn changes, participant HP changes, participant defeated/restored state, and participant Token removal. HP-change events now expose current HP, maximum HP, and HP percentage so a trigger can express conditions such as “boss HP at most 50%”.

### Flow validation

The Forge analyzes the authored flow while editing. Save-blocking errors include dead action, phase, objective, participant, and trigger references. Softer warnings call out unsupported event/action contracts, phases that currently appear unreachable, and phase-transition cycles that deserve a GM sanity check.

The public API exposes the same contract through `api.flow`, including supported event/action/operator metadata and `api.flow.analyze(blueprint)`.

### Runtime integration

Triggers may now be scoped to an active phase. This keeps phase-specific choreography declarative: a trigger can listen for the same Combat event throughout the encounter but only react while its authored phase is current. The Director remains the visible GM partner and the Runtime remains the execution layer.

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
