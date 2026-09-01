import { MODULE_ID } from "../constants.js";
import { collectionContents } from "../utils/data.js";
import { RuntimeService } from "./base-service.js";
import { hpChangeDetected } from "../utils/change-paths.js";
import { combatSceneContext, sceneId } from "../utils/combat-context.js";

function uuidOf(document, fallback = null) {
  if (document?.uuid) return document.uuid;
  if (fallback && document?.id) return `${fallback}.${document.id}`;
  return null;
}

function hpSnapshot(actor) {
  const hp = actor?.system?.attributes?.hp ?? actor?.system?.attributes?.hitPoints ?? null;
  const value = Number(hp?.value);
  const max = Number(hp?.max);
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return { hpValue: null, hpMax: null, hpPercent: null };
  return {
    hpValue: value,
    hpMax: max,
    hpPercent: Math.max(0, Math.min(100, Math.round((value / max) * 100)))
  };
}

function tokenSceneId(token) {
  return String(token?.parent?.id ?? token?.scene?.id ?? token?.sceneId ?? "").trim() || null;
}

function regionDescriptor(region, token = null) {
  const scene = region?.parent ?? token?.parent ?? null;
  const sceneIdValue = String(scene?.id ?? region?.scene?.id ?? "").trim() || null;
  const id = String(region?.id ?? "").trim() || null;
  return {
    id,
    uuid: region?.uuid ?? (sceneIdValue && id ? `Scene.${sceneIdValue}.Region.${id}` : null),
    name: String(region?.name ?? id ?? "Region"),
    sceneId: sceneIdValue
  };
}

function regionCollection(token) {
  const direct = collectionContents(token?.regions);
  if (direct.length) return direct;
  const sceneRegions = collectionContents(token?.parent?.regions);
  return sceneRegions.filter((region) => {
    const tokens = collectionContents(region?.tokens);
    return tokens.some((entry) => entry === token || (entry?.id && entry.id === token?.id));
  });
}

function isPlayerCharacterToken(token) {
  return String(token?.actor?.type ?? "").toLowerCase() === "character";
}

export class EventService extends RuntimeService {
  constructor({ bus = null, getInstance = () => null, participants = null, hooksRef = globalThis.Hooks, gameRef = globalThis.game } = {}) {
    super("events");
    this.bus = bus;
    this.getInstance = getInstance;
    this.participants = participants;
    this.hooksRef = hooksRef;
    this.gameRef = gameRef;
    this.hooks = [];
    this.lastRounds = new Map();
    this.lastTurns = new Map();
    this.lastHp = new Map();
    this.lastRegions = new Map();
  }

  combatDiagnostic(combat) {
    const instance = this.getInstance();
    const combatUuid = uuidOf(combat, "Combat");
    const flagged = combat?.flags?.[MODULE_ID]?.encounter ?? {};
    const encounterSceneId = sceneId(instance?.deployment?.sceneUuid);
    const receivedContext = combatSceneContext(combat, { instance, gameRef: this.gameRef });
    const receivedSceneId = receivedContext.sceneId;
    const current = this.gameRef?.combat ?? null;
    const currentMatches = !current || current === combat || current?.id === combat?.id;

    let matches = false;
    let reason = "no-instance-or-combat";
    if (instance && combat) {
      if (instance.deployment?.combatUuid && combatUuid === instance.deployment.combatUuid) {
        matches = true;
        reason = "deployment-combat-uuid";
      } else if (flagged.instanceId === instance.id) {
        matches = true;
        reason = "combat-instance-id-flag";
      } else {
        const instanceUuid = instance.documentUuid ?? null;
        if (instanceUuid && flagged.instanceUuid === instanceUuid) {
          matches = true;
          reason = "combat-instance-uuid-flag";
        } else {
          const sameScene = Boolean(encounterSceneId && receivedSceneId === encounterSceneId);
          if (!sameScene) reason = "scene-mismatch";
          else if (!currentMatches) reason = "not-current-combat";
          else {
            matches = true;
            reason = "current-combat-on-encounter-scene";
          }
        }
      }
    }

    return {
      matches,
      reason,
      instanceId: instance?.id ?? null,
      instanceStatus: instance?.status ?? null,
      expectedCombatUuid: instance?.deployment?.combatUuid ?? null,
      expectedSceneId: encounterSceneId,
      receivedCombatUuid: combatUuid,
      receivedCombatId: combat?.id ?? null,
      receivedSceneId,
      receivedRound: combat?.round ?? null,
      receivedTurn: combat?.turn ?? null,
      receivedStarted: combat?.started ?? null,
      combatFlags: flagged,
      currentCombatId: current?.id ?? null,
      currentCombatUuid: uuidOf(current, "Combat"),
      currentCombatSceneId: combatSceneContext(current, { instance, gameRef: this.gameRef }).sceneId,
      receivedSceneContext: receivedContext,
      currentCombatRound: current?.round ?? null,
      currentCombatTurn: current?.turn ?? null,
      currentMatches
    };
  }

