## 0.1.0-alpha.13.7

- Added optional Scene binding for Encounter Blueprints.
- Scene-bound Blueprints and their Runtime Instances are offered by Director only while the bound Scene is currently viewed.
- Director selection uses a Scene-filtered Instance Manager, while the explicit management view remains global.
- Deployment locks Scene-bound Blueprints to their configured Scene and rejects mismatched API deployments.
- Scene binding is shown in the Blueprint library and Instance Manager; missing bound Scenes can be repaired or unbound in the editor.

# Changelog

## 0.1.0-alpha.13.6 - Snapshot Stability, Read-Only History & Blueprint Archive

### Added
- Every newly deployed Encounter Instance now freezes a full Blueprint snapshot for that concrete playthrough. Runtime and Director therefore remain stable if the source Blueprint is edited or deleted later.
- Legacy Instances without a snapshot are upgraded opportunistically when Runtime can still resolve their source Blueprint.
- Encounter Blueprints can now be **archived** and restored from the Encounter Forge library. Archived Blueprints stay available for reference but are excluded from Director preparation and Instance Manager **New Instance** choices until restored.
- Public Blueprint API now exposes `archive(...)`, `restore(...)`, and `isArchived(...)`.

### Fixed
- Prepared-Instance deduplication now compares the stored Blueprint snapshot with the current encounter content. Editing a Blueprint and deploying it again no longer reuses a stale prepared Instance.
- Snapshot-backed historical Instances remain openable in Encounter Director even after their original Blueprint is deleted. Only legacy Instances without either source Blueprint or snapshot are considered orphaned.
- Completed and aborted Encounter Instances are now read-only in the Director. Phase changes, objective changes, decisions, and scheduled-action controls remain locked until the GM explicitly reopens the Encounter. Runtime mutations are guarded as well, including changes arriving through document hooks.
- Deleting all completed Instances while viewing one of them now returns to normal Director selection when active Blueprints still exist instead of closing into an empty state.

### Changed
- Archived Blueprints are visually separated into an **Archive** section in Encounter Forge. They cannot be deployed while archived and can be restored with one action.
- Blueprint metadata now records `archivedAt`, while Runtime-relevant deduplication deliberately ignores metadata-only changes such as archiving.

## 0.1.0-alpha.13.5 - Prepared Instance Deduplication

### Fixed
- Repeated deployment of the same Encounter Blueprint to the same Scene no longer silently creates another `prepared` Runtime Instance with another set of materialized Actors/Tokens. The newest matching prepared Instance is reused instead.
- Duplicate prevention runs before Actor-folder resolution and participant materialization, so a repeated editor deployment is a true no-op rather than partially creating deployment documents.
- The Blueprint editor reports that the existing prepared Instance was reused instead of showing a misleading zero-Actor deployment summary.

### Changed
- **Manage Instances → New Instance** is now the explicit opt-out from deduplication. That action passes `forceNewInstance: true`, allowing the GM to intentionally prepare another playthrough of the same Blueprint on the same Scene.
- Public deployment callers can use the same `forceNewInstance: true` option when an intentional duplicate preparation is required.

## 0.1.0-alpha.13.4 - Blueprint-to-Instance Director Recovery

### Fixed
- Opening Encounter Director no longer dead-ends with **No Encounter Instance available** after all stored Runtime Instances were deleted while Encounter Blueprints still exist.
- The Encounter Instance Manager now also lists persistent Encounter Blueprints and can prepare a fresh Runtime Instance from any valid Blueprint through the normal deployment dialog.
- A freshly deployed Instance is opened automatically in Encounter Director. Multiple Blueprints therefore remain an explicit GM choice instead of being selected silently.
- Blueprint-driven preparation still uses the normal deployment workflow so participant Actors, Scene Tokens, Combat preparation, and Runtime references are created consistently rather than producing an unusable bare Instance.

## 0.1.0-alpha.13.3 - Completed Encounter Cleanup

### Added
- Encounter Director now offers **Delete completed** whenever completed Encounter Instances exist, with the current count shown directly on the button.
- The cleanup action removes all stored Instances whose status is exactly `completed` after one confirmation. Prepared, active, paused, aborted, and orphaned non-completed Instances are left untouched.
- The Encounter Instance Manager exposes the same bulk cleanup action for storage maintenance.
- If the currently displayed completed Instance is part of the cleanup, Encounter Director closes that stale view and immediately returns to normal Director selection for any remaining Encounter Instances.
- Bulk cleanup preserves deployed Actors and Tokens, matching individual Instance deletion behavior.

## 0.1.0-alpha.13.2 - Director Instance Selection & Cleanup

### Added
- Opening Encounter Director now asks the GM which Encounter Instance to load when multiple prepared/runnable Instances are available instead of silently choosing one by recency or Scene context. A currently active or paused Runtime still opens directly.
- Added an Encounter Instance Manager showing stored prepared, active, paused, completed, and aborted Runtime Instances with Blueprint, Scene, status, and modification metadata.
- The Director toolbar now exposes **Manage Instances** so historical Runtime data can be reviewed and cleaned up at any time.
- Instances whose referenced Blueprint no longer exists are clearly marked as **orphaned**. They cannot be opened in the Director, can be deleted individually, and can be removed in bulk with **Delete orphaned**.
- Deleting an Instance removes only the stored Runtime Journal entry. Deployed Actors and Tokens are intentionally preserved. If the deleted Instance is currently bound to Encounter Runtime, the Runtime is stopped first.
- Public UI API now exposes `api.ui.openInstanceManager(...)`.

### Changed
- Director auto-selection now treats multiple live/prepared Instances as ambiguous and defers to the GM. Historical Instances are used as fallback only when no live/prepared Instance exists.

## 0.1.0-alpha.13.1 - Live Region Picker & Trigger Checkbox Layout

