import test from "node:test";
import assert from "node:assert/strict";
import { analyzeEncounterBudget, targetBudgetForThreat, xpForCreatureLevel } from "../scripts/engine/encounter-budget.js";

test("PF2e creature XP uses party-level relative values", () => {
  assert.deepEqual(xpForCreatureLevel(6, 10), { xp: 10, delta: -4, supported: true });
  assert.deepEqual(xpForCreatureLevel(10, 10), { xp: 40, delta: 0, supported: true });
  assert.deepEqual(xpForCreatureLevel(14, 10), { xp: 160, delta: 4, supported: true });
  assert.equal(xpForCreatureLevel(15, 10).supported, false);
  assert.equal(xpForCreatureLevel(null, 10).supported, false);
});

test("threat budgets adjust for party size", () => {
  assert.equal(targetBudgetForThreat("moderate", 4), 80);
  assert.equal(targetBudgetForThreat("moderate", 5), 100);
  assert.equal(targetBudgetForThreat("severe", 3), 90);
  assert.equal(targetBudgetForThreat("extreme", 6), 240);
});

test("budget analysis multiplies participant quantity and respects explicit overrides", () => {
  const automatic = analyzeEncounterBudget({
    partyLevel: 10,
    partySize: 4,
    threat: "moderate",
    participants: [
      { id: "a", level: 10, quantity: 1 },
      { id: "b", level: 8, quantity: 2 }
    ]
  });
  assert.equal(automatic.usedXp, 80);
  assert.equal(automatic.targetXp, 80);
  assert.equal(automatic.status, "exact");

  const overridden = analyzeEncounterBudget({
    partyLevel: 10,
    partySize: 4,
    threat: "moderate",
    budgetOverride: 100,
    participants: [{ id: "a", level: 10, quantity: 1 }]
  });
  assert.equal(overridden.targetXp, 100);
  assert.equal(overridden.automaticTarget, 80);
  assert.equal(overridden.remainingXp, 60);
});

test("unknown or out-of-range participant levels mark budget incomplete", () => {
  const report = analyzeEncounterBudget({
    partyLevel: 10,
    participants: [{ id: "a", level: null, quantity: 2 }, { id: "b", level: 15, quantity: 1 }]
  });
  assert.equal(report.usedXp, 0);
  assert.equal(report.unknownCount, 3);
  assert.equal(report.status, "incomplete");
});
