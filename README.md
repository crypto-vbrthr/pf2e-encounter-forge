# PF2E Encounter Forge

PF2e encounter planning and orchestration module in early alpha development.

## 0.1.0-alpha.3 — Automatic Party Detection

This build extends the Blueprint & Persistence UI with automatic PF2e player-party detection:

- Reads the active PF2e Party actor first and uses its character members.
- Falls back to characters assigned to non-GM users, then player-owned world characters.
- New encounter blueprints automatically start with the detected party size and rounded arithmetic average level.
- The exact detected average is shown in the UI, along with the source used.
- A “Refresh party” action can re-read the current PCs without touching saved encounters automatically.
- Actor Directory launcher for GMs.
- ApplicationV2 Encounter Forge window.
- Persistent Encounter Blueprint library backed by JournalEntry flags.
- Create, select, edit, save, duplicate, refresh, and delete blueprint workflows.
- Editable encounter name, description, party level, party size, target threat, and optional XP budget.
- Blueprint structure counters for participants, groups, objectives, phases, triggers, and actions.
- Unsaved-change protection.
- Public `api.ui.open()` launcher.

The v1 Blueprint and Instance schemas, Journal-backed repositories, optional Forge integration discovery, participant source materialization contracts, Actor-folder support, primary-GM authority handling, and inert Encounter Runtime service skeleton remain in place.

Deployment, participant composition, tactical editing, phases/triggers UI, and the Encounter Director are intentionally still inactive in this block.

## 0.1.0-alpha.3.1

- Fixed the Blueprint Structure section overlapping the description/basic-data area. The editor now uses natural vertical document flow instead of constraining multiple content sections into a three-row grid.