### Fixed
- Foundry Scene Regions created while Encounter Forge is already open are now picked up automatically. The editor listens for Region creation/deletion, Region renames, and viewed-Scene changes, preserves the current form state, and refreshes the Region choices without requiring the Encounter editor to be closed and reopened.
- Region discovery now uses the current Canvas Scene with Foundry Scene-collection fallbacks and the Scene's embedded Region collection, making the picker more tolerant of Foundry v14 Scene state.
- Linked-action checkboxes in Trigger cards no longer inherit the flow panel's full-width input rule. Checkboxes now remain compact and sit directly beside their labels.
- Removed a duplicate "Add Trigger" button introduced in the alpha.13 template.

### Added
- The Zones & Regions panel now has a quick picker to adopt an existing Foundry Region directly as a logical Encounter Zone.
- Spatial Trigger zone dropdowns also list currently unbound Foundry Regions. Selecting one automatically creates/binds the logical Zone and assigns it to that Trigger in one step. This includes Regions created during Encounter editing.

## 0.1.0-alpha.13 - Scene Region Spatial Triggers

### Added
- Encounter Blueprints can define reusable **logical zones** and bind each one to a Foundry Scene Region on the currently viewed Scene. The binding stores both the Region UUID and a name snapshot, so exact deployment bindings stay deterministic while same-named Regions can be used as a portability fallback on another Scene.
- Added normalized `region.tokenEntered` and `region.tokenExited` Runtime/Trigger events. Region membership is observed for both Encounter participants and other Scene Tokens without requiring Encounter Forge to install its own Region Behavior type.
- Spatial Triggers choose a logical zone plus a Token scope: **any Token**, **player character**, or **Encounter participant**. The existing participant filter can narrow an Encounter-participant spatial Trigger to one specific Blueprint participant.
- Spatial condition fields can count all Tokens, player-character Tokens, Encounter participants, or members of a selected tactical group currently inside the event Region. This supports patterns such as “at least two PCs reach the altar,” “the boss enters the escape zone,” and “the last defender leaves the ward.”
- Region-occupancy condition fields are offered only for Region enter/exit Triggers and Flow validation rejects them on unrelated events, avoiding a misleading zero-value context.
- Region membership is seeded when the Runtime starts and diffed on Token movement/creation/deletion. Region creation, editing, and deletion on the Encounter Scene also trigger a membership rescan so boundary edits can become spatial enter/exit signals.
- Public Flow metadata now exposes `regionEventTypes` and `regionTokenScopes`.

### Validation
- Flow analysis requires every spatial Trigger to reference an existing logical zone, warns when that zone has no Foundry Region binding, and validates the Region Token scope.

## 0.1.0-alpha.12.2 - Non-blocking Schedule Chat Fix

### Fixed
- Delayed-action Chat announcements are now strictly informational and no longer awaited by the Runtime scheduling transaction. `ChatMessage.create()` can therefore not hold a Trigger/action resolution open while Foundry render/document hooks run.
- Scheduled-action Chat cards use a frozen Instance/action/schedule snapshot so a later Runtime switch cannot retarget their Director button or message flags.
- Added a regression test where Chat delivery never resolves; the delayed action must still be persisted immediately and the Runtime event must complete normally.


## 0.1.0-alpha.12.1 - Delayed Action Chat Clarity

### Added
- Scheduling a delayed action now creates a GM-only Encounter Director Chat card that explicitly says the action has been **scheduled now but will execute later**, including the remaining configured combat-round or combat-turn delay. The card links back to the Director's Scheduled Actions queue.
- GM-decision Chat cards annotate every delayed prepared action before the decision is accepted, so approving a Trigger cannot be mistaken for immediate mechanical execution.

### Changed
- Prepared actions in GM-decision Chat are rendered as individual entries, allowing immediate and delayed actions in the same decision to communicate their timing independently.

## 0.1.0-alpha.12 - Delayed & Scheduled Actions

### Added
- Every authored Encounter action can now execute **immediately**, after a configurable number of **completed combat rounds**, or after a configurable number of **completed combat turns**. Timing belongs to the action itself, so the same delayed behavior is respected whether the action is reached by an automatic Trigger, an accepted GM decision, or manual Director execution.
- Encounter Runtime persists pending schedules in the Encounter Instance. Countdown progress survives Runtime persistence/restoration and pauses while the Encounter is paused.
- Added the normalized `combat.turnEnded` Runtime/Trigger event. The first observed turn is only a baseline; a turn-end signal is emitted only when a previously observed combatant turn actually completes.
- Encounter Director now shows a **Scheduled Actions** queue with the remaining round/turn countdown. The GM can execute a scheduled action immediately or cancel it.
- Public API additions: `api.flow.actionTimingModes`, `api.runtime.cancelScheduledAction(...)`, and `api.runtime.executeScheduledActionNow(...)`.

### Changed
- Delayed execution is handled at the shared `ActionService` boundary, so phase, objective, Director-message, Effect, Aura, Affliction, and Loot actions all use one scheduling model rather than provider-specific timers.
- Scheduling from a Trigger that fires on a round/turn end starts counting **after that event**, preventing the event that created the schedule from also consuming its first delay step.
- Completed-round and completed-turn counters are persisted only while relevant scheduled work exists; paused Encounters do not consume countdown steps.

### Validation
- Flow analysis validates delayed action timing modes and requires a delay from 1 to 999 for non-immediate actions.

## 0.1.0-alpha.11.2.5 - Directional HP Trigger Events

### Added
- Added `participant.hpDecreased` / **Participant HP decreased** and `participant.hpIncreased` / **Participant HP increased** Trigger events alongside the existing general `participant.hpChanged` event. Encounter authors can now distinguish HP loss from healing or other HP gains without approximating direction through a percentage condition.
- Directional HP events include both the current and previous HP value/max/percentage in their Runtime payload for precise downstream logic and add-on use.

