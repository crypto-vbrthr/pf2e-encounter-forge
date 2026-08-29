# Changelog

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
