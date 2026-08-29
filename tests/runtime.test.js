import test from "node:test";
import assert from "node:assert/strict";
import { AuthorityService } from "../scripts/runtime/authority-service.js";
import { EncounterRuntime } from "../scripts/runtime/encounter-runtime.js";
import { createEncounterBlueprint } from "../scripts/model/encounter-blueprint.js";
import { createEncounterInstance } from "../scripts/model/encounter-instance.js";

function userCollection(users, activeGM = null) {
  return { contents: users, activeGM };
}

test("authority service selects Foundry activeGM when available", () => {
  const gameRef = {
    user: { id: "gm2", isGM: true, active: true },
    users: userCollection([{ id: "gm1", isGM: true, active: true }, { id: "gm2", isGM: true, active: true }], { id: "gm2" })
  };
  const service = new AuthorityService({ gameRef });
  assert.equal(service.primaryGmId(), "gm2");
  assert.equal(service.isAuthoritative(), true);
});

test("runtime starts service skeleton for authoritative GM and stops cleanly", async () => {
  const gameRef = { user: { id: "gm", isGM: true, active: true }, users: userCollection([{ id: "gm", isGM: true, active: true }]) };
  const blueprint = createEncounterBlueprint({ id: "b", name: "B" });
  const instance = createEncounterInstance(blueprint, { id: "i" });
  const repository = { get: () => ({ data: instance }), list: () => [{ data: instance }] };
  const runtime = new EncounterRuntime({ instanceRepository: repository, integrations: {}, gameRef });
  const status = await runtime.start(instance);
  assert.equal(status.started, true);
  assert.equal(status.activeInstanceId, "i");
  assert(Object.values(status.services).every((entry) => entry.started));
  const stopped = await runtime.stop();
  assert.equal(stopped.started, false);
});