### Changed
- EventService seeds live participant HP when it binds to an Encounter and tracks the last observed HP per concrete participant. This gives HP direction a stable baseline even when Tokens were manually adjusted before combat begins.
- Synthetic/unlinked Token Actor updates are deduplicated by participant and HP snapshot before Runtime events are emitted, preventing one Foundry document change from creating duplicate directional HP events through overlapping hooks.
- Adding a condition to any HP event (`changed`, `decreased`, or `increased`) defaults to an HP-percentage condition just like the original HP-changed event.

### Clarified
- “HP decreased” means the participant's numeric PF2e HP value became lower. It deliberately does not claim that a damage event occurred, so temporary HP absorption or other system-specific damage processing is not misreported as HP loss when the actual HP value did not decrease.

## 0.1.0-alpha.11.2.4 - Interactive Token Participant Mapping Fix

### Fixed
- Fixed interactive/manual Scene deployment assuming that Foundry returns created Token documents in the same order as the submitted Token sources. Foundry may return them in a different order, which could cross-wire a participant's stored `tokenUuid` with another creature's Token.
- Deployment now reconciles returned Tokens through the stable Encounter participant id already stamped into each Token flag, with array order retained only as a compatibility fallback. This keeps live HP/state conditions, Director participant snapshots, and participant-specific Runtime targeting attached to the correct Token.
- Added a regression test that deliberately returns manually placed Tokens in a shuffled order and verifies that every Encounter participant still receives the correct Token UUID and placement data.

### Clarified
- Group-member conditions evaluate every concrete Encounter participant assigned to the selected tactical group. A Blueprint entry with quantity 2 contributes two concrete members, and any other participant assigned to that same group is included as well.

## 0.1.0-alpha.11.2.3 - Group Member State Conditions & Context Clarity

### Added
- Added **group-member state conditions** for current/max HP, HP percentage, HP below maximum, full HP, defeated state, and active state. Each such condition selects its own tactical group.
- Group-member conditions have an explicit evaluation mode: **At least one**, **All**, or **At least X** members must satisfy the comparison. This supports patterns such as “Burgel's HP changes AND all Defenders are at 50% HP or less.”
- Added public `api.flow.groupParticipantContextFields` and `api.flow.groupMatchModes` metadata. The previously documented participant/boolean condition metadata is now exposed as well.

### Changed
- Objective and shared Group context selectors are now shown only when at least one authored condition actually uses that context. Event-payload conditions such as `HP %` no longer display unrelated Objective/Group selectors beside them.
- Group-member HP/state conditions use a per-condition Group selector, so different conditions in the same Trigger can inspect different groups.
- The readable **When:** preview includes both the selected group and its evaluation mode.
- Trigger condition rows remain width-safe with responsive layouts for participant and group-member contexts.

## 0.1.0-alpha.11.2.2 - Configurable Condition Logic Labels

### Added
- Added a client-side **Condition logic display** module setting. Each GM/user can choose whether Trigger combination choices are written out (`All must match` / `At least one must match`) or shown as the compact logical operators `AND` / `OR`.
- The preference is presentation-only and is not stored in Encounter Blueprints. Changing it rerenders an open Encounter Forge window immediately.
- The readable Trigger condition preview follows the selected operator style as well, using `AND` / `OR` in compact mode.

## 0.1.0-alpha.11.2.1 - Blueprint Width & Trigger Condition Layout Fix

### Fixed
- Fixed participant-state Trigger conditions forcing the Encounter Blueprint pane wider than its container.
- Reworked Trigger condition rows into a responsive two-line grid with zero-minimum columns instead of fixed rem-based minimum widths.
- Added explicit min/max-width containment for Flow controls, entry cards, lists, and Blueprint editor sections so long selects cannot create horizontal layout overflow.

## 0.1.0-alpha.11.2 - Participant State Conditions

### Added
- Trigger conditions can now inspect a **specific participant other than the participant that emitted the event**. Each participant-state condition owns its own participant reference, so OR expressions such as “Creature B has lost HP OR Creature C has lost HP” are directly authorable while a Trigger remains scoped to Creature A's HP-change event.
- Added participant-context fields for current HP, maximum HP, HP percentage, HP below maximum, full HP, defeated state, and active state. Boolean participant conditions use explicit Yes/No values in the editor.
- Participant-state conditions resolve live Token/Actor snapshots through `ParticipantService`; native PF2e HP remains owned by the Actor and is not duplicated into Encounter Instance persistence. Quantity-expanded participant templates use ANY-member semantics for an individual condition.
- `api.flow` now exposes `participantContextFields` and `booleanConditionFields`.

### Changed
- Flow analysis requires every participant-state condition to reference an existing Blueprint participant and reports stale/missing references before saving.
- Removing a participant also clears condition references and participant-targeted action references that pointed at it.
- One-shot Trigger reservation now happens before asynchronous participant snapshot evaluation, preserving duplicate-hook protection while live participant conditions are evaluated.

## 0.1.0-alpha.11.1 - Flow Entry Visual Separation

### Changed
- Phase, Objective, Action, and Trigger entries in Flow authoring now use clearly visible blue/violet two-pixel borders, subtle category-tinted backgrounds, and slightly larger spacing between adjacent entries.
- Hovering or focusing an entry strengthens its outline so the currently edited block remains easy to track in dense encounters.

## 0.1.0-alpha.11 - Advanced Encounter Logic

### Added
- Trigger conditions can now be combined as **ALL (AND)** or **ANY (OR)**, with an optional per-condition **NOT** inversion. Existing Blueprints remain equivalent because the default is ALL.
- Added persistent Encounter-context condition fields for current round/turn/phase, objective progress/target/state, tactical-group counts, and encounter-wide participant counts. These conditions can be evaluated on any normalized Runtime event instead of only reading that event's payload.
- Added explicit Objective and tactical Group context selectors for state-based conditions. Group conditions support total, defeated, available, and remaining member counts.
- Added a readable **When:** preview beneath each Trigger so complex condition logic can be sanity-checked without translating field IDs mentally. Current-phase conditions use a Phase selector instead of requiring an internal ID to be typed manually.
- Public `api.flow` metadata now exposes `conditionModes` in addition to fields/operators.

