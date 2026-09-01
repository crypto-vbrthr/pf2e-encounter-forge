import { MODULE_ID } from "../constants.js";

export const CONDITION_LOGIC_DISPLAY_SETTING = "ui.conditionLogicDisplay";
export const CONDITION_LOGIC_DISPLAY_MODES = Object.freeze(["verbose", "operators"]);

function localize(key, fallback = key) {
  try {
    const value = globalThis.game?.i18n?.localize?.(key);
    return value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
}

export function registerEncounterForgeUiSettings({ gameRef = globalThis.game } = {}) {
  const settings = gameRef?.settings;
  if (!settings?.register) return;
  try {
    settings.register(MODULE_ID, CONDITION_LOGIC_DISPLAY_SETTING, {
      name: "PF2E_ENCOUNTER_FORGE.Settings.ConditionLogicDisplay.Name",
      hint: "PF2E_ENCOUNTER_FORGE.Settings.ConditionLogicDisplay.Hint",
      scope: "client",
      config: true,
      type: String,
      choices: {
        verbose: localize("PF2E_ENCOUNTER_FORGE.Settings.ConditionLogicDisplay.Choice.verbose", "Written out"),
        operators: localize("PF2E_ENCOUNTER_FORGE.Settings.ConditionLogicDisplay.Choice.operators", "AND / OR")
      },
      default: "verbose",
      onChange: (value) => Hooks.callAll("pf2eEncounterForgeConditionLogicDisplayChanged", value)
    });
  } catch (error) {
    const message = String(error?.message ?? error ?? "");
    if (!/already|registered|exists/i.test(message)) throw error;
  }
}

export function getConditionLogicDisplayMode({ gameRef = globalThis.game } = {}) {
  const settings = gameRef?.settings;
  if (!settings?.get) return "verbose";
  try {
    const value = String(settings.get(MODULE_ID, CONDITION_LOGIC_DISPLAY_SETTING) ?? "verbose");
    return CONDITION_LOGIC_DISPLAY_MODES.includes(value) ? value : "verbose";
  } catch {
    return "verbose";
  }
}
