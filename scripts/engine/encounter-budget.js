export const CREATURE_XP_BY_LEVEL_DELTA = Object.freeze({
  "-4": 10,
  "-3": 15,
  "-2": 20,
  "-1": 30,
  "0": 40,
  "1": 60,
  "2": 80,
  "3": 120,
  "4": 160
});

export const THREAT_BUDGETS = Object.freeze({
  trivial: Object.freeze({ base: 40, adjustment: 10 }),
  low: Object.freeze({ base: 60, adjustment: 15 }),
  moderate: Object.freeze({ base: 80, adjustment: 20 }),
  severe: Object.freeze({ base: 120, adjustment: 30 }),
  extreme: Object.freeze({ base: 160, adjustment: 40 })
});

export function xpForCreatureLevel(creatureLevel, partyLevel) {
  if (creatureLevel === null || creatureLevel === "" || creatureLevel === undefined || partyLevel === null || partyLevel === "" || partyLevel === undefined) {
    return { xp: null, delta: null, supported: false };
  }
  const creature = Number(creatureLevel);
  const party = Number(partyLevel);
  if (!Number.isInteger(creature) || !Number.isInteger(party)) {
    return { xp: null, delta: null, supported: false };
  }
  const delta = creature - party;
  const xp = CREATURE_XP_BY_LEVEL_DELTA[String(delta)];
  return {
    xp: Number.isFinite(xp) ? xp : null,
    delta,
    supported: Number.isFinite(xp)
  };
}

export function targetBudgetForThreat(threat = "moderate", partySize = 4) {
  const profile = THREAT_BUDGETS[String(threat)] ?? THREAT_BUDGETS.moderate;
  const size = Math.max(1, Number.parseInt(partySize, 10) || 4);
  return Math.max(0, profile.base + ((size - 4) * profile.adjustment));
}

export function analyzeEncounterBudget({ participants = [], partyLevel = 1, partySize = 4, threat = "moderate", budgetOverride = null } = {}) {
  const rows = [];
  let usedXp = 0;
  let unknownCount = 0;

  for (const participant of participants ?? []) {
    const quantity = Math.max(1, Number.parseInt(participant?.quantity ?? 1, 10) || 1);
    const result = xpForCreatureLevel(participant?.level, partyLevel);
    const totalXp = result.supported ? result.xp * quantity : null;
    if (Number.isFinite(totalXp)) usedXp += totalXp;
    else unknownCount += quantity;
    rows.push({
      id: participant?.id ?? null,
      level: Number.isInteger(Number(participant?.level)) ? Number(participant.level) : null,
      quantity,
      delta: result.delta,
      xpEach: result.xp,
      totalXp,
      supported: result.supported
    });
  }

  const automaticTarget = targetBudgetForThreat(threat, partySize);
  const override = Number(budgetOverride);
  const hasOverride = budgetOverride !== null && budgetOverride !== "" && Number.isFinite(override) && override >= 0;
  const targetXp = hasOverride ? override : automaticTarget;
  const remainingXp = targetXp - usedXp;
  const status = unknownCount > 0 ? "incomplete" : remainingXp < 0 ? "over" : remainingXp === 0 ? "exact" : "under";

  return {
    partyLevel: Number(partyLevel),
    partySize: Number(partySize),
    threat: String(threat),
    automaticTarget,
    targetXp,
    hasOverride,
    usedXp,
    remainingXp,
    unknownCount,
    status,
    rows
  };
}