### Changed
- Participant-scoped Triggers now match both the Blueprint participant template ID and concrete quantity-expanded Runtime participant IDs. A Trigger authored for one three-creature participant entry therefore reacts to any of its concrete members.
- Group/participant aggregate conditions project the participant state transition carried by the current event before evaluation. A `participant.defeated` event therefore counts that new defeat immediately, even though the persisted participant state update follows the normalized event.
- Flow analysis now validates missing Objective/Group condition contexts, stale condition references, unknown condition modes, phase-value references, and warns about contradictory numeric ALL conditions such as `round >= 4` together with `round <= 2`.

## 0.1.0-alpha.10 - Director Manual Actions & Flow Authoring Comfort

### Added
- Added a **Prepared Actions** panel to Encounter Director. While an Encounter is active or paused, the GM can execute any authored action directly without waiting for its Trigger.
- Manual Director execution uses the same Encounter Runtime `ActionService` path as triggered actions, so phase changes, objective progress, Director messages, Effects, Auras, Afflictions, and Loot keep their normal ownership and integration boundaries.
- Added `api.runtime.executeAction(actionOrId, options)` for add-ons and external Director surfaces.
- Manual action execution is persisted in the Encounter log and emits the normal Director refresh path.
- Added duplicate controls for phases, objectives, actions, and triggers in Flow authoring. Duplicated triggers start disabled to avoid accidentally running both the source and its copy.

### Changed
- Director action rows show action type, a short target/result summary, and whether a required external Forge integration is currently unavailable.
- Prepared actions are intentionally disabled before Encounter start and after completion; the Director remains a control desk for the running or paused Encounter rather than a pre-start mutation surface.

## 0.1.0-alpha.9.7 - Runtime Event Deduplication & Director Messages

### Fixed
- Fixed Foundry v14 delivering overlapping `combatStart`, `updateCombat`, and `combatTurnChange` signals for the same round transition causing duplicate Runtime events, repeated objective progress, and multiple GM decision Chat cards.
- Round/turn observations are now reserved synchronously before Runtime listeners are awaited, making the multiple Foundry signal paths idempotent.
- One-shot Triggers now reserve themselves while an earlier matching event is still being handled, preventing parallel duplicate events from creating multiple pending decisions.
- The first observed Combat round now establishes a baseline only; Encounter Forge no longer retroactively synthesizes already elapsed round-end events when binding to an existing Combat.
- `updateCombat` now consumes `changed.round` / `changed.turn` directly when present instead of depending on document timing.

### Changed
- `Director message` actions now remain in the persistent Encounter log and additionally create a prominent GM-only Chat message with an **Open Director** button, so authored Director narration is visible even when the Director window is closed.

## 0.1.0-alpha.9.6 - Combat Scene Inference Fix

### Fixed
- Fixed Encounter Runtime rejecting the active Foundry Combat when Foundry v14 exposes that Combat without a direct Scene reference (`combat.scene` / source scene is `null`).
- Combat/Encounter matching now infers the Scene from Combatant Token references first, then from direct overlap with the Encounter Instance Token UUIDs, and finally from the currently viewed canvas Scene for the current Combat.
- Manual Combats created from Encounter Tokens are now adopted by the Runtime even when the Combat document itself has no Scene ID, so Director round/turn counters and `combat.roundEnded` triggers advance normally.
- The diagnostic API remains available via `api.runtime.debug()`, while per-hook console spam from the temporary debug build is now disabled unless `globalThis.__PF2E_ENCOUNTER_FORGE_DEBUG__ = true` is set manually.

## 0.1.0-alpha.9.5-debug

### Debug
- Added targeted console diagnostics for Foundry Combat hooks and Encounter Runtime combat matching.
- Logs `updateCombat`, `combatStart`, `combatRound`, `combatTurn`, and `combatTurnChange` with received round/turn payloads and the exact reason a Combat is accepted or rejected.
- Added `game.modules.get("pf2e-encounter-forge").api.runtime.debug()` for a compact runtime/combat snapshot.


## 0.1.0-alpha.9.4 - Foundry v14 Combat Round Hook Fix

### Fixed
- Fixed live Combat round and turn tracking against the actual Foundry v14 hook signatures. `combatStart`, `combatRound`, and `combatTurn` fire before the Combat document update, so Runtime now consumes the new values from the hook `updateData` argument instead of reading the still-old `combat.round` / `combat.turn` values.
- The Encounter Director round/turn counters now advance with the Foundry Combat Tracker, and `combat.roundEnded` triggers reliably fire as rounds are completed.
- Added the post-update `combatTurnChange` hook as a deduplicated fallback for systems/modules which customize Combat advancement.

## 0.1.0-alpha.9.3 - Decision Chat, Combat Round Tracking & Redeployment Recovery

### Fixed
- Encounter Runtime now binds to the current Foundry Combat on the Encounter Scene when no Combat was prepared by Encounter Forge, so round/turn tracking also works with a Combat created manually after deployment.
- Added deduplicated `combatStart`, `combatRound`, and `combatTurn` hook handling in addition to `updateCombat`; round-end events are reconstructed deterministically even when Foundry/PF2e does not expose the expected update payload shape.
- Completed Runtime bindings no longer pin the Director to an old playthrough after the same Encounter is deployed again. A newer prepared Instance on the same Scene/Blueprint is preferred automatically, including while an already-open Director is observing the completed run.
- Fixed the Director passive-observation timer being inadvertently reset during certain rerenders.
- Aura enable actions now reuse and re-enable an existing matching Aura instance instead of assigning the same Aura Definition repeatedly.

