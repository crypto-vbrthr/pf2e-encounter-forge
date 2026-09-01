import { RuntimeService } from "./base-service.js";

async function resolveUuid(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== "function") return null;
  try { return await globalThis.fromUuid(uuid); } catch { return null; }
}

function hpSnapshot(actor) {
  const hp = actor?.system?.attributes?.hp ?? actor?.system?.attributes?.hitPoints ?? null;
  const value = Number(hp?.value);
  const max = Number(hp?.max);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return { value: null, max: null, percent: null };
  return { value, max, percent: Math.max(0, Math.min(100, Math.round((value / max) * 100))) };
}

function actorLevel(actor) {
  const value = actor?.system?.details?.level?.value ?? actor?.system?.details?.level ?? null;
  if (value === null || value === undefined || value === "") return null;
  const level = Number(value);
  return Number.isInteger(level) ? level : null;
}

function fallbackActor(uuid) {
  const id = String(uuid ?? "").match(/^Actor\.([^.]*)$/)?.[1];
  return id ? globalThis.game?.actors?.get?.(id) ?? null : null;
}

export class ParticipantService extends RuntimeService {
  constructor({ bus = null, getInstance = () => null } = {}) {
    super("participants");
    this.bus = bus;
    this.getInstance = getInstance;
  }

  findByTokenDocument(token) {
    const instance = this.getInstance();
    if (!instance || !token) return null;
    const uuid = token.uuid ?? (token.parent?.id && token.id ? `Scene.${token.parent.id}.Token.${token.id}` : null);
    const participantId = token.flags?.["pf2e-encounter-forge"]?.participant?.participantId ?? null;
    return (instance.participants ?? []).find((entry) => (participantId && entry.id === participantId) || (uuid && entry.tokenUuid === uuid)) ?? null;
  }

  findByCombatant(combatant) {
    const instance = this.getInstance();
    if (!instance || !combatant) return null;
    const tokenId = combatant.tokenId ?? combatant.token?.id ?? null;
    const sceneId = combatant.sceneId ?? combatant.parent?.scene?.id ?? combatant.parent?.scene ?? null;
    return (instance.participants ?? []).find((entry) => {
      if (!entry.tokenUuid || !tokenId) return false;
      if (!entry.tokenUuid.endsWith(`.Token.${tokenId}`)) return false;
      return !sceneId || entry.tokenUuid.includes(`Scene.${sceneId}.Token.`);
    }) ?? null;
  }

  findByActor(actor) {
    const instance = this.getInstance();
    if (!instance || !actor) return [];

    // Unlinked Scene Tokens use synthetic Actors whose UUID does not equal the
    // materialized World Actor UUID stored on the Encounter participant. Resolve
    // those updates through the owning Token first so HP and other live changes
    // remain participant-specific.
    const token = actor.token?.document ?? actor.token ?? (actor.parent?.documentName === "Token" ? actor.parent : null);
    if (token) {
      const participant = this.findByTokenDocument(token);
      if (participant) return [participant];
    }

    const uuid = actor.uuid ?? (actor.id ? `Actor.${actor.id}` : null);
    return (instance.participants ?? []).filter((entry) => entry.actorUuid === uuid);
  }



  findByReference(referenceId) {
    const instance = this.getInstance();
    const id = String(referenceId ?? "").trim();
    if (!instance || !id) return [];
    return (instance.participants ?? []).filter((entry) => String(entry?.id ?? "") === id || String(entry?.templateId ?? "") === id);
  }

  async snapshotsForReference(referenceId) {
    return this.snapshots(this.findByReference(referenceId));
  }

  findByGroup(groupId) {
    const instance = this.getInstance();
    const id = String(groupId ?? "").trim();
    if (!instance || !id) return [];
    return (instance.participants ?? []).filter((entry) => String(entry?.groupId ?? "") === id);
  }

  async snapshotsForGroup(groupId) {
    return this.snapshots(this.findByGroup(groupId));
  }

  async resolveActors(target = {}) {
    const instance = this.getInstance();
    if (!instance) return [];
    const mode = String(target?.mode ?? "participant");
    const id = String(target?.id ?? "").trim();
    const rows = (instance.participants ?? []).filter((entry) => {
      if (mode === "all") return true;
      if (mode === "group") return Boolean(id) && String(entry.groupId ?? "") === id;
      return Boolean(id) && (String(entry.id ?? "") === id || String(entry.templateId ?? "") === id);
    });

    const actors = [];
    const seen = new Set();
    for (const participant of rows) {
      const token = await resolveUuid(participant.tokenUuid);
      const actor = token?.actor ?? await resolveUuid(participant.actorUuid) ?? fallbackActor(participant.actorUuid);
      if (!actor) continue;
      const key = actor.uuid ?? participant.tokenUuid ?? participant.actorUuid ?? participant.id;
      if (seen.has(key)) continue;
      seen.add(key);
      actors.push(actor);
    }
    return actors;
  }

  async snapshot(participant) {
    if (!participant) return null;
    const token = await resolveUuid(participant.tokenUuid);
    const actor = token?.actor ?? await resolveUuid(participant.actorUuid) ?? fallbackActor(participant.actorUuid);
    const hp = hpSnapshot(actor);
    return {
      id: participant.id,
      templateId: participant.templateId,
      actorUuid: participant.actorUuid ?? null,
      tokenUuid: participant.tokenUuid ?? null,
      name: token?.name ?? actor?.name ?? participant.display?.name ?? participant.id,
      img: token?.texture?.src ?? actor?.prototypeToken?.texture?.src ?? actor?.img ?? participant.display?.img ?? null,
      level: actorLevel(actor) ?? participant.display?.level ?? null,
      state: participant.state ?? "unknown",
      groupId: participant.groupId ?? null,
      tacticsProfileId: participant.tacticsProfileId ?? null,
      hp,
      tokenAvailable: Boolean(token),
      actorAvailable: Boolean(actor)
    };
  }

  async snapshots(participants = null) {
    const list = participants ?? this.getInstance()?.participants ?? [];
    const result = [];
    for (const participant of list) result.push(await this.snapshot(participant));
    return result;
  }
}
