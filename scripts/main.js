import { API_VERSION, MODULE_ID, MODULE_VERSION } from "./constants.js";
import { IntegrationRegistry, registerCoreIntegrations, registerIntegrationSettings } from "./integrations/index.js";
import { ParticipantSourceRegistry, registerCoreParticipantSources } from "./engine/index.js";
import { createBlueprintRepository, createInstanceRepository } from "./persistence/index.js";
import { EncounterDeploymentService } from "./deployment/index.js";
import { EncounterRuntime } from "./runtime/index.js";
import { createPublicApi } from "./api/public-api.js";
import { initializeEncounterForgeUi, registerEncounterForgeUiSettings } from "./ui/index.js";
import { initializeEncounterDirectorUi } from "./director/index.js";
import { registerExampleEncounterSettings } from "./examples/index.js";

let api = null;
let runtime = null;

Hooks.once("init", () => {
  console.log(`PF2E Encounter Forge | Initializing ${MODULE_VERSION} (API ${API_VERSION})`);
  registerIntegrationSettings();
  registerExampleEncounterSettings();
  registerEncounterForgeUiSettings();
  const integrations = registerCoreIntegrations(new IntegrationRegistry());
  const participantSources = registerCoreParticipantSources(new ParticipantSourceRegistry(), integrations);
  const blueprintRepository = createBlueprintRepository();
  const instanceRepository = createInstanceRepository();
  const deployment = new EncounterDeploymentService({ participantSources, instanceRepository });
  runtime = new EncounterRuntime({ instanceRepository, blueprintRepository, integrations });
  api = createPublicApi({ integrations, participantSources, blueprintRepository, instanceRepository, deployment, runtime });
  initializeEncounterForgeUi();
  initializeEncounterDirectorUi();
  runtime.enableBootstrapHooks();
  Hooks.callAll("pf2eEncounterForgeReady", api);
});

Hooks.once("ready", async () => {
  if (!game.user?.isGM) return;
  console.log("PF2E Encounter Forge | Integration status", api?.integrations?.status?.());
  try {
    const restored = await runtime?.restore?.();
    if (restored?.restored) console.info(`${MODULE_ID} | Restored Encounter Runtime for '${restored.instanceId}'.`);
  } catch (error) {
    console.error(`${MODULE_ID} | Encounter Runtime restore failed.`, error);
  }
});

export function getEncounterForgeApi() { return api; }
export function getEncounterRuntime() { return runtime; }
