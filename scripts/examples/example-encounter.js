import { MODULE_ID } from "../constants.js";
import { createEncounterBlueprint } from "../model/encounter-blueprint.js";

export const EXAMPLE_ENCOUNTER_ID = "unstable-rune-altar";
export const EXAMPLE_ENCOUNTER_VERSION = 1;
export const EXAMPLE_SEEDED_SETTING = "examples.initialSeedDone";

function localize(key, fallback = key) {
  try {
    const value = globalThis.game?.i18n?.localize?.(key);
    return value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

/**
 * Register the hidden world marker used to seed the onboarding example only once.
 * The example can still be recreated explicitly from the Encounter Forge toolbar.
 */
export function registerExampleEncounterSettings({ gameRef = globalThis.game } = {}) {
  const settings = gameRef?.settings;
  if (!settings?.register) return;
  try {
    settings.register(MODULE_ID, EXAMPLE_SEEDED_SETTING, {
      name: EXAMPLE_SEEDED_SETTING,
      hint: EXAMPLE_SEEDED_SETTING,
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });
  } catch (error) {
    const message = String(error?.message ?? error ?? "");
    if (!/already|registered|exists/i.test(message)) throw error;
  }
}

export function isInitialExampleSeedDone({ gameRef = globalThis.game } = {}) {
  try {
    return Boolean(gameRef?.settings?.get?.(MODULE_ID, EXAMPLE_SEEDED_SETTING));
  } catch {
    return false;
  }
}

export async function markInitialExampleSeedDone({ gameRef = globalThis.game } = {}) {
  try {
    if (gameRef?.settings?.set) await gameRef.settings.set(MODULE_ID, EXAMPLE_SEEDED_SETTING, true);
  } catch {
    // A missing settings backend should never make the Forge unusable.
  }
}

export function isExampleEncounterBlueprint(blueprint) {
  return blueprint?.metadata?.notes?.exampleEncounter?.id === EXAMPLE_ENCOUNTER_ID;
}

/**
 * Create a self-documenting example Blueprint. Its participants are intentionally
 * placeholders so the example can demonstrate budget, roles, token-display policy,
 * phases, objectives, actions, and triggers without depending on any particular PF2e
 * compendium. The Forge disables deployment until those placeholders are replaced.
 */
export function createExampleEncounterBlueprint({ partyLevel = 5, partySize = 4 } = {}) {
  const level = clampInt(partyLevel, 5, 1, 20);
  const size = clampInt(partySize, 4, 1, 12);
  const moderateBudget = Math.max(0, 80 + ((size - 4) * 20));

  // Keep the sample exactly on the moderate rules budget for the detected party size.
  // One named leader is always present so participant-scoped HP/defeat triggers remain useful.
  let bossLevel;
  let attendantQuantity = 0;
  if (moderateBudget >= 60) {
    bossLevel = Math.min(24, level + 1); // 60 XP
    attendantQuantity = Math.max(0, Math.floor((moderateBudget - 60) / 20)); // party level -2, 20 XP each
  } else if (moderateBudget >= 40) {
    bossLevel = level; // 40 XP
  } else {
    bossLevel = Math.max(-1, level - 2); // 20 XP
  }

  const groups = [
    { id: "example-ritual-guard", name: localize("PF2E_ENCOUNTER_FORGE.Example.Group.RitualGuard", "Ritual guard") }
  ];

  const participants = [
    {
      id: "example-rune-warden",
      name: localize("PF2E_ENCOUNTER_FORGE.Example.Participant.RuneWarden", "Rune Warden (replace me)"),
      level: bossLevel,
      quantity: 1,
      role: "leader",
      groupId: "example-ritual-guard",
      source: {
        type: "example",
        label: localize("PF2E_ENCOUNTER_FORGE.Example.PlaceholderSource", "Example placeholder")
      },
      tokenDisplay: { displayName: "ALWAYS", displayBars: "OWNER", hpBarAttribute: "attributes.hp" }
    }
  ];

  if (attendantQuantity > 0) {
    participants.push({
      id: "example-ritual-attendants",
      name: localize("PF2E_ENCOUNTER_FORGE.Example.Participant.Attendants", "Ritual Attendant (replace me)"),
      level: Math.max(-1, level - 2),
      quantity: attendantQuantity,
      role: "support",
      groupId: "example-ritual-guard",
      source: {
        type: "example",
        label: localize("PF2E_ENCOUNTER_FORGE.Example.PlaceholderSource", "Example placeholder")
      },
      tokenDisplay: { displayName: "ALWAYS", displayBars: "HOVER", hpBarAttribute: "attributes.hp" }
    });
  }

  return createEncounterBlueprint({
    name: localize("PF2E_ENCOUNTER_FORGE.Example.Name", "Example: The Unstable Rune Altar"),
    description: localize(
      "PF2E_ENCOUNTER_FORGE.Example.Description",
      "A guided example showing encounter budget, participant roles, token display, phases, objectives, actions, and triggers. The two opponent entries are placeholders: delete them and add real Actors, Creature Forge creatures, or NPC Forge NPCs before deployment."
    ),
    party: { level, size },
    threat: { target: "moderate", budget: null },
    participants,
    groups,
    phases: [
      {
        id: "example-phase-defense",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Phase.Defense", "Phase 1: Ritual Defense"),
        description: localize("PF2E_ENCOUNTER_FORGE.Example.Phase.DefenseDescription", "The defenders protect the altar and buy time for the ritual.")
      },
      {
        id: "example-phase-awakening",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Phase.Awakening", "Phase 2: The Altar Awakens"),
        description: localize("PF2E_ENCOUNTER_FORGE.Example.Phase.AwakeningDescription", "The wounded rune warden loses control and the altar becomes unstable.")
      },
      {
        id: "example-phase-collapse",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Phase.Collapse", "Phase 3: Collapse"),
        description: localize("PF2E_ENCOUNTER_FORGE.Example.Phase.CollapseDescription", "With the leader defeated, the ritual chamber begins to collapse.")
      }
    ],
    objectives: [
      {
        id: "example-objective-ritual",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Objective.Ritual", "Ritual pressure"),
        description: localize("PF2E_ENCOUNTER_FORGE.Example.Objective.RitualDescription", "Automatic round events increase this counter while Phase 1 remains active."),
        target: 3
      },
      {
        id: "example-objective-civilians",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Objective.Civilians", "Protect the captives"),
        description: localize("PF2E_ENCOUNTER_FORGE.Example.Objective.CiviliansDescription", "An example of a GM-managed objective that can be advanced from the Director."),
        target: 2
      }
    ],
    actions: [
      {
        id: "example-action-ritual-progress",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Action.RitualProgress", "Advance ritual pressure"),
        type: "objective.progress",
        objectiveId: "example-objective-ritual",
        amount: 1
      },
      {
        id: "example-action-awakening-message",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Action.AwakeningMessage", "Director: altar destabilizes"),
        type: "director.message",
        message: localize("PF2E_ENCOUNTER_FORGE.Example.Message.Awakening", "The runes flare violently. The altar is becoming unstable.")
      },
      {
        id: "example-action-to-awakening",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Action.ToAwakening", "Enter Phase 2"),
        type: "phase.transition",
        phaseId: "example-phase-awakening"
      },
      {
        id: "example-action-collapse-message",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Action.CollapseMessage", "Director: chamber collapses"),
        type: "director.message",
        message: localize("PF2E_ENCOUNTER_FORGE.Example.Message.Collapse", "The rune warden falls. Cracks race through the chamber as the ritual collapses.")
      },
      {
        id: "example-action-to-collapse",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Action.ToCollapse", "Enter Phase 3"),
        type: "phase.transition",
        phaseId: "example-phase-collapse"
      }
    ],
    triggers: [
      {
        id: "example-trigger-round-pressure",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Trigger.RoundPressure", "Each round: ritual pressure"),
        event: "combat.roundChanged",
        activePhaseId: "example-phase-defense",
        participantId: null,
        enabled: true,
        once: false,
        confirm: false,
        automatic: true,
        conditions: [{ field: "round", operator: "gte", value: 1 }],
        actions: ["example-action-ritual-progress"]
      },
      {
        id: "example-trigger-half-hp",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Trigger.HalfHp", "Rune warden at 50% HP"),
        event: "participant.hpChanged",
        activePhaseId: "example-phase-defense",
        participantId: "example-rune-warden",
        enabled: true,
        once: true,
        confirm: true,
        automatic: false,
        conditions: [{ field: "hpPercent", operator: "lte", value: 50 }],
        actions: ["example-action-awakening-message", "example-action-to-awakening"]
      },
      {
        id: "example-trigger-leader-defeated",
        name: localize("PF2E_ENCOUNTER_FORGE.Example.Trigger.LeaderDefeated", "Rune warden defeated"),
        event: "participant.defeated",
        activePhaseId: "example-phase-awakening",
        participantId: "example-rune-warden",
        enabled: true,
        once: true,
        confirm: true,
        automatic: false,
        conditions: [],
        actions: ["example-action-collapse-message", "example-action-to-collapse"]
      }
    ],
    metadata: {
      sourceModule: MODULE_ID,
      notes: {
        exampleEncounter: {
          id: EXAMPLE_ENCOUNTER_ID,
          version: EXAMPLE_ENCOUNTER_VERSION,
          placeholderParticipants: true
        }
      }
    }
  });
}
