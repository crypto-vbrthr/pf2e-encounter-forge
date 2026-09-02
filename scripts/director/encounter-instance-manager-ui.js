import { EncounterInstanceManagerApp } from "./encounter-instance-manager-app.js";

let app = null;

export async function openEncounterInstanceManager({ selectedInstanceId = null } = {}) {
  if (!game.user?.isGM) return null;
  if (!app) app = new EncounterInstanceManagerApp({ selectedInstanceId });
  else await app.setSelectedInstance(selectedInstanceId);
  await app.render({ force: true });
  app.bringToFront?.();
  return app;
}
