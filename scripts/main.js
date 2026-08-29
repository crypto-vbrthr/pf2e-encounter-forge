import { API_VERSION, MODULE_ID, MODULE_VERSION } from "./constants.js";
import { IntegrationRegistry, registerCoreIntegrations, registerIntegrationSettings } from "./integrations/index.js";
import { ParticipantSourceRegistry, registerCoreParticipantSources } from "./engine/index.js";
import { createBlueprintRepository, createInstanceRepository } from "./persistence/index.js";
import { EncounterRuntime } from "./runtime/index.js";
import { createPublicApi } from "./api/public-api.js";
import { initializeEncounterForgeUi } from "./ui/index.js";

let api = null;
let runtime = null;

Hooks.once("init", () => {
  console.log(`PF2E Encounter Forge | Initializing ${MODULE_VERSION} (API ${API_VERSION})`);
  registerIntegrationSettings();
  const integrations = registerCoreIntegrations(new IntegrationRegistry());
  const participantSources = registerCoreParticipantSources(new ParticipantSourceRegistry(), integrations);
  const blueprintRepository = createBlueprintRepository();
  const instanceRepository = createInstanceRepository();
  runtime = new EncounterRuntime({ instanceRepository, integrations });
  api = createPublicApi({ integrations, participantSources, blueprintRepository, instanceRepository, runtime });
  initializeEncounterForgeUi();
  Hooks.callAll("pf2eEncounterForgeReady", api);
});

Hooks.once("ready", async () => {
  if (!game.user?.isGM) return;
  console.log("PF2E Encounter Forge | Integration status", api?.integrations?.status?.());
  // Foundation block deliberately does not auto-restore or mutate a running world yet.
  // Runtime restoration will be enabled when concrete encounter hooks/actions are added.
});

export function getEncounterForgeApi() { return api; }
export function getEncounterRuntime() { return runtime; }
