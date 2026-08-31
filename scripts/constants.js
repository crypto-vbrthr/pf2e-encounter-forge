export const MODULE_ID = "pf2e-encounter-forge";
export const MODULE_VERSION = "0.1.0-alpha.10";
export const API_VERSION = 1;
export const BLUEPRINT_SCHEMA_VERSION = 1;

export const TOKEN_DISPLAY_MODE_KEYS = Object.freeze([
  "NONE",
  "CONTROL",
  "OWNER_HOVER",
  "HOVER",
  "OWNER",
  "ALWAYS"
]);
export const INSTANCE_SCHEMA_VERSION = 1;

export const DOCUMENT_KINDS = Object.freeze({
  BLUEPRINT: "blueprint",
  INSTANCE: "instance"
});

export const REPOSITORY_FOLDERS = Object.freeze({
  ROOT: "Encounter Forge",
  BLUEPRINTS: "Blueprints",
  RUNTIME: "Runtime"
});


export const ACTOR_MODES = Object.freeze([
  "per-type",
  "per-participant"
]);

export const INSTANCE_STATUSES = Object.freeze([
  "prepared",
  "active",
  "paused",
  "completed",
  "aborted"
]);

export const CORE_INTEGRATION_IDS = Object.freeze([
  "creatureForge",
  "npcForge",
  "effectForge",
  "auraForge",
  "afflictionForge",
  "itemForge",
  "lootForge",
  "weatherForge"
]);
