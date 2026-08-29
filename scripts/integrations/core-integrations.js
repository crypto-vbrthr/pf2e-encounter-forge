const definitions = [
  {
    id: "creatureForge", moduleId: "pf2e-creature-forge", label: "Creature Forge",
    capabilities: ["generate", "createActor", "embeddedEditor"],
    ready: (api) => typeof api?.createActor === "function" && typeof api?.generateAsync === "function"
  },
  {
    id: "npcForge", moduleId: "pf2e-npc-forge", label: "NPC Forge",
    capabilities: ["generate", "createActor", "embeddedEditor"],
    ready: (api) => typeof api?.engine?.generate === "function" && typeof api?.documents?.createActor === "function"
  },
  {
    id: "effectForge", moduleId: "pf2e-critical-forge", label: "Effect Forge",
    capabilities: ["effects", "embeddedEditor"],
    ready: (api) => Boolean(api?.effects) && Boolean(api?.ui?.effectEditor)
  },
  {
    id: "auraForge", moduleId: "pf2e-aura-forge", label: "Aura Forge",
    capabilities: ["definitions", "instances", "runtime", "embeddedEditor"],
    ready: (api) => typeof api?.instances?.assignDefinition === "function" && typeof api?.instances?.setEnabled === "function"
  },
  {
    id: "afflictionForge", moduleId: "pf2e-affliction-forge", label: "Affliction Forge",
    capabilities: ["definitions", "instances", "runtime", "embeddedEditor"],
    ready: (api) => typeof api?.engine?.applyDefinition === "function" && typeof api?.instances?.listForActor === "function"
  },
  {
    id: "itemForge", moduleId: "pf2e-item-forge", label: "Item Forge",
    capabilities: ["generate", "preview"],
    ready: (api) => typeof api?.generate === "function" || typeof api?.engine?.generate === "function"
  },
  {
    id: "lootForge", moduleId: "pf2e-loot-forge", label: "Loot Forge",
    capabilities: ["generate", "embeddedEditor", "addToActor"],
    ready: (api) => typeof api?.generateLoot === "function" && typeof api?.createEmbeddedEditor === "function"
  },
  {
    id: "weatherForge", moduleId: "pf2e-weather-forge", label: "Weather Forge",
    capabilities: ["readWeather", "readClimate", "readForecast"],
    ready: (api) => typeof api?.getWeather === "function" && typeof api?.getCurrentWeatherContext === "function"
  }
];

export function registerCoreIntegrations(registry) {
  for (const definition of definitions) registry.register(definition, { replace: true });
  return registry;
}
