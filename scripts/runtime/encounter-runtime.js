import { MODULE_ID } from "../constants.js";
import { assertEncounterInstance } from "../model/encounter-instance.js";
import { deepClone, nowIso, randomId } from "../utils/data.js";
import { EncounterForgeError } from "../utils/errors.js";
import { AuthorityService } from "./authority-service.js";
import { EncounterEventBus } from "./event-bus.js";
import { EventService } from "./event-service.js";
import { TriggerService } from "./trigger-service.js";
import { PhaseService } from "./phase-service.js";
import { ObjectiveService } from "./objective-service.js";
import { ParticipantService } from "./participant-service.js";
import { TacticsService } from "./tactics-service.js";
import { ActionService } from "./action-service.js";
import { RuntimePersistenceService } from "./persistence-service.js";

function localize(key, fallback = key, data = null) {
  try {
    if (data && globalThis.game?.i18n?.format) {
      const value = game.i18n.format(key, data);
      return value === key ? fallback : value;
    }
    const value = globalThis.game?.i18n?.localize?.(key);
    return value === key ? fallback : value;
  } catch { return fallback; }
}

function ensureRuntimeShape(instance) {
  instance.participants ??= [];
  instance.objectives ??= {};
  instance.triggeredEvents ??= [];
  instance.suppressedEvents ??= [];
  instance.decisions ??= [];
  instance.runtimeVariables ??= {};
  instance.log ??= [];
  instance.metadata ??= {};
  instance.metadata.startedAt ??= null;
  instance.metadata.pausedAt ??= null;
  instance.metadata.completedAt ??= null;
  return instance;
}

function actionIdsForTrigger(trigger) {
  const raw = trigger?.actions ?? trigger?.actionIds ?? [];
  return Array.isArray(raw) ? raw.map(String) : [];
}

export class EncounterRuntime {
  constructor({ instanceRepository, blueprintRepository = null, integrations, gameRef = globalThis.game, hooksRef = globalThis.Hooks } = {}) {
    this.instanceRepository = instanceRepository;
    this.blueprintRepository = blueprintRepository;
    this.integrations = integrations;
    this.gameRef = gameRef;
    this.hooksRef = hooksRef;
    this.bus = new EncounterEventBus();
    this.authority = new AuthorityService({ gameRef });
    this.instance = null;
    this.blueprint = null;
    this.activeInstanceId = null;
    this.started = false;
    this.bootstrapHooks = [];

    const getInstance = () => this.instance;
    const getBlueprint = () => this.blueprint;
    const participants = new ParticipantService({ bus: this.bus, getInstance });
    this.services = Object.freeze({
      participants,
      events: new EventService({ bus: this.bus, getInstance, participants, hooksRef }),
      triggers: new TriggerService({
        bus: this.bus,
        getInstance,
        getBlueprint,
        enabled: () => this.instance?.status === "active",
        onTrigger: (trigger, event) => this.#handleTrigger(trigger, event)
      }),
      phases: new PhaseService({ getInstance, getBlueprint }),
      objectives: new ObjectiveService({ getInstance, getBlueprint }),
      tactics: new TacticsService({ getBlueprint }),
      actions: new ActionService({
        bus: this.bus,
        integrations,
        handlers: {
          phaseTransition: (phaseId, context) => this.setPhase(phaseId, { reason: context?.reason ?? "action" }),
          objectiveProgress: (objectiveId, amount, context) => this.adjustObjective(objectiveId, amount, { reason: context?.reason ?? "action" }),
          directorMessage: (message, context) => this.addLog("director.message", message, context)
        }
      }),
      persistence: new RuntimePersistenceService({ repository: instanceRepository })
    });

    this.bus.on("participant.defeated", (event) => this.#setParticipantStateFromEvent(event, "defeated"));
    this.bus.on("participant.restored", (event) => this.#setParticipantStateFromEvent(event, "ready"));
    this.bus.on("participant.tokenDeleted", (event) => this.#setParticipantStateFromEvent(event, "removed"));
    this.bus.on("combat.roundChanged", (event) => this.#onRoundChanged(event));
    for (const type of ["participant.hpChanged", "participant.actorUpdated", "participant.tokenUpdated", "combat.turnChanged", "combat.roundEnded", "objective.progressChanged", "objective.completed"]) {
      this.bus.on(type, () => this.bus.emit("director.changed", { instanceId: this.activeInstanceId, reason: type }));
    }
  }

  #assertAuthority(force = false) {
    if (!force && !this.authority.isAuthoritative()) {
      throw new EncounterForgeError("Encounter Runtime mutations may only run on the authoritative GM client.", { code: "RUNTIME_NOT_AUTHORITATIVE" });
    }
  }

  #entry(instanceOrId) {
    if (instanceOrId && typeof instanceOrId === "object" && instanceOrId.schemaVersion) return { data: deepClone(instanceOrId), document: null };
    const key = String(instanceOrId ?? this.activeInstanceId ?? "").trim();
    return key ? this.instanceRepository?.get?.(key) ?? null : null;
  }

  #blueprintFor(instance) {
    if (!instance) return null;
    return this.blueprintRepository?.get?.(instance.blueprint?.uuid ?? instance.blueprint?.id)?.data
      ?? this.blueprintRepository?.get?.(instance.blueprint?.id)?.data
      ?? null;
  }

  async #persist({ emit = true, reason = "update" } = {}) {
    if (!this.instance) return null;
    ensureRuntimeShape(this.instance);
    const saved = await this.services.persistence.save(this.instance);
    this.instance = ensureRuntimeShape(deepClone(saved?.data ?? this.instance));
    this.activeInstanceId = this.instance.id;
    if (emit) await this.bus.emit("instance.changed", { instanceId: this.instance.id, reason, status: this.instance.status });
    if (emit) await this.bus.emit("director.changed", { instanceId: this.instance.id, reason });
    return saved;
  }