### Added
- GM-confirmed Trigger decisions now create a prominent GM-only Chat message showing the pending decision and prepared action names. The message includes an **Open Director** button, so the GM is notified even when the Director window is closed or hidden behind other Foundry UI.
- Encounter Runtime can adopt and stamp a current same-Scene Combat when the Encounter is started manually, persisting the discovered Combat UUID and current round/turn into the Encounter Instance.

### Changed
- Newly authored Triggers now default to **Combat round ended** rather than **Combat round changed**, matching common round-counter mechanics such as ritual progress.
- The former “Combat round changed” label is now “New combat round started” / “Neue Kampfrunde begonnen” to distinguish it clearly from an actual end-of-round trigger. Existing Blueprints retain their authored event selection.

## 0.1.0-alpha.9.2 - Director Live HP Observation Hardening

### Fixed
- Fixed HP-change detection for Foundry/PF2e update hooks that provide nested change objects instead of flattened dotted keys.
- Added synthetic Token Actor matching so unlinked Encounter Tokens are resolved back to their concrete Encounter participant during live updates.
- Added a lightweight 400 ms passive Director observation fallback while the Director is open. It compares live participant snapshots and refreshes only when visible participant state actually changes, so prepared Encounters stay live even when a system update bypasses the expected document hook shape.
- The passive observer remains display-only and does not start Encounter Runtime, evaluate triggers, advance phases, or execute actions.


## 0.1.0-alpha.9.1 - Prepared Director Live Updates

### Fixed
- Encounter Director now refreshes participant HP live even while an Encounter Instance is still `prepared` and the Encounter Runtime has not been started yet.
- Added passive Director-side Foundry document observers for relevant participant Actor/Token HP changes and defeated-state changes; these observers only refresh the UI and do not execute Encounter triggers or mutate Runtime state.
- Passive observers are cleaned up when the Director closes, while active Runtime-driven `director.changed` updates remain the primary path once the Encounter is running.

## 0.1.0-alpha.9 - Runtime Integration Actions

### Added
- Added authored Runtime actions for `effect.apply`, `aura.setEnabled`, `affliction.apply`, and `loot.createActor`.
- Added participant, tactical-group, and all-participant target scopes for external Forge actions; concrete targets are resolved from the Encounter Instance at execution time, preferring Token Actors for unlinked Tokens.
- Added a dedicated integration-action editor host using the public embedded editors from Effect Forge, Aura Forge, Affliction Forge, and Loot Forge.
- Added Runtime delegation to the public APIs of the four external Forges without duplicating their Effect, Aura, Affliction, or loot-generation logic.
- Added persistent Director log entries for successful and failed external actions. Integration failures are contained and reported instead of crashing the Encounter Runtime.
- Loot actions can reuse a pre-generated embedded Loot Forge result or generate from the stored configuration at Runtime, create a Loot Actor, place it in the Encounter Actor folder, and remember the created Actor UUID in the Encounter Instance.

### Changed
- Flow validation now checks external-action target references and requires the appropriate stored Effect/Aura/Affliction definition before saving.
- Action-type choices are gated by the Encounter Forge integration manager; already-authored actions remain readable if an integration later becomes unavailable.
- Core integration capability reporting now marks Effect, Aura, Affliction, and Loot Forge as Runtime-action providers.

## 0.1.0-alpha.8.4 - Objective & Round-End Flow Triggers

### Added
- Added a first-class `combat.roundEnded` Runtime event so recurring end-of-round mechanics can be authored without treating the start of round 1 as a completed round.
- Added `objective.progressChanged` and `objective.completed` Runtime events emitted whenever Encounter objective progress changes and when its configured target is reached.
- Added an Objective selector to Trigger authoring, allowing a trigger to react to one specific objective without entering internal IDs by hand.
- Added objective condition fields for progress, previous progress, target, and objective state.
- Updated the onboarding example so ritual pressure advances at each round end and reaching its target can transition the Encounter into the next phase.

### Changed
- Objective progress actions can now cascade into additional authored triggers in the same Runtime flow.
- Flow validation now detects triggers that reference missing objectives.

## 0.1.0-alpha.8.3 - Encounter Library Row Polish

### Added
- Added a dedicated delete control to every saved Encounter row in the left library, with the existing confirmation flow and safe handling of selected versus background entries.

### Changed
- Rebuilt saved Encounter rows as proper two-part library cards: a left-aligned selection surface plus a contained delete action.
- Encounter names and party/threat metadata are now explicitly left-aligned with independent line heights, preventing the title/metadata overlap visible with Foundry button styling.
- Tightened row overflow and hover/focus behavior so per-Encounter actions remain inside the library column.

## 0.1.0-alpha.8.2 - Encounter Library Layout Polish

### Changed
- Reworked the Encounter library header into a contained two-column action toolbar with readable labels instead of a single overflowing icon row.
- Added a distinct “Saved encounters” section heading to visually separate library navigation from creation/runtime tools.
- Widened the default library column slightly and made its responsive layout stack controls when space becomes tight.
- Hardened the library, Blueprint rows, and integration controls against horizontal overflow so controls cannot intrude into the Encounter editor pane.

## 0.1.0-alpha.8.1 - Live Flow References & Onboarding Example

### Added
- Added a bundled, self-documenting example encounter, **The Unstable Rune Altar**, demonstrating moderate XP budgeting, participant roles/groups, Token display policies, phases, objectives, Runtime actions, automatic and GM-confirmed triggers, HP thresholds, and participant defeat transitions.
- Fresh worlds receive the example automatically the first time Encounter Forge is opened. Existing worlds can create or reopen it from the new graduation-cap button in the Encounter library toolbar.
- Example participants are explicit placeholders so the sample remains independent of installed PF2e bestiaries and optional Forge modules; deployment stays disabled until they are replaced with real Actors, Creature Forge creatures, or NPC Forge NPCs.
- Added public `api.examples.createBlueprint()` and `api.examples.isExample()` helpers.

