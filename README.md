# PF2E Encounter Forge

## 0.1.0-alpha.11.1 — Flow Entry Visual Separation

Dense Flow authoring screens are easier to scan. Individual **Phase**, **Objective**, **Action**, and **Trigger** entries now have a clearly visible two-pixel blue/violet outline, a very subtle category tint, and more space between neighboring entries. The outline becomes stronger while an entry is hovered or one of its fields has focus, making it easier to keep track of the block currently being edited without changing any Flow behavior or saved Blueprint data.

## 0.1.0-alpha.11 — Advanced Encounter Logic

Trigger authoring now supports real condition composition rather than a flat list of implicit checks. Conditions can be evaluated as **ALL / AND** or **ANY / OR**, and every individual condition can be inverted with **NOT**. Existing encounters keep their previous behavior because an omitted combination mode still means ALL.

Conditions can still read the event which woke the Trigger, such as HP percentage or the completed round. They can now also inspect persistent **Encounter context**: the current round, turn, and phase; the progress, target, or state of a selected objective; counts for a selected tactical group; and counts across all Encounter participants. This makes patterns such as “two ritualists are defeated AND the ritual is not complete” or “round 4 has started OR only one defender remains” directly authorable without helper objectives.

Objective and Group context are selected by name in the Trigger editor. Current-phase comparisons also use a Phase selector rather than requiring an internal ID. Beneath the condition editor, Encounter Forge renders a compact **When:** sentence that resolves those references into readable names.

Aggregate defeat/removal conditions are evaluated against the state transition carried by the current Runtime event, so the creature that was just defeated is already included in the count for that Trigger evaluation. Participant filters also understand quantity-expanded participants: a Trigger scoped to a Blueprint entry with quantity 3 can react to any of its three concrete Runtime participants.

Flow analysis now catches missing context references and stale Phase/Objective/Group references, and warns about contradictory numeric ALL conditions before they become silent table-time puzzles. Add-ons can inspect the supported modes through `api.flow.conditionModes`.

## 0.1.0-alpha.10 — Director Manual Actions & Flow Authoring Comfort

Encounter Director now exposes the Blueprint's **Prepared Actions** as a live GM control surface. During an active or paused Encounter, the GM can run an authored phase change, objective adjustment, Director message, Effect, Aura, Affliction, or Loot action directly without waiting for a Trigger. Manual execution deliberately uses the same Runtime action pipeline as automatic/confirmed Trigger execution, so external Forges remain responsible for their own rules and documents.

The Director shows each action's type and a compact target/configuration summary. Actions that require a disabled or unavailable integration are visible but cannot be run until that integration is usable. Manual executions are recorded in the persistent Encounter log. The same capability is available to add-ons through `api.runtime.executeAction(...)`.

Flow authoring also gains one-click **Duplicate** controls for phases, objectives, actions, and triggers. This is especially useful for paired Aura on/off actions, repeated phase structures, and similar Trigger variants. A duplicated Trigger starts disabled as a safety measure, so it can be adjusted before it is allowed to fire beside the original.

## 0.1.0-alpha.9.7 — Runtime Event Deduplication & Director Messages

Foundry v14 can report one Combat transition through several hooks in very quick succession. Encounter Runtime now reserves round and turn observations before awaiting downstream listeners, so those overlapping hook paths collapse into one logical Runtime event. This prevents a single Combat start/round change from advancing an objective multiple times or creating duplicate GM decisions. One-shot triggers also have their own in-flight guard as a second safety layer.

The first Combat state observed by a newly bound Encounter is now treated as the baseline. Already elapsed rounds are never replayed automatically, so starting or rebinding an Encounter cannot suddenly fire historical round-end mechanics.

**Director message** actions are now visible in two places: they remain in the persistent **Encounter Log** at the bottom of Encounter Director, and they also create a GM-only Chat card with an **Open Director** button. This makes them useful even when the Director is closed during play.

## 0.1.0-alpha.9.4 — Foundry v14 Combat Round Hook Fix

GM-confirmed Trigger decisions now surface a prominent GM-only Chat card even when Encounter Director is closed. The card names the pending action(s) and includes an **Open Director** button, while the actual accept/dismiss decision remains owned by the Director.

Combat timing is now aligned with the actual Foundry v14 hook contract. `combatStart`, `combatRound`, and `combatTurn` fire before the Combat document is updated, so Encounter Forge reads the incoming `updateData.round` / `updateData.turn` values instead of the still-old document values. A post-update `combatTurnChange` path remains as a deduplicated safety net. The Director round/turn display and `combat.roundEnded` triggers now follow the Combat Tracker live.

