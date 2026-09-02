# PF2E Encounter Forge


## Part of the Forge Suite

**Encounter Forge** is part of the **Forge Suite**, a growing collection of Foundry VTT modules and add-ons built for the busy Game Master. The suite is designed to reduce preparation and bookkeeping, make common GM tasks easier, and add useful tools that help make running and playing campaigns smoother and more enjoyable.

An overview of the Forge Suite, its modules, add-ons, and shared documentation is available here:

**Forge Suite:** https://github.com/crypto-vbrthr/pf2e-forge-suite


## Feedback, Bug Reports & Feature Requests

Found a bug, have an idea for an improvement, or would like to suggest a new feature?

Feedback is always welcome. Please feel free to open a new **GitHub Issue** at any time, whether you want to report a problem, suggest a quality-of-life improvement, propose a new feature, or share an idea for how the module could be made more useful.

When reporting a bug, please include as much relevant information as possible, such as the Foundry VTT version, PF2e system version, module version, steps to reproduce the issue, and any console errors or screenshots that may help identify the problem.

Suggestions and feature requests are equally welcome. Even small ideas can lead to useful improvements.

**Open an issue here:** https://github.com/crypto-vbrthr/pf2e-encounter-forge/issues


## 0.1.0-alpha.13.8 — RC Hardening Review

This build hardens the Director/Runtime lifecycle before the first release candidate. On world ready, legacy Runtime Instances that predate frozen Blueprint snapshots are now migrated even when they are merely prepared or already completed, as long as their source Blueprint still exists. Public Instance deletion is Runtime-safe and cleans stale Scene/Combat routing references while leaving deployed Actors and Tokens untouched.

Scene organization is stricter too. Legacy orphan Instances fall back to their deployment Scene instead of appearing globally, and an open Scene-bound Director follows Foundry map changes: leaving the bound Scene removes that Encounter from view and can hand off to the destination Scene's available Encounter context. Prepared-Instance deduplication now preserves add-on/extension metadata when deciding whether a Blueprint revision is still the same deployment. The supplied Forge integration contracts were reviewed again with no blocking API mismatch found.

## 0.1.0-alpha.13.7 — Scene-Bound Encounter Blueprints

Encounter Blueprints may optionally be bound to one Foundry Scene. Bound Blueprints and their Instances appear in normal Director selection only while that Scene is being viewed, while unbound Encounters remain global. The explicit **Manage Instances** view stays global for maintenance. Deployment of a bound Blueprint is locked to its configured Scene, and missing Scene references remain visible in the editor so they can be repaired or removed.

## 0.1.0-alpha.13.6 — Stable Instance Snapshots & Blueprint Archive

Every concrete Encounter Instance now carries a frozen snapshot of the Blueprint it was deployed from. Later Blueprint edits therefore affect only future deployments, while an existing playthrough keeps its original phases, participants, triggers, and actions. Snapshot-backed historical Instances can still be inspected in the Director even if their source Blueprint has since been deleted. Completed and aborted Instances are read-only final states; completed Encounters can be explicitly reopened before further play.

Used Encounter Blueprints can now be moved into an **Archive** from the Encounter Forge library and restored later. Archived Blueprints remain available as reference material but are intentionally hidden from Director preparation and from the Instance Manager's new-run choices, and they cannot be deployed until restored. Prepared-Instance deduplication also compares actual Blueprint content, so editing a Blueprint before deploying it again creates the required fresh Instance instead of reusing stale preparation data.

## 0.1.0-alpha.13.5 — Prepared Instance Deduplication

Deploying the same Blueprint to the same Scene repeatedly from the Encounter editor now reuses the newest matching `prepared` Runtime Instance instead of producing duplicate Instances and duplicate deployment documents. If a GM intentionally wants another playthrough of the same Blueprint on that Scene, **Manage Instances → New Instance** remains the explicit path and forces a fresh deployment. API callers can likewise opt in with `forceNewInstance: true`.

## 0.1.0-alpha.13.4 — Blueprint-to-Instance Director Recovery

