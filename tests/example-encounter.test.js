import test from "node:test";
import assert from "node:assert/strict";
import { createExampleEncounterBlueprint, isExampleEncounterBlueprint } from "../scripts/examples/example-encounter.js";
import { validateEncounterBlueprint } from "../scripts/model/encounter-blueprint.js";
import { analyzeEncounterBudget } from "../scripts/engine/encounter-budget.js";
import { analyzeEncounterFlow } from "../scripts/engine/encounter-flow.js";

test("onboarding example is a valid, exact moderate-budget Blueprint", () => {
  const blueprint = createExampleEncounterBlueprint({ partyLevel: 10, partySize: 4 });
  assert.equal(isExampleEncounterBlueprint(blueprint), true);
  assert.equal(validateEncounterBlueprint(blueprint).valid, true);
  const budget = analyzeEncounterBudget({
    participants: blueprint.participants,
    partyLevel: blueprint.party.level,
    partySize: blueprint.party.size,
    threat: blueprint.threat.target,
    budgetOverride: blueprint.threat.budget
  });
  assert.equal(budget.targetXp, 80);
  assert.equal(budget.usedXp, 80);
  assert.equal(budget.status, "exact");
  assert.equal(blueprint.participants.every((entry) => entry.source.type === "example"), true);
  assert.equal(blueprint.phases.length, 3);
  assert.equal(blueprint.objectives.length, 2);
  assert.equal(blueprint.triggers.length, 3);
  assert.equal(blueprint.actions.length, 5);
  assert.equal(analyzeEncounterFlow(blueprint).valid, true);
});

test("onboarding example scales its placeholder XP to detected party size", () => {
  const blueprint = createExampleEncounterBlueprint({ partyLevel: 8, partySize: 6 });
  const budget = analyzeEncounterBudget({
    participants: blueprint.participants,
    partyLevel: blueprint.party.level,
    partySize: blueprint.party.size,
    threat: blueprint.threat.target
  });
  assert.equal(budget.targetXp, 120);
  assert.equal(budget.usedXp, 120);
  assert.equal(budget.status, "exact");
  assert.equal(blueprint.participants[0].id, "example-rune-warden");
});
