function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.contents)) return value.contents;
  try { return Array.from(value); } catch { return []; }
}

function isCharacter(actor) {
  return actor?.type === "character";
}

function actorLevel(actor) {
  const candidates = [
    actor?.level,
    actor?.system?.details?.level?.value,
    actor?.system?.details?.level
  ];
  for (const candidate of candidates) {
    const level = Number(candidate);
    if (Number.isFinite(level)) return Math.max(1, Math.min(20, Math.trunc(level)));
  }
  return null;
}

function actorKey(actor, index) {
  return String(actor?.uuid ?? actor?.id ?? actor?._id ?? `actor-${index}`);
}

function uniqueCharacters(actors) {
  const seen = new Set();
  const result = [];
  for (const [index, actor] of asArray(actors).entries()) {
    if (!isCharacter(actor)) continue;
    const key = actorKey(actor, index);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(actor);
  }
  return result;
}

function assignedUserCharacters(users) {
  return uniqueCharacters(
    asArray(users)
      .filter((user) => !user?.isGM && user?.character)
      .map((user) => user.character)
  );
}

function playerOwnedWorldCharacters(actors) {
  return uniqueCharacters(asArray(actors).filter((actor) => actor?.hasPlayerOwner));
}

function summarize(members, source, sourceName = null) {
  const characters = uniqueCharacters(members);
  if (characters.length === 0) {
    return {
      available: false,
      source,
      sourceName,
      size: 0,
      averageLevel: null,
      partyLevel: null,
      members: []
    };
  }

  const normalizedMembers = characters.map((actor) => ({
    uuid: actor?.uuid ?? null,
    id: actor?.id ?? actor?._id ?? null,
    name: String(actor?.name ?? ""),
    level: actorLevel(actor)
  }));
  const levels = normalizedMembers.map((member) => member.level).filter(Number.isFinite);
  const averageLevel = levels.length > 0 ? levels.reduce((sum, level) => sum + level, 0) / levels.length : null;
  const partyLevel = Number.isFinite(averageLevel)
    ? Math.max(1, Math.min(20, Math.round(averageLevel)))
    : null;

  return {
    available: characters.length > 0 && Number.isFinite(averageLevel),
    source,
    sourceName,
    size: characters.length,
    averageLevel,
    partyLevel,
    members: normalizedMembers
  };
}

/**
 * Detect the current PF2e player party without mutating world data.
 * Priority:
 * 1. PF2e's active Party actor (`game.actors.party.members`).
 * 2. Character actors assigned to non-GM users.
 * 3. World character actors that have a player owner.
 */
export function detectCurrentParty({ actors = globalThis.game?.actors, users = globalThis.game?.users } = {}) {
  const activeParty = actors?.party ?? null;
  const activeMembers = uniqueCharacters(activeParty?.members);
  if (activeMembers.length > 0) {
    return summarize(activeMembers, "activeParty", activeParty?.name ?? null);
  }

  const assigned = assignedUserCharacters(users);
  if (assigned.length > 0) return summarize(assigned, "assignedUsers");

  const owned = playerOwnedWorldCharacters(actors);
  if (owned.length > 0) return summarize(owned, "playerOwnedActors");

  return summarize([], "none");
}

export const partyAnalyzerInternals = Object.freeze({ actorLevel, uniqueCharacters, summarize });