### Fixed
- Phase names now update immediately in phase-transition actions and trigger phase filters while typing, without requiring a save or selecting the stale option first.
- The same live-reference refresh now also keeps objective names, participant names, tactical group names, and linked action names current in their dependent controls.
- The Encounter header title follows name edits live as well.

## 0.1.0-alpha.8 - Encounter Flow Authoring

### Added
- Added first-class Blueprint authoring UI for Encounter phases, objectives, Runtime actions, triggers, trigger conditions, and linked actions.
- Phases can be reordered directly in the Forge; the first phase is the Encounter Instance start phase.
- Objectives can define persistent progress targets consumed by the existing Runtime/Director objective state.
- Added authoring for the first Runtime action types: `phase.transition`, `objective.progress`, and `director.message`.
- Added trigger authoring for normalized Combat/participant Runtime events, optional active-phase and participant filters, reusable conditions, once/enabled flags, GM confirmation, and automatic execution.
- Added HP condition fields (`hpValue`, `hpMax`, `hpPercent`) to normalized participant HP-change events so authored threshold triggers can react to the live PF2e Actor state.
- Added active-phase scoping to TriggerService so a trigger can be limited to a particular Encounter phase.
- Added Encounter Flow analysis for dead phase/objective/action/participant references, unsupported action/event contracts, unreachable phases, and suspicious scoped phase cycles.
- Added public `api.flow` metadata/analysis for add-ons and external tooling.

### Changed
- Blueprint validation now treats dead Flow references as save-blocking errors while retaining softer authoring warnings for reachability/cycles.
- Blueprint structure/status copy now reflects that objectives, phases, triggers, and actions are editable rather than deferred.
- Added regression coverage for Flow validation, phase-scoped Runtime triggers, HP percentage events, and the Flow authoring UI contract.

## 0.1.0-alpha.7.2 - Reopen Encounter & Unobstructed Placement

### Added
- Added a Director action to undo an accidental Encounter completion and resume the same Encounter Instance from its current state.
- Reopening preserves phases, objective progress, fired triggers, participant state, logs, Actors, Tokens, and Combat state; only the final `completed` lifecycle state is reverted to `active`.
- Added a persistent Runtime log entry when completion is undone and exposed `runtime.reopen()` through the public API.
- The Director launcher can now fall back to the most recent completed Encounter when no prepared/active/paused Encounter is available, so an accidental completion can still be undone after closing the Director.

### Changed
- Manual Scene placement now temporarily hides the entire Encounter Forge window, including its title bar, instead of merely minimizing it.
- The Encounter Forge is restored and brought back to the front after manual placement completes or is cancelled, while the deployment dialog continues to close during placement.
- Updated the manual-placement help text to describe the unobstructed placement behavior.

## 0.1.0-alpha.7.1 - Director Participant Cards

### Added
- Redesigned Encounter Director participant rows as visual Actor cards with portrait, readable name, level, role/group metadata, state badge, current/max HP, and a full-width health bar.
- Added persistent participant display snapshots (name, image, level) to Encounter Instances so the Director retains useful identity information even when a concrete Actor/Token cannot be resolved temporarily.
- Added a direct World Actor lookup fallback for Runtime participant inspection.
- Duplicate participants from one Blueprint template are numbered in the Director when their concrete Token names are otherwise identical.

### Changed
- Enlarged the Encounter Director default window for a clearer live-control layout.
- Deployment refreshes participant display snapshots from the materialized World Actor.
- HP bars now use healthy/wounded/critical visual bands while the numeric PF2e HP values remain visible.

## 0.1.0-alpha.7 - Encounter Runtime & Director MVP

### Added
- Added the first live **Encounter Director** ApplicationV2 control surface for GMs, separate from the planning Forge and deployment dialog.
- Added Director launchers from the Encounter Forge and the Combat Tracker, with automatic preference for the current Combat/Scene Encounter Instance.
- Added Encounter lifecycle controls for prepared → active, pause, resume, and completion.
- Added automatic Runtime activation when a prepared Encounter's Foundry Combat actually starts.
- Added authoritative-GM Runtime restoration on world ready for active or paused Encounter Instances. Prepared encounters remain inert until explicitly started or their prepared Combat begins.
- Added live Runtime event normalization for Combat round/turn changes, Combatant defeated state, Token changes/deletion, and Actor changes.
- Added persistent participant state updates for defeated/restored/removed participants and live Director HP snapshots from concrete Token Actors.
- Added manual phase switching, objective progress/state controls, and persistent Encounter logging.
- Added first declarative trigger evaluation. Triggers can react to normalized Runtime events and conditions, fire once by default, and create GM decisions instead of silently applying consequential actions.
- Added Director decision cards with Apply/Dismiss handling; accepted trigger actions currently support phase transitions, objective progress, and Director log messages.
- Added public Runtime API operations for activation, pause/resume/completion, phase changes, objective updates, decision resolution, and read-only Instance inspection.
- Added regression coverage for Runtime lifecycle persistence, trigger/decision flow, objective completion, prepared-vs-active restoration semantics, EventService normalization, and Director UI contracts.

### Changed
- Replaced the inert Runtime service stubs with concrete Event, Trigger, Phase, Objective, Participant, Tactics, Action, and Persistence services while preserving the original service boundaries.
- Switching the Runtime to a different Encounter automatically pauses a previously active Encounter instead of leaving multiple Instances marked active.
- Starting an Encounter promotes ready/materialized participants to active state and captures the current prepared Combat round/turn when available.
- Encounter Instance metadata now includes `startedAt` and `pausedAt` timestamps in addition to completion time.

## 0.1.0-alpha.6.3 - Per-Participant Token Display

### Added
- Added per-participant Token name visibility using the same display-mode semantics as Foundry Token configuration.
- Added per-participant HP bar visibility with Foundry display modes; explicit HP-bar overrides bind Token Bar 1 to PF2e `attributes.hp`.
- Added an inherit option for both controls so existing Actor prototype Token settings can remain authoritative.
- Encounter Instances now carry the resolved participant Token-display policy into concrete runtime participants for Scene deployment.