  #matchesCombat(combat) {
    return this.combatDiagnostic(combat).matches;
  }

  #debugHook(name, combat, payload = {}) {
    const diagnostic = this.combatDiagnostic(combat);
    const key = combat ? this.#combatKey(combat) : null;
    if (globalThis.__PF2E_ENCOUNTER_FORGE_DEBUG__ !== true) return;
    console.warn(`[PF2E Encounter Forge DEBUG] ${name}`, {
      diagnostic,
      payload,
      knownRound: key ? this.lastRounds.get(key) : undefined,
      knownTurn: key ? this.lastTurns.get(key) : undefined,
      serviceStarted: this.started
    });
  }

  #register(name, fn) {
    if (!this.hooksRef?.on) return;
    const id = this.hooksRef.on(name, fn);
    this.hooks.push({ name, id, fn });
  }

  async #emit(type, payload = {}) {
    const instance = this.getInstance();
    if (!instance) return;
    const event = {
      type,
      instanceId: instance.id,
      at: new Date().toISOString(),
      ...payload
    };
    await this.bus?.emit?.("encounter.event", event);
    await this.bus?.emit?.(type, event);
  }

  #combatKey(combat) {
    return uuidOf(combat, "Combat") ?? String(combat?.id ?? "combat");
  }

  #seedCombat(combat) {
    if (!this.#matchesCombat(combat)) return;
    const key = this.#combatKey(combat);
    const round = Number(combat?.round ?? 0);
    const turn = Number(combat?.turn ?? 0);
    if (Number.isFinite(round)) this.lastRounds.set(key, round);
    if (Number.isFinite(turn)) this.lastTurns.set(key, turn);
  }

  async #seedParticipantHp() {
    if (!this.participants?.snapshots) return;
    try {
      const snapshots = await this.participants.snapshots();
      for (const snapshot of snapshots ?? []) {
        const id = String(snapshot?.id ?? "").trim();
        if (!id) continue;
        const value = Number(snapshot?.hp?.value);
        const max = Number(snapshot?.hp?.max);
        const percent = Number(snapshot?.hp?.percent);
        if (!Number.isFinite(value) && !Number.isFinite(max) && !Number.isFinite(percent)) continue;
        this.lastHp.set(id, {
          hpValue: Number.isFinite(value) ? value : null,
          hpMax: Number.isFinite(max) ? max : null,
          hpPercent: Number.isFinite(percent) ? percent : null
        });
      }
    } catch {}
  }

  #encounterSceneId() {
    return sceneId(this.getInstance()?.deployment?.sceneUuid);
  }

  #isEncounterSceneToken(token) {
    const expected = this.#encounterSceneId();
    const received = tokenSceneId(token);
    return Boolean(expected && received && expected === received);
  }

  #tokenRegionMap(token) {
    const map = new Map();
    for (const region of regionCollection(token)) {
      const descriptor = regionDescriptor(region, token);
      if (descriptor.uuid) map.set(descriptor.uuid, { ...descriptor, document: region });
    }
    return map;
  }

  #sceneTokens() {
    const id = this.#encounterSceneId();
    if (!id) return [];
    const scene = this.gameRef?.scenes?.get?.(id) ?? (this.gameRef?.scenes?.contents ?? []).find?.((entry) => entry?.id === id) ?? null;
    return collectionContents(scene?.tokens);
  }

  #regionTokens(region) {
    const direct = collectionContents(region?.tokens);
    if (direct.length || region?.tokens) return direct;
    const regionUuid = regionDescriptor(region).uuid;
    if (!regionUuid) return [];
    return this.#sceneTokens().filter((token) => this.#tokenRegionMap(token).has(regionUuid));
  }

  #regionCounts(region, { token = null, eventType = null } = {}) {
    const rows = [...this.#regionTokens(region)];
    const eventTokenUuid = uuidOf(token);
    const hasEventToken = eventTokenUuid && rows.some((entry) => uuidOf(entry) === eventTokenUuid);
    if (eventType === "region.tokenEntered" && token && !hasEventToken) rows.push(token);
    if (eventType === "region.tokenExited" && eventTokenUuid) {
      for (let index = rows.length - 1; index >= 0; index -= 1) if (uuidOf(rows[index]) === eventTokenUuid) rows.splice(index, 1);
    }

    let playerCharacters = 0;
    let encounterParticipants = 0;
    const groupCounts = {};
    const seen = new Set();
    for (const row of rows) {
      const key = uuidOf(row) ?? String(row?.id ?? "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      if (isPlayerCharacterToken(row)) playerCharacters += 1;
      const participant = this.participants?.findByTokenDocument?.(row) ?? null;
      if (participant) {
        encounterParticipants += 1;
        const groupId = String(participant?.groupId ?? "").trim();
        if (groupId) groupCounts[groupId] = Number(groupCounts[groupId] ?? 0) + 1;
      }
    }
    return {
      regionTokenCount: seen.size || rows.length,
      regionPlayerCharacterCount: playerCharacters,
      regionEncounterParticipantCount: encounterParticipants,
      regionGroupParticipantCounts: groupCounts
    };
  }

  async #emitRegionEvent(type, token, regionLike) {
    const region = regionLike?.document ?? regionLike;
    const descriptor = regionLike?.uuid ? regionLike : regionDescriptor(region, token);
    const participant = this.participants?.findByTokenDocument?.(token) ?? null;
    const counts = this.#regionCounts(region, { token, eventType: type });
    await this.#emit(type, {
      participantId: participant?.id ?? null,
      tokenUuid: uuidOf(token),
      tokenId: token?.id ?? null,
      tokenName: token?.name ?? token?.actor?.name ?? null,
      actorUuid: uuidOf(token?.actor, "Actor"),
      isPlayerCharacter: isPlayerCharacterToken(token),
      regionId: descriptor?.id ?? region?.id ?? null,
      regionUuid: descriptor?.uuid ?? uuidOf(region),
      regionName: descriptor?.name ?? region?.name ?? null,
      regionSceneId: descriptor?.sceneId ?? tokenSceneId(token),
      ...counts
    });
  }

  async #processTokenRegions(token, { deleted = false, assumeEmptyPrevious = false } = {}) {
    if (!token || !this.#isEncounterSceneToken(token)) return false;
    const key = uuidOf(token);
    if (!key) return false;
    const previous = assumeEmptyPrevious ? new Map() : (this.lastRegions.get(key) ?? new Map());
    const current = deleted ? new Map() : this.#tokenRegionMap(token);
    this.lastRegions.set(key, current);

    let changed = false;
    for (const [uuid, descriptor] of current) {
      if (previous.has(uuid)) continue;
      changed = true;
      await this.#emitRegionEvent("region.tokenEntered", token, descriptor);
    }
    for (const [uuid, descriptor] of previous) {
      if (current.has(uuid)) continue;
      changed = true;
      await this.#emitRegionEvent("region.tokenExited", token, descriptor);
    }
    if (deleted) this.lastRegions.delete(key);
    return changed;
  }

  async #seedRegionMembership() {
    for (const token of this.#sceneTokens()) {
      const key = uuidOf(token);
      if (key) this.lastRegions.set(key, this.#tokenRegionMap(token));
    }
  }

  async #rescanRegionMembership() {
    for (const token of this.#sceneTokens()) await this.#processTokenRegions(token);
  }

  async #processParticipantHp(participant, actor, payload = {}) {
    const participantId = String(participant?.id ?? "").trim();
    if (!participantId) return false;
    const current = hpSnapshot(actor);
    const previous = this.lastHp.get(participantId) ?? null;
    const changed = !previous
      || current.hpValue !== previous.hpValue
      || current.hpMax !== previous.hpMax
      || current.hpPercent !== previous.hpPercent;
    if (!changed) return false;

    // Reserve the new HP state before awaiting listeners. Synthetic Token Actors may
    // surface the same underlying update through more than one Foundry document hook.
    // Early reservation keeps directional HP events idempotent.
    this.lastHp.set(participantId, current);
    const eventPayload = {
      participantId,
      ...payload,
      ...current,
      previousHpValue: previous?.hpValue ?? null,
      previousHpMax: previous?.hpMax ?? null,
      previousHpPercent: previous?.hpPercent ?? null
    };

    await this.#emit("participant.hpChanged", eventPayload);
    const before = previous?.hpValue ?? null;
    const after = current.hpValue ?? null;
    if (Number.isFinite(before) && Number.isFinite(after)) {
      if (after < before) await this.#emit("participant.hpDecreased", eventPayload);
      else if (after > before) await this.#emit("participant.hpIncreased", eventPayload);
    }
    return true;
  }

  async #processCombatState(combat, { roundSignal = false, turnSignal = false, roundValue = undefined, turnValue = undefined } = {}) {
    if (!this.#matchesCombat(combat)) return;
    const key = this.#combatKey(combat);
    // combatStart/combatRound/combatTurn fire BEFORE Foundry updates the Combat
    // document. Their updateData argument therefore contains the new values while
    // combat.round/combat.turn still contain the previous state. Prefer explicit
    // hook values when supplied and fall back to the persisted document otherwise.
    const round = Number(roundValue ?? combat?.round ?? 0);
    const turn = Number(turnValue ?? combat?.turn ?? 0);
    const combatUuid = uuidOf(combat, "Combat");

    if (roundSignal && Number.isFinite(round)) {
      const known = this.lastRounds.get(key);
      const changed = known === undefined || round !== known;
      if (changed) {
        // Reserve the new state BEFORE awaiting any Runtime listeners. Foundry v14 can
        // deliver combatStart/updateCombat/combatTurnChange for the same transition in
        // quick succession without awaiting module callbacks. Reserving synchronously
        // makes those parallel signal paths genuinely idempotent.
        this.lastRounds.set(key, round);

        // The first observed round establishes the Runtime baseline. Never synthesize
        // earlier completed rounds here: starting/binding an Encounter in an existing
        // Combat must not retroactively fire round-end mechanics.
        if (known !== undefined && round > known && known > 0) {
          // Manual round jumps after the baseline still represent completed rounds.
          for (let completed = known; completed < round; completed += 1) {
            await this.#emit("combat.roundEnded", { combatUuid, round: completed, nextRound: completed + 1, turn });
          }
        }
        await this.#emit("combat.roundChanged", { combatUuid, round, turn });
      }
    }

    if (turnSignal && Number.isFinite(turn)) {
      const knownTurn = this.lastTurns.get(key);
      if (knownTurn === undefined || turn !== knownTurn) {
        // Same reservation rule as rounds: suppress concurrent duplicate Foundry hooks.
        this.lastTurns.set(key, turn);
        // The first observed turn is a baseline. Once a baseline exists, moving to a
        // different turn means the previous combatant's turn has completed.
        if (knownTurn !== undefined) await this.#emit("combat.turnEnded", { combatUuid, round, turn: knownTurn, nextTurn: turn });
        await this.#emit("combat.turnChanged", { combatUuid, round, turn });
      }
    }
  }

  async start() {
    if (this.started) return this.status();
    await super.start();

    this.#register("updateCombat", async (combat, changed = {}) => {
      this.#debugHook("updateCombat", combat, { changed });
      await this.#processCombatState(combat, {
        roundSignal: Object.prototype.hasOwnProperty.call(changed, "round"),
        turnSignal: Object.prototype.hasOwnProperty.call(changed, "turn"),
        roundValue: changed?.round,
        turnValue: changed?.turn
      });
    });

    // Dedicated Foundry combat hooks are used as a second, deduplicated signal path.
    // PF2e/Core may reach these through code paths whose update payload does not expose
    // the exact dotted/flat fields Encounter Forge expected in earlier alphas.
    this.#register("combatStart", async (combat, updateData = {}) => {
      this.#debugHook("combatStart", combat, { updateData });
      await this.#processCombatState(combat, {
        roundSignal: true,
        turnSignal: true,
        roundValue: updateData?.round,
        turnValue: updateData?.turn
      });
    });
    this.#register("combatRound", async (combat, updateData = {}) => {
      this.#debugHook("combatRound", combat, { updateData });
      await this.#processCombatState(combat, {
        roundSignal: true,
        turnSignal: true,
        roundValue: updateData?.round,
        turnValue: updateData?.turn
      });
    });
    this.#register("combatTurn", async (combat, updateData = {}) => {
      this.#debugHook("combatTurn", combat, { updateData });
      await this.#processCombatState(combat, {
        turnSignal: true,
        roundValue: updateData?.round,
        turnValue: updateData?.turn
      });
    });
    // v14 also exposes an after-update combatTurnChange hook. This is useful as a
    // third deduplicated path and is especially robust with systems which customize
    // Combat advancement. `current` is the already-applied round/turn state.
    this.#register("combatTurnChange", async (combat, _prior = {}, current = {}) => {
      this.#debugHook("combatTurnChange", combat, { prior: _prior, current });
      const previousRound = this.lastRounds.get(this.#combatKey(combat));
      const currentRound = Number(current?.round ?? combat?.round ?? 0);
      const roundSignal = Number.isFinite(currentRound) && currentRound !== previousRound;
      await this.#processCombatState(combat, {
        roundSignal,
        turnSignal: true,
        roundValue: current?.round,
        turnValue: current?.turn
      });
    });

    this.#register("updateCombatant", async (combatant, changed = {}) => {
      if (!this.#matchesCombat(combatant?.parent)) return;
      const participant = this.participants?.findByCombatant?.(combatant);
      if (!participant) return;
      if (Object.prototype.hasOwnProperty.call(changed, "defeated")) {
        await this.#emit(changed.defeated ? "participant.defeated" : "participant.restored", {
          participantId: participant.id,
          combatantId: combatant.id ?? null
        });
      }
    });

    this.#register("updateToken", async (token, changed = {}) => {
      await this.#processTokenRegions(token);
      const participant = this.participants?.findByTokenDocument?.(token);
      if (!participant) return;
      const hpChanged = hpChangeDetected(changed);
      if (hpChanged) {
        await this.#processParticipantHp(participant, token?.actor, { tokenUuid: uuidOf(token), changed });
      } else {
        await this.#emit("participant.tokenUpdated", { participantId: participant.id, tokenUuid: uuidOf(token), changed });
      }
    });

    this.#register("createToken", async (token) => {
      await this.#processTokenRegions(token, { assumeEmptyPrevious: true });
    });

    const rescanEncounterRegion = async (region) => {
      if (String(region?.parent?.id ?? "") !== String(this.#encounterSceneId() ?? "")) return;
      // Region geometry/membership is updated by Foundry as part of the document
      // transaction. Yield once so TokenDocument.regions / RegionDocument.tokens
      // reflect the new authoritative containment before diffing snapshots.
      await Promise.resolve();
      await this.#rescanRegionMembership();
    };
    this.#register("createRegion", rescanEncounterRegion);
    this.#register("updateRegion", rescanEncounterRegion);
    this.#register("deleteRegion", rescanEncounterRegion);

    this.#register("updateActor", async (actor, changed = {}) => {
      const participants = this.participants?.findByActor?.(actor) ?? [];
      if (!participants.length) return;
      const hpChanged = hpChangeDetected(changed);
      for (const participant of participants) {
        if (hpChanged) {
          await this.#processParticipantHp(participant, actor, { actorUuid: uuidOf(actor, "Actor"), changed });
        } else {
          await this.#emit("participant.actorUpdated", { participantId: participant.id, actorUuid: uuidOf(actor, "Actor"), changed });
        }
      }
    });

    this.#register("deleteToken", async (token) => {
      await this.#processTokenRegions(token, { deleted: true });
      const participant = this.participants?.findByTokenDocument?.(token);
      if (!participant) return;
      await this.#emit("participant.tokenDeleted", { participantId: participant.id, tokenUuid: uuidOf(token) });
    });

    // Seed the current combat after hooks are live. This prevents activating an Encounter
    // in the middle of round 1 from later mistaking the transition to round 2 for an
    // unknown initial state while still allowing tests/direct calls to infer round N-1.
    await this.#seedParticipantHp();
    await this.#seedRegionMembership();
    const current = this.gameRef?.combat ?? null;
    if (current) this.#seedCombat(current);
    if (globalThis.__PF2E_ENCOUNTER_FORGE_DEBUG__ === true) console.warn("[PF2E Encounter Forge DEBUG] EventService started", this.debugSnapshot());

    return this.status();
  }

  async stop() {
    for (const { name, id, fn } of this.hooks.splice(0)) {
      try { this.hooksRef?.off?.(name, id ?? fn); } catch {}
    }
    this.lastRounds.clear();
    this.lastTurns.clear();
    this.lastHp.clear();
    this.lastRegions.clear();
    return super.stop();
  }

  debugSnapshot() {
    const combats = collectionContents(this.gameRef?.combats);
    const current = this.gameRef?.combat ?? null;
    return {
      service: this.status(),
      instance: (() => {
        const instance = this.getInstance();
        return instance ? {
          id: instance.id,
          status: instance.status,
          documentUuid: instance.documentUuid ?? null,
          deployment: {
            sceneUuid: instance.deployment?.sceneUuid ?? null,
            combatUuid: instance.deployment?.combatUuid ?? null
          },
          runtimeRound: instance.runtimeVariables?.round ?? null,
          runtimeTurn: instance.runtimeVariables?.turn ?? null
        } : null;
      })(),
      currentCombat: current ? this.combatDiagnostic(current) : null,
      combats: combats.map((combat) => this.combatDiagnostic(combat)),
      lastRounds: Object.fromEntries(this.lastRounds),
      lastTurns: Object.fromEntries(this.lastTurns),
      lastHp: Object.fromEntries(this.lastHp),
      lastRegions: Object.fromEntries([...this.lastRegions].map(([tokenUuid, regions]) => [tokenUuid, [...regions.keys()]]))
    };
  }

  status() {
    return { ...super.status(), hookCount: this.hooks.length };
  }
}