Encounter Director now treats saved Blueprints as valid sources when no Runtime Instance exists. The Instance Manager lists persistent Blueprints alongside stored Runtime Instances and can prepare a fresh Instance through the normal deployment workflow, then opens it directly in the Director. This prevents deleting historical/prepared Runtime data from leaving the Director at a dead end while the Encounter Blueprint still exists.

## 0.1.0-alpha.13.1 — Live Region Picker & Trigger Layout

- Foundry Regions created while Encounter Forge is open are discovered automatically and become selectable without reopening the editor.
- Existing Scene Regions can be adopted as logical Encounter Zones from the Zones & Regions toolbar or directly from a spatial Trigger's Zone dropdown.
- Linked Trigger action checkboxes now stay compact and directly beside their labels.

## 0.1.0-alpha.13 — Scene Region Spatial Triggers

Encounter Blueprints can now attach reusable **logical zones** to Foundry Scene Regions and react when Tokens cross those boundaries. A Region Trigger chooses a zone plus whether it should react to any Token, player-character Tokens, or deployed Encounter participants. The normal participant filter can narrow the event further to a specific creature or participant template.

Spatial conditions expose the live occupancy of the Region that produced the event: total Tokens, player characters, Encounter participants, and members of a selected tactical group. This enables encounter logic such as **two PCs reach an altar**, **a boss enters an escape area**, or **the final defender leaves a ward** without hard-coding Scene coordinates into the Runtime.
These occupancy fields are intentionally available only on Region enter/exit Triggers, because their counts belong to the Region that produced the current spatial event.

Encounter Forge observes Foundry Region membership directly and keeps a per-Token membership snapshot while the Runtime is active. Token movement, creation/deletion, and Region geometry/document changes can therefore produce normalized `region.tokenEntered` / `region.tokenExited` events. The Blueprint stores a Region UUID plus its name snapshot; UUID matching is preferred and the stored Region name provides a same-named portability fallback when a Blueprint is reused on another Scene.

## 0.1.0-alpha.12.2 — Non-blocking Schedule Chat Fix

Delayed-action Chat is now deliberately outside the Runtime scheduling transaction. Encounter Forge persists the schedule first, emits the Runtime queue update, and only then launches the GM Chat notification without awaiting Chat rendering. A slow or re-entrant Foundry Chat render can therefore no longer stall the Trigger/action resolution that owns the scheduled action. The Chat card also carries a frozen Encounter Instance reference rather than reading whichever Runtime Instance happens to be active later.


## 0.1.0-alpha.12.1 — Delayed Action Chat Clarity

Delayed actions now explain their timing in GM Chat. A Trigger or Director command can schedule an action immediately while its actual effect remains deferred until the configured number of completed combat rounds or turns has elapsed. Encounter Forge posts a GM-only Chat card when that schedule is created, including the remaining delay and an **Open Director** button. GM-decision cards also mark delayed prepared actions before acceptance, so "approve now" is visually distinct from "takes effect now."

## 0.1.0-alpha.12 — Delayed & Scheduled Actions

Encounter actions can now wait for the battlefield clock instead of firing the instant a Trigger resolves. Each action chooses **Immediately**, **After completed combat rounds**, or **After completed combat turns**, with a delay from 1 to 999. The timing is part of the reusable action, so automatic Triggers, GM-confirmed decisions, and manual Director controls all respect the same schedule.

A delayed action is stored persistently in the Encounter Instance rather than held in a browser timer. The Runtime counts normalized `combat.roundEnded` or the new `combat.turnEnded` events, freezes those counters while the Encounter is paused, and resumes them when play continues. Scheduling an action from the very round/turn-end event that created it starts counting only with the **next** completed round/turn, avoiding an off-by-one execution.

Encounter Director shows pending work in a new **Scheduled Actions** section with the remaining countdown. The GM can let the clock run, execute an item immediately, or cancel it. This supports patterns such as “the chamber collapses in 2 rounds,” “reinforcements arrive after 3 completed turns,” or a delayed phase transition after a confirmed Trigger.

