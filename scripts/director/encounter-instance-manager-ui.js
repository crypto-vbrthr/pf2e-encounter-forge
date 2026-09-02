import { EncounterInstanceManagerApp } from "./encounter-instance-manager-app.js";

let app = null;

export async function openEncounterInstanceManager({ selectedInstanceId = null, sceneFiltered = false } = {}) {
  if (!game.user?.isGM) return null;
  if (!app) app = new EncounterInstanceManagerApp({ selectedInstanceId, sceneFiltered });
  else await app.setContext({ selectedInstanceId, sceneFiltered });
  await app.render({ force: true });
  app.bringToFront?.();
  return app;
}