### Changed
- Enlarged the Encounter Forge default window and added a dedicated Token Display row to each participant card.
- Scene deployment applies Encounter-specific Token display settings only to deployed Tokens; source Actors and prototype Token configuration remain untouched.
- Added regression coverage for Blueprint persistence, Instance propagation, UI controls, and Scene Token materialization of display modes.

## 0.1.0-alpha.6.2 - Manual Placement Default

### Changed
- Manual Scene Token placement is now preselected in the Encounter deployment dialog.
- The deployment dialog's defensive UI fallback now also resolves to `interactive`, while the lower-level Scene Deployment API keeps its existing explicit/default behavior for programmatic callers.
- Automatic center staging remains available as an opt-in placement mode.
- Added regression coverage for the manual-placement default.

## 0.1.0-alpha.6.1 - Interactive Scene Placement

### Added
- Added a manual Scene placement mode alongside the existing automatic center staging formation.
- Manual placement uses Foundry VTT 14's native Token placement workflow, including a live ghost preview, grid snapping, sequential left-click placement, and mouse-wheel rotation.
- Added a compact Encounter placement HUD showing the current opponent, placement progress, and controls while the canvas is in placement mode.
- The selected Scene is opened automatically for manual placement and the main Encounter Forge window is minimized so it does not obstruct the map.
- Concrete runtime participant placement now records the actual manually chosen coordinates and Token rotation in the Encounter Instance.
- Added rollback-aware cancellation: pressing Esc cancels manual placement and the deployment transaction removes newly created deployment Actors/folders and any other documents from the interrupted attempt where possible.
- Added regression coverage for interactive placement delegation, Foundry TokenLayer placement integration, Scene switching, cancellation, and UI contracts.

### Changed
- Scene deployment now supports `placementMode: "interactive"` in addition to `"staging-center"`.
- The deployment dialog now describes Token placement rather than only a staging formation and explains the manual-placement workflow before it begins.
- Successful manual deployment leaves Encounter Forge minimized on the selected Scene so the GM can immediately inspect or adjust the final setup.

## 0.1.0-alpha.6 - Scene Deployment

### Added
- Added Scene preparation to Encounter deployment. Every concrete runtime participant can now be materialized as exactly one Token on the selected Scene.
- Added a size-aware `staging-center` placement mode that creates a compact Scene-center formation intended for immediate GM adjustment.
- Added Encounter identity flags to generated Tokens and persisted each runtime participant's concrete Token UUID.
- Added Scene back-references to persisted Encounter Instances.
- Added optional Foundry Combat preparation with generated opponent Tokens as Combatants.
- Added an option to include character/PC Tokens already present on the selected Scene in the prepared Combat.
- Added Combat back-references to the Encounter Instance without rolling initiative or starting combat.
- Added an optional post-deployment Scene switch so the GM can immediately arrange staged Tokens.
- Extended Encounter Instance deployment state with Token UUIDs, placement metadata, Combat preparation metadata, and PC-inclusion state.
- Added Scene Deployment regression coverage for Token identity, Actor linking semantics, Combat preparation, back-reference stamping, and rollback.

### Changed
- Deployment rollback now covers Tokens and prepared Combat documents in addition to World Actors and auto-created Actor folders.
- The Deployment dialog now exposes Scene preparation separately from Actor materialization.
- `per-type` Scene deployment intentionally uses unlinked Tokens, while `per-participant` deployment uses linked Tokens so individual World Actor state persists.

## 0.1.0-alpha.5.1 - Deployment Dialog & Creature Folder Fix

### Fixed
- Deployment configuration now opens above the Encounter Forge window instead of being covered by a parent rerender. The parent is refreshed before the child dialog is rendered, and the deployment dialog is explicitly brought to the front.
- Materialized World Actors are now explicitly moved into the resolved Encounter deployment folder after provider creation. This fixes Creature Forge generated Actors remaining at the Actor Directory root because Creature Forge's public `createActor()` does not itself persist the supplied folder option.
- Folder enforcement is provider-agnostic, so all participant sources now converge on the same final Actor destination even if an external Forge ignores or changes its own folder-create option semantics.
- Added regression coverage for deployment-window foreground ordering and deployment-folder enforcement.

## 0.1.0-alpha.5 - Deployment & Actor Materialization

### Added
- Added the first Encounter deployment workflow from a saved Blueprint into a persistent prepared Encounter Instance.
- Added a GM deployment dialog with optional Scene association, Actor-folder selection, Encounter-specific subfolder creation, custom subfolder naming, and Actor materialization mode.
- Added `per-type` materialization, creating one World Actor per participant template and assigning that Actor to every concrete runtime participant of the type.
- Added `per-participant` materialization, creating a distinct World Actor for every concrete opponent and numbering repeated participant names.
- Added hierarchical Actor-folder options and unique Encounter subfolder naming to avoid silently reusing same-named deployment folders.
- Added Encounter deployment/provenance metadata to created World Actors.
- Added prepared Instance deployment metadata for Scene, Actor folder, Actor mode, materialized Actor UUIDs, and materialization time.
- Added the public `api.deployment.deploy()` contract.
- Added deployment transaction rollback so failed materialization removes Actors and newly created folders before an Instance is persisted.
- Added deployment, folder hierarchy, Actor mode validation, and UI contract regression coverage.

### Changed
- The Blueprint editor now automatically persists the current Blueprint before opening deployment, ensuring every prepared Instance can reference the saved Blueprint UUID.
- The foundation note now reflects that World Actor materialization and prepared Instance persistence are active, while token placement, Combat creation, live Runtime hooks, and the Encounter Director remain inactive.

## 0.1.0-alpha.4.4 - Editor Scroll Preservation