The Runtime API exposes `cancelScheduledAction(...)` and `executeScheduledActionNow(...)`; Flow metadata exposes `actionTimingModes`. Blueprints without timing data remain immediate and therefore retain their previous behavior.

## 0.1.0-alpha.11.2.5 — Directional HP Trigger Events

HP-sensitive encounters can now react to the **direction** of a participant's HP change instead of treating damage and healing as the same signal. Trigger authoring offers **Participant HP decreased** and **Participant HP increased** in addition to the existing general **Participant HP changed** event.

This makes patterns such as “when Burgel loses HP, but only if all Defenders are at 50% HP or lower” precise: use **Burgel → HP decreased** as the event and keep the tactical-group condition for the Defenders. Healing Burgel no longer wakes that Trigger. The existing **HP changed** event remains available when both directions should count.

Encounter Runtime seeds the currently deployed Token/Actor HP when it binds and remembers the last observed value per concrete participant. Each directional event also carries the previous and current HP snapshot. Duplicate Foundry hooks for the same synthetic/unlinked Token Actor update are collapsed before the directional event is emitted.

The directional events intentionally describe **numeric HP movement**, not a generic “damage taken” claim. If temporary HP absorbs a hit and the participant's actual HP value does not fall, **HP decreased** does not fire.

## 0.1.0-alpha.11.2.4 — Interactive Token Participant Mapping Fix

Manual/interactive Scene placement now reconciles each created Token by the stable Encounter participant id stored in the Token flags instead of assuming Foundry returns Token documents in source order. This prevents shuffled placement results from cross-wiring a participant's `tokenUuid` with another creature's Token, which could otherwise make live HP/group-state conditions and participant-specific Runtime actions inspect the wrong combatant.

Group-member conditions continue to operate on every **concrete** participant assigned to the selected tactical group. A participant template with quantity 2 contributes two members, and any additional participant assigned to the same group is part of `All` evaluation too.

## 0.1.0-alpha.11.2.3 — Group Member State Conditions & Context Clarity

Trigger conditions can now inspect the live state of a **tactical group** rather than only one named participant or simple group counts. New group-member fields cover current/max HP, HP percentage, HP below maximum, full HP, defeated state, and active state. Every group-member condition selects its own group and an explicit evaluation mode: **At least one**, **All**, or **At least X** members must satisfy the comparison.

For example, a Trigger can be scoped to **Burgel: HP changed** and use the condition **Group: HP % [Defenders · All] ≤ 50**. The action then runs only when Burgel's HP-change event occurs and every current member of the Defenders group is at 50% HP or lower. Switching the evaluation to **At least one** makes a single matching Defender sufficient, while **At least X** allows thresholds such as two of three guards.

The condition editor also hides context controls that are irrelevant to the selected fields. The shared Objective selector appears only for objective-context conditions, and the shared Group selector only for legacy group-count conditions. Group-member HP/state conditions carry their own Group selector directly in the condition row, removing the ambiguity between event HP values and group state.

Add-ons can discover these capabilities through `api.flow.groupParticipantContextFields` and `api.flow.groupMatchModes`; participant and boolean condition metadata are exposed there as well.

## 0.1.0-alpha.11.2.2 — Configurable Condition Logic Labels

Trigger condition combination labels are now a personal display preference. In Foundry's module settings, **Condition logic display** can be switched between **Written out** (`All must match` / `At least one must match`) and the compact logical notation **AND / OR**. The setting is client-scoped, so it changes only how that user sees the Flow editor and never modifies saved Encounter Blueprints.

The **When:** condition preview follows the selected style too, and an open Encounter Forge window rerenders immediately when the preference changes.

## 0.1.0-alpha.11.2.1 — Blueprint Width & Trigger Condition Layout Fix

The Blueprint editor now stays inside its right-hand container even when participant-state conditions add an extra participant selector to a Trigger. Trigger condition rows no longer impose fixed minimum column widths. Instead they use a compact two-line responsive grid, with field/context on the first line and operator/value on the second where needed.