A completed Encounter no longer traps the Director on that old Instance after the Blueprint is deployed again. A newer prepared Instance of the same Encounter on the same Scene is automatically preferred, so the newly placed Actors/Tokens expose **Start Encounter** rather than only **Undo completion**. Undo completion remains available when the GM truly wants to resume the old playthrough with its existing state.

Aura activation was hardened as well: if the matching Aura instance already exists on an Actor, Runtime only re-enables it instead of assigning a duplicate.

## 0.1.0-alpha.9.2 — Prepared Director Live Updates


The Encounter Director now stays live before combat starts as well. Prepared Encounters do not start the Encounter Runtime merely because the Director is open, but the Director passively listens for HP changes on its participant Actors/Tokens and refreshes its snapshot immediately. This keeps the architectural boundary intact: passive observation updates the GM display, while triggers and orchestration remain dormant until the Encounter Runtime is actually activated.

### Runtime Integration Actions

Encounter Flow actions can now pull real levers in the rest of the Forge Suite. An authored action can apply an Effect, enable or disable an Aura, apply an Affliction, or prepare Loot through the public APIs of the corresponding Forge modules. Encounter Forge remains the orchestrator: it stores when and where an action should happen, while the external Forge continues to own the actual rules/runtime implementation.

External actions can target one participant entry, one tactical group, or every Encounter participant. At Runtime those Blueprint targets are resolved to the concrete Token Actors in the active Encounter Instance, which keeps unlinked Tokens independent.

Each external action has a **Configure** button that opens the provider's embedded editor:

- **Effect Forge** for `effect.apply`
- **Aura Forge** for `aura.setEnabled`
- **Affliction Forge** for `affliction.apply`
- **Loot Forge** for `loot.createActor`

Aura actions carry an enabled/disabled switch, so one action can turn an authored Aura on and a duplicated action can later turn the same definition off. Loot actions can store a generated/edited reward from the embedded Loot Forge or only its generation configuration; Runtime-created Loot Actors are moved into the Encounter's Actor folder and referenced from the Encounter Instance.

If an integration is disabled or unavailable when a prepared action fires, the Runtime records the failure in the Director log and continues the Encounter instead of taking over or reimplementing the provider's behavior.

## 0.1.0-alpha.8.4 — Objective & Round-End Flow Triggers

The Flow authoring layer can now express chained encounter logic such as “increase ritual progress at the end of every round, then enter the next phase when the objective target is reached.” Triggers can listen for round-end, objective-progress, and objective-completion events and can be scoped to a specific objective directly from the UI.

The bundled Rune Altar example demonstrates this pattern.

## 0.1.0-alpha.8.3 — Encounter Library Row Polish

Saved Encounters in the left library now use a dedicated card layout with clearly separated, left-aligned name and party/threat metadata. Each row also has its own trash control, so an Encounter can be deleted directly from the library without first hunting for the editor-footer action. Deletion still uses the existing confirmation dialog.

## 0.1.0-alpha.8.2 — Encounter Library Layout Polish

The left Encounter library is now structured as a compact tool area followed by a clearly labeled saved-encounter list. New, Example, Refresh, and Director controls are contained in a two-column labeled toolbar, and the whole library column now guards against horizontal overflow when the window is resized.

PF2e encounter planning, deployment, and live encounter-direction module in early alpha development.

## 0.1.0-alpha.9.6 — Combat Scene Inference Fix

Foundry v14 can expose the current Combat without a direct Scene reference. Encounter Forge now infers the Combat Scene from its Combatants and deployed Encounter Token UUIDs, with the current canvas Scene as a safe fallback for the current Combat. This fixes the Director remaining at round 0 and round-end triggers never firing in manually created Combats whose `scene` field is null.

The temporary verbose hook logger from alpha.9.5 is off again by default. `api.runtime.debug()` remains available, and detailed hook logs can still be enabled explicitly with `globalThis.__PF2E_ENCOUNTER_FORGE_DEBUG__ = true`.

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
- Weather Forge or Item Forge Runtime actions (Effect, Aura, Affliction, and Loot actions are available in alpha.9)
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


### Director live observation

While the Encounter Director is open it observes participant document hooks and also uses a lightweight passive snapshot fallback. This keeps HP and participant availability live even for prepared Encounters without activating Runtime trigger processing.