  async addLog(type, message, data = {}) {
    if (!this.instance) return null;
    const entry = {
      id: randomId("log"),
      at: nowIso(),
      type: String(type ?? "runtime"),
      message: String(message ?? "").trim(),
      data: deepClone(data ?? {})
    };
    this.instance.log.push(entry);
    if (this.instance.log.length > 300) this.instance.log.splice(0, this.instance.log.length - 300);
    return entry;
  }

  async start(instanceOrId = null, { force = false } = {}) {
    this.#assertAuthority(force);
    const entry = this.#entry(instanceOrId);
    if (!entry?.data) throw new EncounterForgeError("Encounter Instance was not found.", { code: "RUNTIME_INSTANCE_NOT_FOUND" });
    assertEncounterInstance(entry.data);

    const next = ensureRuntimeShape(deepClone(entry.data));
    if (this.started && this.activeInstanceId && this.activeInstanceId !== next.id) {
      if (this.instance?.status === "active") {
        this.instance.status = "paused";
        this.instance.metadata.pausedAt = nowIso();
        await this.addLog("encounter.paused", localize("PF2E_ENCOUNTER_FORGE.Director.Log.Paused", "Encounter paused."), { reason: "runtime-switch" });
        await this.#persist({ reason: "runtime-switch" });
      }
      await this.stop({ clear: true });
    }
    this.instance = next;
    this.blueprint = this.#blueprintFor(next);
    this.activeInstanceId = next.id;

    for (const service of Object.values(this.services)) await service.start();
    this.started = true;
    await this.bus.emit("runtime.started", { instanceId: this.activeInstanceId, status: next.status });
    await this.bus.emit("director.changed", { instanceId: this.activeInstanceId, reason: "runtime.started" });
    return this.status();
  }

  async stop({ clear = true } = {}) {
    for (const service of [...Object.values(this.services)].reverse()) await service.stop();
    this.started = false;
    const stopped = this.activeInstanceId;
    if (clear) {
      this.activeInstanceId = null;
      this.instance = null;
      this.blueprint = null;
    }
    await this.bus.emit("runtime.stopped", { instanceId: stopped });
    return this.status();
  }