Flow controls are explicitly allowed to shrink inside CSS Grid cells, and the editor clips accidental horizontal overflow while preserving vertical scrolling. This prevents a dense Trigger from widening the entire Blueprint pane beyond the Encounter Forge window.

## 0.1.0-alpha.11.2 — Participant State Conditions

Trigger conditions can now look sideways across the battlefield instead of being limited to the creature that caused the event. A Trigger may still be scoped to **Creature A: HP changed**, while each condition independently selects another Blueprint participant and inspects that participant's live state. This directly supports patterns such as **Creature B has HP below maximum OR Creature C has HP below maximum → execute action**.

Participant context currently exposes current/max HP, HP percentage, HP below maximum, full HP, defeated state, and active state. Boolean checks use Yes/No controls, and the readable **When:** preview includes the referenced participant's name. If a Blueprint participant represents several quantity-expanded creatures, one participant-state condition succeeds when **any** concrete member of that template satisfies the comparison.

Live HP is read from the deployed Token/Actor through `ParticipantService`; Encounter Forge deliberately does not persist a duplicate HP copy. Flow analysis requires valid participant references and catches stale references before the Blueprint can be saved. Add-ons can inspect the supported participant condition fields through `api.flow.participantContextFields`.

## 0.1.0-alpha.11.1 — Flow Entry Visual Separation

Dense Flow authoring screens are easier to scan. Individual **Phase**, **Objective**, **Action**, and **Trigger** entries now have a clearly visible two-pixel blue/violet outline, a very subtle category tint, and more space between neighboring entries. The outline becomes stronger while an entry is hovered or one of its fields has focus, making it easier to keep track of the block currently being edited without changing any Flow behavior or saved Blueprint data.

## 0.1.0-alpha.11 — Advanced Encounter Logic

Trigger authoring now supports real condition composition rather than a flat list of implicit checks. Conditions can be evaluated as **ALL / AND** or **ANY / OR**, and every individual condition can be inverted with **NOT**. Existing encounters keep their previous behavior because an omitted combination mode still means ALL.

Conditions can still read the event which woke the Trigger, such as HP percentage or the completed round. They can now also inspect persistent **Encounter context**: the current round, turn, and phase; the progress, target, or state of a selected objective; counts for a selected tactical group; and counts across all Encounter participants. This makes patterns such as “two ritualists are defeated AND the ritual is not complete” or “round 4 has started OR only one defender remains” directly authorable without helper objectives.

Objective and Group context are selected by name in the Trigger editor. Current-phase comparisons also use a Phase selector rather than requiring an internal ID. Beneath the condition editor, Encounter Forge renders a compact **When:** sentence that resolves those references into readable names.

Aggregate defeat/removal conditions are evaluated against the state transition carried by the current Runtime event, so the creature that was just defeated is already included in the count for that Trigger evaluation. Participant filters also understand quantity-expanded participants: a Trigger scoped to a Blueprint entry with quantity 3 can react to any of its three concrete Runtime participants.

Flow analysis now catches missing context references and stale Phase/Objective/Group references, and warns about contradictory numeric ALL conditions before they become silent table-time puzzles. Add-ons can inspect the supported modes through `api.flow.conditionModes`.


### Completed Encounter cleanup

Encounter Director shows **Delete completed** whenever historical Instances with status `completed` exist. One confirmation removes every completed Runtime Instance while preserving deployed Actors and Tokens. The same bulk action is available in **Manage Instances**. Other statuses, including `aborted`, are not included.

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

### Scene-bound Encounters

Encounter Blueprints can optionally be bound to a specific Foundry Scene. Unbound Blueprints remain globally available. A bound Blueprint and Runtime Instances created from it are offered by Encounter Director only while the GM is viewing that Scene. The deployment dialog also locks a bound Blueprint to its configured Scene, reducing accidental preparation on the wrong map.

## Encounter Director

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
