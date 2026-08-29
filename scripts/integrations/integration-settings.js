import { CORE_INTEGRATION_IDS, MODULE_ID } from "../constants.js";

const SETTING_PREFIX = "integration";

export function integrationSettingKey(id) {
  return `${SETTING_PREFIX}.${String(id)}.enabled`;
}

export function registerIntegrationSettings({ gameRef = globalThis.game } = {}) {
  const settings = gameRef?.settings;
  if (!settings?.register) return;
  for (const id of CORE_INTEGRATION_IDS) {
    const key = integrationSettingKey(id);
    try {
      settings.register(MODULE_ID, key, {
        name: key,
        hint: key,
        scope: "world",
        config: false,
        type: Boolean,
        default: true
      });
    } catch (error) {
      // Foundry can throw when hot-reloading a module that already registered its settings.
      const message = String(error?.message ?? error ?? "");
      if (!/already|registered|exists/i.test(message)) throw error;
    }
  }
}

export function isIntegrationEnabled(id, { gameRef = globalThis.game } = {}) {
  const settings = gameRef?.settings;
  if (!settings?.get) return true;
  try {
    const value = settings.get(MODULE_ID, integrationSettingKey(id));
    return value !== false;
  } catch {
    return true;
  }
}

export async function setIntegrationEnabled(id, enabled, { gameRef = globalThis.game } = {}) {
  const settings = gameRef?.settings;
  if (!settings?.set) return Boolean(enabled);
  await settings.set(MODULE_ID, integrationSettingKey(id), Boolean(enabled));
  return Boolean(enabled);
}