  async activate(instanceOrId = null, { force = false, reason = "manual" } = {}) {
    this.#assertAuthority(force);
    const targetId = typeof instanceOrId === "string" ? instanceOrId : instanceOrId?.id;
    if (!this.started || (targetId && this.activeInstanceId !== targetId)) await this.start(instanceOrId, { force: true });
    if (!this.instance) throw new EncounterForgeError("No Encounter Instance is bound to the Runtime.", { code: "RUNTIME_NO_INSTANCE" });
    if (this.instance.status === "completed" || this.instance.status === "aborted") {
      throw new EncounterForgeError("A completed or aborted Encounter cannot be activated.", { code: "RUNTIME_INSTANCE_FINAL" });
    }
    if (this.instance.status !== "active") {
      this.instance.status = "active";
      this.instance.metadata.startedAt ??= nowIso();
      this.instance.metadata.pausedAt = null;
      for (const participant of this.instance.participants ?? []) {
        if (["ready", "materialized", "pending"].includes(participant.state)) participant.state = "active";
      }
      const combatUuid = this.instance.deployment?.combatUuid;
      const combat = this.gameRef?.combat;
      const currentCombatUuid = combat?.uuid ?? (combat?.id ? `Combat.${combat.id}` : null);
      if (combatUuid && currentCombatUuid === combatUuid) {
        this.instance.runtimeVariables.round = Number(combat.round ?? 0);
        this.instance.runtimeVariables.turn = Number(combat.turn ?? 0);
      }
      await this.addLog("encounter.started", localize("PF2E_ENCOUNTER_FORGE.Director.Log.Started", "Encounter started."), { reason });
      await this.#persist({ reason: "activate" });
    }
    await this.bus.emit("encounter.activated", { instanceId: this.instance.id, reason });
    return this.status();
  }

  async pause({ force = false } = {}) {
    this.#assertAuthority(force);
    if (!this.instance || this.instance.status !== "active") return this.status();
    this.instance.status = "paused";
    this.instance.metadata.pausedAt = nowIso();
    await this.addLog("encounter.paused", localize("PF2E_ENCOUNTER_FORGE.Director.Log.Paused", "Encounter paused."));
    await this.#persist({ reason: "pause" });
    return this.status();
  }

  async resume({ force = false } = {}) {
    this.#assertAuthority(force);
    if (!this.instance) throw new EncounterForgeError("No Encounter Instance is bound to the Runtime.", { code: "RUNTIME_NO_INSTANCE" });
    if (this.instance.status !== "paused") return this.status();
    this.instance.status = "active";
    this.instance.metadata.pausedAt = null;
    await this.addLog("encounter.resumed", localize("PF2E_ENCOUNTER_FORGE.Director.Log.Resumed", "Encounter resumed."));
    await this.#persist({ reason: "resume" });
    return this.status();
  }

  async complete({ force = false } = {}) {
    this.#assertAuthority(force);
    if (!this.instance) throw new EncounterForgeError("No Encounter Instance is bound to the Runtime.", { code: "RUNTIME_NO_INSTANCE" });
    if (this.instance.status === "completed") return this.status();
    this.instance.status = "completed";
    this.instance.metadata.completedAt = nowIso();
    await this.addLog("encounter.completed", localize("PF2E_ENCOUNTER_FORGE.Director.Log.Completed", "Encounter completed."));
    await this.#persist({ reason: "complete" });
    await this.bus.emit("encounter.completed", { instanceId: this.instance.id });
    return this.status();
  }

  async reopen({ force = false, reason = "manual" } = {}) {
    this.#assertAuthority(force);
    if (!this.instance) throw new EncounterForgeError("No Encounter Instance is bound to the Runtime.", { code: "RUNTIME_NO_INSTANCE" });
    if (this.instance.status !== "completed") return this.status();
    this.instance.status = "active";
    this.instance.metadata.completedAt = null;
    this.instance.metadata.pausedAt = null;
    await this.addLog("encounter.reopened", localize("PF2E_ENCOUNTER_FORGE.Director.Log.Reopened", "Encounter completion was undone and the Encounter resumed."), { reason });
    await this.#persist({ reason: "reopen" });
    await this.bus.emit("encounter.reopened", { instanceId: this.instance.id, reason });
    return this.status();
  }

