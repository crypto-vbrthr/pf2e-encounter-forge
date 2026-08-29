import test from "node:test";
import assert from "node:assert/strict";
import { IntegrationRegistry } from "../scripts/integrations/integration-registry.js";
import { registerCoreIntegrations } from "../scripts/integrations/core-integrations.js";

function modules(entries) {
  const map = new Map(entries.map((entry) => [entry.id, entry]));
  map.contents = [...map.values()];
  return map;
}

test("integration registry distinguishes installed, active, available and ready", () => {
  const gameRef = {
    modules: modules([
      { id: "pf2e-creature-forge", active: true, version: "1.0.1", api: { version: 1, createActor() {}, generateAsync() {} } },
      { id: "pf2e-weather-forge", active: false, version: "1.1.3.4", api: { getWeather() {}, getCurrentWeatherContext() {} } }
    ])
  };
  const registry = registerCoreIntegrations(new IntegrationRegistry({ gameRef }));
  const creature = registry.status("creatureForge");
  assert.equal(creature.installed, true);
  assert.equal(creature.active, true);
  assert.equal(creature.available, true);
  assert.equal(creature.ready, true);
  const weather = registry.status("weatherForge");
  assert.equal(weather.installed, true);
  assert.equal(weather.active, false);
  assert.equal(weather.available, false);
  assert.equal(weather.ready, false);
});
