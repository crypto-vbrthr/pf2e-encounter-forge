# Changelog

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