  async setPhase(phaseId, { force = false, reason = "manual" } = {}) {
    this.#assertAuthority(force);
    if (!this.instance) throw new EncounterForgeError("No Encounter Instance is bound to the Runtime.", { code: "RUNTIME_NO_INSTANCE" });
    const id = String(phaseId ?? "").trim();
    if (id && !this.services.phases.has(id)) throw new EncounterForgeError(`Unknown Encounter phase '${id}'.`, { code: "RUNTIME_PHASE_UNKNOWN" });
    if (this.instance.currentPhaseId === (id || null)) return this.instance.currentPhaseId;
    const previous = this.instance.currentPhaseId;
    this.instance.currentPhaseId = id || null;
    const phase = this.services.phases.current();
    await this.addLog("phase.changed", localize("PF2E_ENCOUNTER_FORGE.Director.Log.PhaseChanged", `Phase changed to ${phase?.name ?? id}.`, { phase: phase?.name ?? id }), { previous, current: id, reason });
    await this.#persist({ reason: "phase" });
    await this.bus.emit("phase.changed", { instanceId: this.instance.id, previousPhaseId: previous, phaseId: id, reason });
    return id;
  }

  async adjustObjective(objectiveId, amount = 1, { force = false, reason = "manual" } = {}) {
    this.#assertAuthority(force);
    if (!this.instance) throw new EncounterForgeError("No Encounter Instance is bound to the Runtime.", { code: "RUNTIME_NO_INSTANCE" });
    const id = String(objectiveId ?? "").trim();
    const state = this.instance.objectives?.[id];
    if (!state) throw new EncounterForgeError(`Unknown Encounter objective '${id}'.`, { code: "RUNTIME_OBJECTIVE_UNKNOWN" });
    const previousProgress = Number(state.progress ?? 0);
    const previousObjectiveState = String(state.state ?? "active");
    state.progress = Math.max(0, previousProgress + Number(amount ?? 0));
    if (Number.isFinite(Number(state.target)) && state.progress >= Number(state.target)) state.state = "completed";
    else if (state.state === "completed" && state.progress < Number(state.target)) state.state = "active";
    await this.addLog("objective.progress", localize("PF2E_ENCOUNTER_FORGE.Director.Log.ObjectiveProgress", `Objective ${id}: ${state.progress}.`, { objective: id, progress: state.progress }), { objectiveId: id, progress: state.progress, target: state.target, reason });
    await this.#persist({ reason: "objective" });

    const event = {
      type: "objective.progressChanged",
      instanceId: this.instance.id,
      at: nowIso(),
      objectiveId: id,
      progress: Number(state.progress ?? 0),
      previousProgress,
      target: Number.isFinite(Number(state.target)) ? Number(state.target) : null,
      objectiveState: String(state.state ?? "active"),
      previousObjectiveState,
      reason
    };
    await this.bus.emit("encounter.event", event);
    await this.bus.emit(event.type, event);

    if (previousObjectiveState !== "completed" && state.state === "completed") {
      const completedEvent = { ...event, type: "objective.completed", at: nowIso() };
      await this.bus.emit("encounter.event", completedEvent);
      await this.bus.emit(completedEvent.type, completedEvent);
    }
    return deepClone(state);
  }

  async setObjectiveState(objectiveId, state, { force = false } = {}) {
    this.#assertAuthority(force);
    if (!this.instance?.objectives?.[objectiveId]) throw new EncounterForgeError(`Unknown Encounter objective '${objectiveId}'.`, { code: "RUNTIME_OBJECTIVE_UNKNOWN" });
    this.instance.objectives[objectiveId].state = String(state ?? "active");
    await this.#persist({ reason: "objective-state" });
    return deepClone(this.instance.objectives[objectiveId]);
  }

