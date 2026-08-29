import { MODULE_ID } from "../constants.js";
import { RuntimeService } from "./base-service.js";

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

function hasPathLike(change, needles) {
  const text = JSON.stringify(change ?? {}).toLowerCase();
  return needles.some((needle) => text.includes(String(needle).toLowerCase()));
}

export class EventService extends RuntimeService {
  constructor({ bus = null, getInstance = () => null, participants = null, hooksRef = globalThis.Hooks } = {}) {
    super("events");
    this.bus = bus;
    this.getInstance = getInstance;
    this.participants = participants;
    this.hooksRef = hooksRef;
    this.hooks = [];
  }

  #matchesCombat(combat) {
    const instance = this.getInstance();
    if (!instance || !combat) return false;
    const combatUuid = uuidOf(combat, "Combat");
    if (instance.deployment?.combatUuid && combatUuid === instance.deployment.combatUuid) return true;
    const flagged = combat.flags?.[MODULE_ID]?.encounter?.instanceId;
    return flagged === instance.id;
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

  async start() {
    if (this.started) return this.status();
    await super.start();

    this.#register("updateCombat", async (combat, changed = {}) => {
      if (!this.#matchesCombat(combat)) return;
      if (Object.prototype.hasOwnProperty.call(changed, "round")) {
        const currentRound = Number(combat.round ?? changed.round ?? 0);
        if (currentRound > 1) {
          await this.#emit("combat.roundEnded", {
            combatUuid: uuidOf(combat, "Combat"),
            round: currentRound - 1,
            nextRound: currentRound,
            turn: Number(combat.turn ?? 0)
          });
        }
        await this.#emit("combat.roundChanged", { combatUuid: uuidOf(combat, "Combat"), round: currentRound, turn: Number(combat.turn ?? 0) });
      }
      if (Object.prototype.hasOwnProperty.call(changed, "turn")) {
        await this.#emit("combat.turnChanged", { combatUuid: uuidOf(combat, "Combat"), round: Number(combat.round ?? 0), turn: Number(combat.turn ?? changed.turn ?? 0) });
      }
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
      const participant = this.participants?.findByTokenDocument?.(token);
      if (!participant) return;
      const hpChanged = hasPathLike(changed, ["attributes.hp", "system.attributes.hp", "delta"]);
      await this.#emit(hpChanged ? "participant.hpChanged" : "participant.tokenUpdated", {
        participantId: participant.id,
        tokenUuid: uuidOf(token),
        ...(hpChanged ? hpSnapshot(token?.actor) : {}),
        changed
      });
    });

    this.#register("updateActor", async (actor, changed = {}) => {
      const participants = this.participants?.findByActor?.(actor) ?? [];
      if (!participants.length) return;
      const hpChanged = hasPathLike(changed, ["attributes.hp", "system.attributes.hp"]);
      for (const participant of participants) {
        await this.#emit(hpChanged ? "participant.hpChanged" : "participant.actorUpdated", {
          participantId: participant.id,
          actorUuid: uuidOf(actor, "Actor"),
          ...(hpChanged ? hpSnapshot(actor) : {}),
          changed
        });
      }
    });

    this.#register("deleteToken", async (token) => {
      const participant = this.participants?.findByTokenDocument?.(token);
      if (!participant) return;
      await this.#emit("participant.tokenDeleted", { participantId: participant.id, tokenUuid: uuidOf(token) });
    });

    return this.status();
  }

  async stop() {
    for (const { name, id, fn } of this.hooks.splice(0)) {
      try { this.hooksRef?.off?.(name, id ?? fn); } catch {}
    }
    return super.stop();
  }

  status() {
    return { ...super.status(), hookCount: this.hooks.length };
  }
}
