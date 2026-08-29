# PF2E Encounter Forge

PF2e encounter planning and orchestration module in early alpha development.

## 0.1.0-alpha.2 — Blueprint & Persistence UI

This build adds the first GM-facing Encounter Forge window on top of the Architecture Foundation:

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