  async #setParticipantStateFromEvent(event, state) {
    if (!this.instance || event?.instanceId !== this.instance.id) return;
    const participant = this.instance.participants.find((entry) => entry.id === event.participantId);
    if (!participant || participant.state === state) return;
    participant.state = state;
    await this.addLog("participant.state", localize("PF2E_ENCOUNTER_FORGE.Director.Log.ParticipantState", `${participant.id}: ${state}.`, { participant: participant.id, state }), { participantId: participant.id, state });
    await this.#persist({ reason: "participant-state" });
  }

  async #onRoundChanged(event) {
    if (!this.instance || event?.instanceId !== this.instance.id) return;
    this.instance.runtimeVariables.round = Number(event.round ?? 0);
    this.instance.runtimeVariables.turn = Number(event.turn ?? 0);
    if (this.instance.status === "active") {
      await this.addLog("combat.round", localize("PF2E_ENCOUNTER_FORGE.Director.Log.Round", `Round ${event.round}.`, { round: event.round }), { round: event.round });
      await this.#persist({ reason: "round" });
    } else {
      await this.bus.emit("director.changed", { instanceId: this.instance.id, reason: "round" });
    }
  }

  async #handleTrigger(trigger, event) {
    if (!this.instance || this.instance.status !== "active") return null;
    if (!this.instance.triggeredEvents.includes(trigger.id)) this.instance.triggeredEvents.push(trigger.id);
    const actionIds = actionIdsForTrigger(trigger);
    const actions = actionIds.map((id) => (this.blueprint?.actions ?? []).find((entry) => entry.id === id)).filter(Boolean);
    if (trigger.phaseId && !actions.some((action) => (action.type ?? action.kind) === "phase.transition")) {
      actions.push({ id: `${trigger.id}-phase`, type: "phase.transition", phaseId: trigger.phaseId });
    }
    const confirm = trigger.confirm !== false && trigger.automatic !== true;
    if (confirm && actions.length) {
      const decision = {
        id: randomId("decision"),
        type: "trigger-actions",
        status: "pending",
        createdAt: nowIso(),
        resolvedAt: null,
        triggerId: trigger.id,
        actionIds: actions.map((action) => action.id).filter(Boolean),
        actions: deepClone(actions),
        title: String(trigger.title ?? trigger.name ?? localize("PF2E_ENCOUNTER_FORGE.Director.Decision.Title", "Encounter decision")),
        message: String(trigger.message ?? trigger.prompt ?? localize("PF2E_ENCOUNTER_FORGE.Director.Decision.TriggerPrompt", "A prepared Encounter trigger has fired. Apply its actions?")),
        event: deepClone(event)
      };
      this.instance.decisions.push(decision);
      await this.addLog("trigger.pending", localize("PF2E_ENCOUNTER_FORGE.Director.Log.TriggerPending", `Trigger ${trigger.id} requires a GM decision.`, { trigger: trigger.name ?? trigger.id }), { triggerId: trigger.id, decisionId: decision.id });
      await this.#persist({ reason: "trigger-decision" });
      await this.bus.emit("decision.required", { instanceId: this.instance.id, decision: deepClone(decision) });
      return decision;
    }

    await this.addLog("trigger.fired", localize("PF2E_ENCOUNTER_FORGE.Director.Log.TriggerFired", `Trigger ${trigger.id} fired.`, { trigger: trigger.name ?? trigger.id }), { triggerId: trigger.id });
    for (const action of actions) await this.services.actions.execute(action, { trigger, event, reason: `trigger:${trigger.id}` });
    await this.#persist({ reason: "trigger" });
    return { triggerId: trigger.id, automatic: true };
  }

  async resolveDecision(decisionId, resolution, { force = false } = {}) {
    this.#assertAuthority(force);
    if (!this.instance) throw new EncounterForgeError("No Encounter Instance is bound to the Runtime.", { code: "RUNTIME_NO_INSTANCE" });
    const decision = this.instance.decisions.find((entry) => entry.id === decisionId);
    if (!decision) throw new EncounterForgeError(`Unknown Encounter decision '${decisionId}'.`, { code: "RUNTIME_DECISION_UNKNOWN" });
    if (decision.status !== "pending") return deepClone(decision);
    const accepted = resolution === true || resolution === "accept" || resolution === "accepted";
    decision.status = accepted ? "accepted" : "dismissed";
    decision.resolvedAt = nowIso();
    if (accepted) {
      for (const action of decision.actions ?? []) await this.services.actions.execute(action, { decision, reason: `decision:${decision.id}` });
      await this.addLog("decision.accepted", localize("PF2E_ENCOUNTER_FORGE.Director.Log.DecisionAccepted", "GM accepted the Encounter decision."), { decisionId });
    } else {
      await this.addLog("decision.dismissed", localize("PF2E_ENCOUNTER_FORGE.Director.Log.DecisionDismissed", "GM dismissed the Encounter decision."), { decisionId });
    }
    await this.#persist({ reason: "decision" });
    await this.bus.emit("decision.resolved", { instanceId: this.instance.id, decisionId, resolution: decision.status });
    return deepClone(decision);
  }

  async inspect(instanceOrId = null) {
    const entry = this.#entry(instanceOrId);
    if (!entry?.data) return null;
    const instance = ensureRuntimeShape(deepClone(entry.data));
    const blueprint = this.activeInstanceId === instance.id && this.blueprint ? deepClone(this.blueprint) : deepClone(this.#blueprintFor(instance));
    const participants = await this.services.participants.snapshots(instance.participants);
    const templates = new Map((blueprint?.participants ?? []).map((entry) => [entry.id, entry]));
    for (const participant of participants) {
      const runtimeParticipant = instance.participants.find((entry) => entry.id === participant.id);
      const template = templates.get(runtimeParticipant?.templateId);
      participant.role = template?.role ?? null;
      participant.groupId = runtimeParticipant?.groupId ?? template?.groupId ?? null;
      participant.tactics = this.activeInstanceId === instance.id ? this.services.tactics.recommendation(runtimeParticipant) : null;
    }
    return { instance, blueprint, participants, runtimeBound: this.started && this.activeInstanceId === instance.id, authoritative: this.authority.isAuthoritative() };
  }

  async restore({ force = false } = {}) {
    if (!force && !this.authority.isAuthoritative()) return { restored: false, reason: "not-authoritative", status: this.status() };
    const candidates = this.instanceRepository?.list?.() ?? [];
    const active = candidates
      .filter((entry) => ["active", "paused"].includes(entry.data?.status))
      .sort((a, b) => String(b.data?.metadata?.modifiedAt ?? "").localeCompare(String(a.data?.metadata?.modifiedAt ?? "")))[0];
    if (!active) return { restored: false, reason: "no-instance", status: this.status() };
    await this.start(active.data, { force: true });
    return { restored: true, instanceId: active.data.id, status: this.status() };
  }

  enableBootstrapHooks() {
    if (this.bootstrapHooks.length || !this.hooksRef?.on) return;
    const id = this.hooksRef.on("updateCombat", async (combat, changed = {}) => {
      if (!this.authority.isAuthoritative()) return;
      const ref = combat?.flags?.[MODULE_ID]?.encounter?.instanceUuid ?? combat?.flags?.[MODULE_ID]?.encounter?.instanceId ?? null;
      if (!ref) return;
      const started = combat?.started === true || Number(combat?.round ?? 0) > 0;
      const startSignal = Object.prototype.hasOwnProperty.call(changed, "round") || Object.prototype.hasOwnProperty.call(changed, "turn") || changed.started === true;
      if (!started || !startSignal) return;
      const entry = this.instanceRepository?.get?.(ref);
      if (entry?.data?.status === "prepared") {
        try { await this.activate(entry.data, { force: true, reason: "combat-start" }); }
        catch (error) { console.error(`${MODULE_ID} | Could not auto-activate prepared Encounter.`, error); }
      }
    });
    this.bootstrapHooks.push({ name: "updateCombat", id });
  }

  status() {
    return {
      started: this.started,
      activeInstanceId: this.activeInstanceId,
      instanceStatus: this.instance?.status ?? null,
      authority: this.authority.status(),
      services: Object.fromEntries(Object.entries(this.services).map(([key, service]) => [key, service.status()]))
    };
  }
}