### Fixed
- Preserved the main Encounter Forge editor scroll position across in-place rerenders such as adding, editing, or removing participants.
- Preserved the blueprint-library and expanded integration-list scroll positions across the same rerenders.
- Explicit document transitions (new/select/duplicate/delete Blueprint) intentionally reset the editor to the top rather than inheriting the previous Blueprint position.
- Added regression coverage for scroll-state capture/restore and participant mutation rerenders.

## 0.1.0-alpha.4.3 - Participant Persistence Repair

### Fixed
- Fixed participant form synchronization accidentally re-processing Edit/Remove buttons because those controls share `data-participant-id` with the participant card. The second pass cleared the saved participant level, tactical role, and group assignment immediately before persistence.
- Saved Creature Forge and NPC Forge participants now retain their encounter-level snapshot after closing and reopening Encounter Forge.
- Per-participant XP is derived again from the restored level on load, so saved encounters immediately recover their XP contribution and total budget usage.
- Tightened tactical-group form synchronization to target group rows only, preventing action controls from being interpreted as editable group records.
- Added regression coverage for card-only participant synchronization and saved participant level/role/group round-trips.

## 0.1.0-alpha.4.2 - Creature Editor Layout & Live XP Repair

### Fixed
- Encounter-hosted Creature Forge now requests its public `full` embedded layout, matching the standalone two-column Concept / Creature presentation at desktop widths.
- Increased the integrated Forge editor host width and height so the full Creature Forge layout has enough room before its own responsive breakpoint collapses it.
- Creature Forge participants now resolve their encounter level from the generated blueprint with the editor request as a defensive fallback, preventing otherwise valid generated creatures from being added without a level snapshot.
- Live encounter XP feedback now refreshes the participant total, per-creature XP, quantity multiplier, supported/unsupported state, budget warning, used XP, remaining XP, and budget status whenever participant level or quantity changes.

## 0.1.0-alpha.4.1 - Localization & Integration Controls

### Fixed
- Fixed a localization catalog key collision between `Budget.Status` and the nested `Budget.Status.*` keys which could prevent the entire Encounter Forge translation catalog from loading in Foundry.
- Added a regression test that rejects dotted localization key prefix collisions in both German and English catalogs.

### Added
- Added a compact integration manager to the Encounter Forge library sidebar.
- The integration manager shows whether each supported Forge module is installed, active, API-ready, disabled by the Encounter Forge, or currently integrated.
- Added persistent world-level enable/disable switches for each core integration. These switches only control whether Encounter Forge consumes a ready module API; module activation itself remains a Foundry module-management concern.
- Public integration API now exposes `isEnabled(id)` and `setEnabled(id, enabled)`.
- Integration status now distinguishes technical `ready` state from effective `usable` state.


## 0.1.0-alpha.4 – Participant Composition

- Added the first complete participant-composition workflow to Encounter Blueprints.
- Added drag-and-drop support for PF2e NPC Actors from the Actor sidebar and Actor compendiums.
- Added an Actor source browser with world/compendium source selection and client-side search.
- Added public embedded Creature Forge integration for creating and editing Creature Forge-backed encounter participants without creating World Actors during planning.
- Added public embedded NPC Forge integration for creating and editing NPC Forge-backed encounter participants without creating World Actors during planning.
- Added participant quantity, encounter role, tactical group, display name, and encounter-level fields.
- Added tactical group creation, renaming, assignment, and removal.
- Added PF2e encounter XP evaluation for creatures from party level −4 through party level +4.
- Added automatic threat-budget adjustment for party sizes other than four and retained the existing optional manual XP-budget override.
- Added per-participant XP contributions, remaining/over-budget feedback, and explicit incomplete-budget diagnostics for unknown or out-of-range participant levels.
- Extended Blueprint participant persistence with optional `level` and `img` snapshots while retaining source provenance.
- Added public `api.budget` helpers for encounter analysis, target budgets, and relative-level XP lookup.
- Fixed nullable participant levels and nullable manual budget values being normalized to zero.
- Added participant composition and budget regression coverage.
- Added the project `LICENSE` (MIT) and this `CHANGELOG.md`.

## 0.1.0-alpha.3.1 – Layout Fix

- Fixed the Blueprint Structure section overlapping the description/basic-data area.
- Changed the editor to natural vertical document flow instead of constraining multiple content sections into fixed grid rows.
- Added regression coverage for the vertical editor layout.

## 0.1.0-alpha.3 – Automatic Party Detection

- Added automatic detection of the active PF2e Party actor and its character members.
- Added fallbacks to characters assigned to non-GM users and player-owned world characters.
- New encounter blueprints now start with the detected party size and rounded arithmetic average level.
- Added display of the exact detected average and the source used for party detection.
- Added a manual “Refresh party” action for re-reading current PCs.
- Added public `api.party.detect()`.

## 0.1.0-alpha.2 – Blueprint & Persistence UI

- Added the first ApplicationV2 Encounter Forge window.
- Added a GM launcher to the Actor Directory with Foundry 14-compatible rendering fallbacks.
- Added persistent Encounter Blueprint listing, selection, creation, editing, saving, duplication, refresh, and deletion.
- Added editable encounter name, description, party level, party size, target threat, and optional XP budget.
- Added Blueprint structure counters and unsaved-change protection.
- Added public `api.ui.open()`.

## 0.1.0-alpha.1 – Architecture Foundation

- Added Encounter Blueprint schema v1 and Encounter Instance schema v1.
- Added JournalEntry-backed Blueprint and Instance repositories.
- Added optional Forge Integration Registry for Creature Forge, NPC Forge, Critical/Effect Forge, Aura Forge, Affliction Forge, Item Forge, Loot Forge, and Weather Forge.
- Added Participant Source Registry with `document`, `creatureForge`, and `npcForge` materialization providers.
- Added Actor folder service for future deployment.
- Added the inert Encounter Runtime skeleton, primary-GM authority handling, internal event bus, and service boundaries.
- Added the initial public API and architecture documentation.
