import { MODULE_ID } from "../constants.js";
import { assertEncounterInstance } from "../model/encounter-instance.js";
import { collectionContents, deepClone, nowIso, randomId } from "../utils/data.js";
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
import { combatSceneContext, sceneId } from "../utils/combat-context.js";

function localize(key, fallback = key, data = null) {
  try {
    if (data && globalThis.game?.i18n?.format) {
      const value = game.i18n.format(key, data);
      return value === key ? fallback : value;
    }
    const value = globalThis.game?.i18n?.localize?.(key);
    return !value || value === key ? fallback : value;
  } catch { return fallback; }
}

function ensureRuntimeShape(instance) {
  instance.participants ??= [];
  instance.objectives ??= {};
  instance.triggeredEvents ??= [];
  instance.suppressedEvents ??= [];
  instance.decisions ??= [];
  instance.runtimeVariables ??= {};
  instance.runtimeVariables.timeline ??= { roundEnds: 0, turnEnds: 0 };
  instance.runtimeVariables.scheduledActions ??= [];
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function documentUuid(document, fallback = null) {
  if (document?.uuid) return document.uuid;
  if (fallback && document?.id) return `${fallback}.${document.id}`;
  return null;
}

function actionTiming(action = {}) {
  const mode = String(action?.timing?.mode ?? "immediate");
  const amount = Math.max(1, Math.trunc(Number(action?.timing?.amount ?? 1) || 1));
  return { mode, amount };
}

function delayedTimingLabel(action, { compact = false } = {}) {
  const { mode, amount } = actionTiming(action);
  if (mode === "roundEnd") {
    const key = amount === 1
      ? `PF2E_ENCOUNTER_FORGE.Director.${compact ? "ChatDecision" : "ChatSchedule"}.DelayedRoundOne`
      : `PF2E_ENCOUNTER_FORGE.Director.${compact ? "ChatDecision" : "ChatSchedule"}.DelayedRoundMany`;
    const fallback = compact
      ? (amount === 1 ? "delayed: after the next combat round ends" : `delayed: after ${amount} more combat rounds`)
      : (amount === 1 ? "The action has been scheduled now. It will only execute after the next combat round ends." : `The action has been scheduled now. It will only execute after ${amount} more completed combat rounds.`);
    return localize(key, fallback, { amount });
  }
  if (mode === "turnEnd") {
    const key = amount === 1
      ? `PF2E_ENCOUNTER_FORGE.Director.${compact ? "ChatDecision" : "ChatSchedule"}.DelayedTurnOne`
      : `PF2E_ENCOUNTER_FORGE.Director.${compact ? "ChatDecision" : "ChatSchedule"}.DelayedTurnMany`;
    const fallback = compact
      ? (amount === 1 ? "delayed: after the next combat turn ends" : `delayed: after ${amount} more completed combat turns`)
      : (amount === 1 ? "The action has been scheduled now. It will only execute after the next combat turn ends." : `The action has been scheduled now. It will only execute after ${amount} more completed combat turns.`);
    return localize(key, fallback, { amount });
  }
  return "";
}

export class EncounterRuntime {
  constructor({ instanceRepository, blueprintRepository = null, integrations, gameRef = globalThis.game, hooksRef = globalThis.Hooks, chatMessageClass = null } = {}) {
    this.instanceRepository = instanceRepository;
    this.blueprintRepository = blueprintRepository;
    this.integrations = integrations;
    this.gameRef = gameRef;
    this.hooksRef = hooksRef;
    this.chatMessageClass = chatMessageClass ?? globalThis.CONFIG?.ChatMessage?.documentClass ?? globalThis.ChatMessage ?? null;
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
      events: new EventService({ bus: this.bus, getInstance, participants, hooksRef, gameRef }),
      triggers: new TriggerService({
        bus: this.bus,
        getInstance,
        getBlueprint,
        participants,
        enabled: () => this.instance?.status === "active",
        onTrigger: (trigger, event) => this.#handleTrigger(trigger, event)
      }),
      phases: new PhaseService({ getInstance, getBlueprint }),
      objectives: new ObjectiveService({ getInstance, getBlueprint }),
      tactics: new TacticsService({ getBlueprint }),
      actions: new ActionService({
        bus: this.bus,
        integrations,
        participants,
        getInstance,
        handlers: {
          phaseTransition: (phaseId, context) => this.setPhase(phaseId, { reason: context?.reason ?? "action" }),
          objectiveProgress: (objectiveId, amount, context) => this.adjustObjective(objectiveId, amount, { reason: context?.reason ?? "action" }),
          directorMessage: (message, context) => this.#deliverDirectorMessage(message, context),
          scheduleAction: (action, context) => this.#scheduleAction(action, context)
        }
      }),
      persistence: new RuntimePersistenceService({ repository: instanceRepository })
    });

    // Timeline bookkeeping is registered before TriggerService subscribes to
    // encounter.event. Thus an event advances existing schedules first, while a new
    // delayed action authored by a Trigger on that same event starts counting AFTER it.
    this.bus.on("encounter.event", (event) => this.#processTimelineEvent(event));

    this.bus.on("participant.defeated", (event) => this.#setParticipantStateFromEvent(event, "defeated"));
    this.bus.on("participant.restored", (event) => this.#setParticipantStateFromEvent(event, "ready"));
    this.bus.on("participant.tokenDeleted", (event) => this.#setParticipantStateFromEvent(event, "removed"));
    this.bus.on("combat.roundChanged", (event) => this.#onRoundChanged(event));
    this.bus.on("action.executed", async (event) => {
      if (!["effect.apply", "aura.setEnabled", "affliction.apply", "loot.createActor"].includes(event?.type)) return;
      const action = event?.action ?? {};
      const label = String(action.name ?? action.id ?? event?.type ?? "Action");
      await this.addLog("action.executed", localize("PF2E_ENCOUNTER_FORGE.Director.Log.ActionExecuted", `Action executed: ${label}.`, { action: label }), { actionId: action.id ?? null, actionType: event?.type ?? null, result: event?.result ?? null });
    });
    this.bus.on("action.failed", async (event) => {
      if (!["effect.apply", "aura.setEnabled", "affliction.apply", "loot.createActor"].includes(event?.type)) return;
      const action = event?.action ?? {};
      const label = String(action.name ?? action.id ?? event?.type ?? "Action");
      const errorMessage = String(event?.error?.message ?? "");
      await this.addLog("action.failed", localize("PF2E_ENCOUNTER_FORGE.Director.Log.ActionFailed", `Action failed: ${label}. ${errorMessage}`, { action: label, error: errorMessage }), { actionId: action.id ?? null, actionType: event?.type ?? null, error: event?.error ?? null });
    });
    for (const type of ["participant.hpChanged", "participant.actorUpdated", "participant.tokenUpdated", "combat.turnChanged", "combat.roundEnded", "objective.progressChanged", "objective.completed"]) {
      this.bus.on(type, () => this.bus.emit("director.changed", { instanceId: this.activeInstanceId, reason: type }));
    }
  }

  #matchingCombat(instance = this.instance) {
    if (!instance) return null;
    const combats = collectionContents(this.gameRef?.combats);
    const current = this.gameRef?.combat ?? null;
    const candidates = current ? [current, ...combats.filter((entry) => entry?.id !== current.id)] : combats;
    const expectedUuid = instance.deployment?.combatUuid ?? null;
    const expectedScene = sceneId(instance.deployment?.sceneUuid);
    for (const combat of candidates) {
      if (!combat) continue;
      const uuid = documentUuid(combat, "Combat");
      if (expectedUuid && uuid === expectedUuid) return combat;
      const flag = combat.flags?.[MODULE_ID]?.encounter ?? {};
      if (flag.instanceId === instance.id || flag.instanceUuid === this.instanceRepository?.get?.(instance.id)?.document?.uuid) return combat;
    }
    if (!expectedScene) return null;
    return candidates.find((combat) => combatSceneContext(combat, { instance, gameRef: this.gameRef }).sceneId === expectedScene) ?? null;
  }

  async #adoptCombat(combat) {
    if (!this.instance || !combat) return null;
    const uuid = documentUuid(combat, "Combat");
    if (!uuid) return combat;
    this.instance.deployment ??= {};
    this.instance.deployment.combatUuid = uuid;
    this.instance.deployment.combatPreparedAt ??= nowIso();
    this.instance.runtimeVariables ??= {};
    this.instance.runtimeVariables.round = Number(combat.round ?? 0);
    this.instance.runtimeVariables.turn = Number(combat.turn ?? 0);
    if (combat.update) {
      try {
        const instanceUuid = this.instanceRepository?.get?.(this.instance.id)?.document?.uuid ?? null;
        await combat.update({
          [`flags.${MODULE_ID}.encounter.instanceId`]: this.instance.id,
          ...(instanceUuid ? { [`flags.${MODULE_ID}.encounter.instanceUuid`]: instanceUuid } : {})
        }, { render: false });
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not bind active Combat to Encounter Instance '${this.instance.id}'.`, error);
      }
    }
    return combat;
  }

  async #notifyDecisionInChat(decision, trigger) {
    const ChatMessageClass = this.chatMessageClass;
    if (!ChatMessageClass?.create || !decision || !this.instance) return null;
    const gmIds = collectionContents(this.gameRef?.users).filter((user) => user?.isGM && user?.id).map((user) => user.id);
    if (!gmIds.length && this.gameRef?.user?.isGM && this.gameRef.user.id) gmIds.push(this.gameRef.user.id);
    const actionEntries = (decision.actions ?? []).map((action) => {
      const name = String(action?.name ?? action?.label ?? action?.id ?? action?.type ?? "").trim();
      if (!name) return null;
      const timing = delayedTimingLabel(action, { compact: true });
      return { name, timing };
    }).filter(Boolean);
    const heading = localize("PF2E_ENCOUNTER_FORGE.Director.ChatDecision.Title", "Encounter Director: GM decision required");
    const explanation = localize("PF2E_ENCOUNTER_FORGE.Director.ChatDecision.Hint", "A trigger is waiting for your decision. Open Encounter Director to apply or dismiss its prepared actions.");
    const actionLabel = localize("PF2E_ENCOUNTER_FORGE.Director.ChatDecision.Actions", "Prepared actions");
    const openLabel = localize("PF2E_ENCOUNTER_FORGE.Director.ChatDecision.OpenDirector", "Open Director");
    const actionsHtml = actionEntries.length
      ? `<div class="encounter-director-chat-actions"><strong>${escapeHtml(actionLabel)}:</strong><ul>${actionEntries.map(({ name, timing }) => `<li>${escapeHtml(name)}${timing ? ` <em>(${escapeHtml(timing)})</em>` : ""}</li>`).join("")}</ul></div>`
      : "";
    const content = `
      <div class="pf2e-encounter-forge-chat-decision" data-instance-id="${escapeHtml(this.instance.id)}" data-decision-id="${escapeHtml(decision.id)}">
        <h3><i class="fa-solid fa-bell"></i> ${escapeHtml(heading)}</h3>
        <p><strong>${escapeHtml(decision.title ?? trigger?.name ?? trigger?.id ?? "")}</strong></p>
        <p>${escapeHtml(decision.message ?? "")}</p>
        ${actionsHtml}
        <p class="encounter-director-chat-hint">${escapeHtml(explanation)}</p>
        <button type="button" data-pf2e-encounter-forge-open-director data-instance-id="${escapeHtml(this.instance.id)}"><i class="fa-solid fa-clapperboard"></i> ${escapeHtml(openLabel)}</button>
      </div>`;
    try {
      return await ChatMessageClass.create({
        content,
        whisper: gmIds,
        speaker: { alias: localize("PF2E_ENCOUNTER_FORGE.Director.ShortName", "Director") },
        flags: {
          [MODULE_ID]: {
            decision: { instanceId: this.instance.id, decisionId: decision.id, triggerId: trigger?.id ?? null }
          }
        }
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not create GM decision Chat message.`, error);
      return null;
    }
  }

  async #notifyScheduledActionInChat(scheduled, action, { instanceId = this.instance?.id ?? null } = {}) {
    const ChatMessageClass = this.chatMessageClass;
    if (!ChatMessageClass?.create || !scheduled || !action || !instanceId) return null;
    const gmIds = collectionContents(this.gameRef?.users).filter((user) => user?.isGM && user?.id).map((user) => user.id);
    if (!gmIds.length && this.gameRef?.user?.isGM && this.gameRef.user.id) gmIds.push(this.gameRef.user.id);
    const actionName = String(action?.name ?? action?.label ?? action?.id ?? action?.type ?? localize("PF2E_ENCOUNTER_FORGE.Director.Action", "Action")).trim();
    const heading = localize("PF2E_ENCOUNTER_FORGE.Director.ChatSchedule.Title", "Encounter Director: Action scheduled");
    const timing = delayedTimingLabel({ ...action, timing: { mode: scheduled.mode, amount: scheduled.amount } });
    const hint = localize("PF2E_ENCOUNTER_FORGE.Director.ChatSchedule.Hint", "The scheduled action is visible in Encounter Director and can be run immediately or cancelled there.");
    const openLabel = localize("PF2E_ENCOUNTER_FORGE.Director.ChatDecision.OpenDirector", "Open Director");
    const content = `
      <div class="pf2e-encounter-forge-chat-decision pf2e-encounter-forge-chat-schedule" data-instance-id="${escapeHtml(instanceId)}" data-schedule-id="${escapeHtml(scheduled.id)}">
        <h3><i class="fa-solid fa-clock"></i> ${escapeHtml(heading)}</h3>
        <p><strong>${escapeHtml(actionName)}</strong></p>
        <p>${escapeHtml(timing)}</p>
        <p class="encounter-director-chat-hint">${escapeHtml(hint)}</p>
        <button type="button" data-pf2e-encounter-forge-open-director data-instance-id="${escapeHtml(instanceId)}"><i class="fa-solid fa-clapperboard"></i> ${escapeHtml(openLabel)}</button>
      </div>`;
    try {
      return await ChatMessageClass.create({
        content,
        whisper: gmIds,
        speaker: { alias: localize("PF2E_ENCOUNTER_FORGE.Director.ShortName", "Director") },
        flags: {
          [MODULE_ID]: {
            scheduledAction: { instanceId, scheduleId: scheduled.id, actionId: action?.id ?? null }
          }
        }
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not create scheduled action Chat message.`, error);
      return null;
    }
  }

  async #notifyDirectorMessageInChat(message, context = {}) {
    const ChatMessageClass = this.chatMessageClass;
    const text = String(message ?? "").trim();
    if (!ChatMessageClass?.create || !text || !this.instance) return null;
    const gmIds = collectionContents(this.gameRef?.users).filter((user) => user?.isGM && user?.id).map((user) => user.id);
    if (!gmIds.length && this.gameRef?.user?.isGM && this.gameRef.user.id) gmIds.push(this.gameRef.user.id);
    const heading = localize("PF2E_ENCOUNTER_FORGE.Director.ChatMessage.Title", "Encounter Director");
    const openLabel = localize("PF2E_ENCOUNTER_FORGE.Director.ChatDecision.OpenDirector", "Open Director");
    const content = `
      <div class="pf2e-encounter-forge-chat-decision pf2e-encounter-forge-chat-message" data-instance-id="${escapeHtml(this.instance.id)}">
        <h3><i class="fa-solid fa-clapperboard"></i> ${escapeHtml(heading)}</h3>
        <p>${escapeHtml(text)}</p>
        <button type="button" data-pf2e-encounter-forge-open-director data-instance-id="${escapeHtml(this.instance.id)}"><i class="fa-solid fa-clapperboard"></i> ${escapeHtml(openLabel)}</button>
      </div>`;
    try {
      return await ChatMessageClass.create({
        content,
        whisper: gmIds,
        speaker: { alias: localize("PF2E_ENCOUNTER_FORGE.Director.ShortName", "Director") },
        flags: {
          [MODULE_ID]: {
            directorMessage: {
              instanceId: this.instance.id,
              actionId: context?.action?.id ?? context?.actionId ?? null,
              triggerId: context?.trigger?.id ?? null
            }
          }
        }
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not create GM Director message.`, error);
      return null;
    }
  }

  async #deliverDirectorMessage(message, context = {}) {
    const text = String(message ?? "").trim();
    if (!text) return { handled: true, empty: true };
    await this.addLog("director.message", text, context);
    await this.#notifyDirectorMessageInChat(text, context);
    return { handled: true, message: text };
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

  #timingBucket(mode) {
    if (mode === "roundEnd") return "roundEnds";
    if (mode === "turnEnd") return "turnEnds";
    return null;
  }

  async #scheduleAction(action, context = {}) {
    if (!this.instance) return { handled: false, reason: "no-instance" };
    ensureRuntimeShape(this.instance);
    const mode = String(context?.timing?.mode ?? action?.timing?.mode ?? "immediate");
    const bucket = this.#timingBucket(mode);
    if (!bucket) return { handled: false, reason: "invalid-timing", mode };
    const amount = Math.max(1, Math.trunc(Number(context?.timing?.amount ?? action?.timing?.amount ?? 1) || 1));
    const current = Number(this.instance.runtimeVariables.timeline?.[bucket] ?? 0);
    const scheduled = {
      id: randomId("scheduled"),
      actionId: action?.id ?? null,
      action: deepClone(action),
      mode,
      amount,
      createdAt: nowIso(),
      dueCounter: current + amount,
      status: "pending",
      source: {
        triggerId: context?.trigger?.id ?? null,
        decisionId: context?.decision?.id ?? null,
        manual: context?.manual === true,
        reason: context?.reason ?? null
      }
    };
    this.instance.runtimeVariables.scheduledActions.push(scheduled);
    const label = String(action?.name ?? action?.label ?? action?.id ?? action?.type ?? "Action");
    const unit = mode === "roundEnd"
      ? localize("PF2E_ENCOUNTER_FORGE.Director.Schedule.RoundUnit", amount === 1 ? "round end" : "round ends")
      : localize("PF2E_ENCOUNTER_FORGE.Director.Schedule.TurnUnit", amount === 1 ? "turn change" : "completed turns");
    await this.addLog("action.scheduled", localize("PF2E_ENCOUNTER_FORGE.Director.Log.ActionScheduled", `Action scheduled: ${label} after ${amount} ${unit}.`, { action: label, amount, unit }), { scheduleId: scheduled.id, actionId: action?.id ?? null, mode, amount, dueCounter: scheduled.dueCounter });
    await this.#persist({ reason: "action-scheduled" });
    const instanceId = this.instance.id;
    await this.bus.emit("schedule.changed", { instanceId, scheduleId: scheduled.id, reason: "scheduled" });

    // Chat is informational and must never become part of the scheduler's mutation
    // transaction. Foundry ChatMessage.create can yield through render hooks and other
    // document work. Waiting for it here leaves the Runtime action/Trigger call open long
    // enough for unrelated Runtime persistence to interleave with the freshly stored
    // schedule. Dispatch a frozen notification payload after persistence instead.
    const chatSchedule = deepClone(scheduled);
    const chatAction = deepClone(action);
    void this.#notifyScheduledActionInChat(chatSchedule, chatAction, { instanceId })
      .catch((error) => console.warn(`${MODULE_ID} | Could not create scheduled action Chat message.`, error));

    return { handled: true, scheduled: true, scheduleId: scheduled.id, mode, amount, dueCounter: scheduled.dueCounter };
  }

  async #processTimelineEvent(event) {
    if (!this.instance || this.instance.status !== "active" || event?.instanceId !== this.instance.id) return;
    const mode = event?.type === "combat.roundEnded" ? "roundEnd" : event?.type === "combat.turnEnded" ? "turnEnd" : null;
    const bucket = this.#timingBucket(mode);
    if (!bucket) return;
    ensureRuntimeShape(this.instance);
    const timeline = this.instance.runtimeVariables.timeline;
    timeline[bucket] = Number(timeline[bucket] ?? 0) + 1;
    const counter = timeline[bucket];
    const dueIds = this.instance.runtimeVariables.scheduledActions
      .filter((entry) => entry?.status === "pending" && entry.mode === mode && Number(entry.dueCounter ?? Infinity) <= counter)
      .map((entry) => entry.id);

    for (const scheduleId of dueIds) {
      let scheduled = this.instance.runtimeVariables.scheduledActions.find((entry) => entry.id === scheduleId);
      if (!scheduled || scheduled.status !== "pending") continue;
      scheduled.status = "executing";
      const action = deepClone(scheduled.action ?? (this.blueprint?.actions ?? []).find((entry) => entry.id === scheduled.actionId));
      const label = String(action?.name ?? action?.label ?? scheduled.actionId ?? "Action");
      const result = action
        ? await this.services.actions.execute(action, { scheduledExecution: true, scheduleId, schedule: deepClone(scheduled), event: deepClone(event), reason: `scheduled:${scheduleId}` })
        : { handled: false, reason: "missing-action" };
      scheduled = this.instance.runtimeVariables.scheduledActions.find((entry) => entry.id === scheduleId);
      if (scheduled) this.instance.runtimeVariables.scheduledActions = this.instance.runtimeVariables.scheduledActions.filter((entry) => entry.id !== scheduleId);
      if (result?.handled) {
        await this.addLog("action.scheduleExecuted", localize("PF2E_ENCOUNTER_FORGE.Director.Log.ScheduledActionExecuted", `Scheduled action executed: ${label}.`, { action: label }), { scheduleId, actionId: action?.id ?? scheduled?.actionId ?? null, result: deepClone(result) });
      } else {
        await this.addLog("action.scheduleFailed", localize("PF2E_ENCOUNTER_FORGE.Director.Log.ScheduledActionFailed", `Scheduled action failed: ${label}.`, { action: label }), { scheduleId, actionId: action?.id ?? scheduled?.actionId ?? null, result: deepClone(result) });
      }
    }

    if (dueIds.length || this.instance.runtimeVariables.scheduledActions.some((entry) => entry?.status === "pending" && entry.mode === mode)) {
      await this.#persist({ reason: "schedule-tick" });
      await this.bus.emit("schedule.changed", { instanceId: this.instance.id, reason: "tick", mode, counter });
    }
  }

  async cancelScheduledAction(scheduleId, { force = false } = {}) {
    this.#assertAuthority(force);
    if (!this.instance) throw new EncounterForgeError("No Encounter Instance is bound to the Runtime.", { code: "RUNTIME_NO_INSTANCE" });
    ensureRuntimeShape(this.instance);
    const id = String(scheduleId ?? "").trim();
    const scheduled = this.instance.runtimeVariables.scheduledActions.find((entry) => entry.id === id);
    if (!scheduled) throw new EncounterForgeError(`Unknown scheduled action '${id}'.`, { code: "RUNTIME_SCHEDULE_UNKNOWN" });
    const label = String(scheduled.action?.name ?? scheduled.actionId ?? id);
    this.instance.runtimeVariables.scheduledActions = this.instance.runtimeVariables.scheduledActions.filter((entry) => entry.id !== id);
    await this.addLog("action.scheduleCancelled", localize("PF2E_ENCOUNTER_FORGE.Director.Log.ScheduledActionCancelled", `Scheduled action cancelled: ${label}.`, { action: label }), { scheduleId: id, actionId: scheduled.actionId ?? null });
    await this.#persist({ reason: "schedule-cancel" });
    await this.bus.emit("schedule.changed", { instanceId: this.instance.id, scheduleId: id, reason: "cancelled" });
    return true;
  }

  async executeScheduledActionNow(scheduleId, { force = false } = {}) {
    this.#assertAuthority(force);
    if (!this.instance) throw new EncounterForgeError("No Encounter Instance is bound to the Runtime.", { code: "RUNTIME_NO_INSTANCE" });
    ensureRuntimeShape(this.instance);
    const id = String(scheduleId ?? "").trim();
    const scheduled = this.instance.runtimeVariables.scheduledActions.find((entry) => entry.id === id);
    if (!scheduled) throw new EncounterForgeError(`Unknown scheduled action '${id}'.`, { code: "RUNTIME_SCHEDULE_UNKNOWN" });
    const action = deepClone(scheduled.action ?? (this.blueprint?.actions ?? []).find((entry) => entry.id === scheduled.actionId));
    if (!action) throw new EncounterForgeError(`Scheduled action '${id}' has no executable action.`, { code: "RUNTIME_ACTION_UNKNOWN" });
    scheduled.status = "executing";
    const result = await this.services.actions.execute(action, { scheduledExecution: true, scheduleId: id, schedule: deepClone(scheduled), manual: true, reason: `schedule-now:${id}` });
    this.instance.runtimeVariables.scheduledActions = this.instance.runtimeVariables.scheduledActions.filter((entry) => entry.id !== id);
    const label = String(action.name ?? action.id ?? action.type ?? "Action");
    await this.addLog(result?.handled ? "action.scheduleExecuted" : "action.scheduleFailed", result?.handled
      ? localize("PF2E_ENCOUNTER_FORGE.Director.Log.ScheduledActionExecuted", `Scheduled action executed: ${label}.`, { action: label })
      : localize("PF2E_ENCOUNTER_FORGE.Director.Log.ScheduledActionFailed", `Scheduled action failed: ${label}.`, { action: label }), { scheduleId: id, actionId: action.id ?? null, result: deepClone(result), manual: true });
    await this.#persist({ reason: "schedule-now" });
    await this.bus.emit("schedule.changed", { instanceId: this.instance.id, scheduleId: id, reason: "executed-now" });
    return result;
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
    if (globalThis.__PF2E_ENCOUNTER_FORGE_DEBUG__ === true) console.warn("[PF2E Encounter Forge DEBUG] Runtime binding instance", { instanceId: next.id, status: next.status, deployment: next.deployment, gameCombat: this.gameRef?.combat ? { id: this.gameRef.combat.id, uuid: this.gameRef.combat.uuid, round: this.gameRef.combat.round, turn: this.gameRef.combat.turn, scene: this.gameRef.combat.scene?.id ?? this.gameRef.combat.scene ?? this.gameRef.combat.sceneId ?? null } : null });
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
      const combat = this.#matchingCombat(this.instance);
      if (combat) await this.#adoptCombat(combat);
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
      await this.#notifyDecisionInChat(decision, trigger);
      await this.bus.emit("decision.required", { instanceId: this.instance.id, decision: deepClone(decision) });
      return decision;
    }

    await this.addLog("trigger.fired", localize("PF2E_ENCOUNTER_FORGE.Director.Log.TriggerFired", `Trigger ${trigger.id} fired.`, { trigger: trigger.name ?? trigger.id }), { triggerId: trigger.id });
    for (const action of actions) await this.services.actions.execute(action, { trigger, event, reason: `trigger:${trigger.id}` });
    await this.#persist({ reason: "trigger" });
    return { triggerId: trigger.id, automatic: true };
  }

  async executeAction(actionOrId, { force = false, reason = "manual-director" } = {}) {
    this.#assertAuthority(force);
    if (!this.instance) throw new EncounterForgeError("No Encounter Instance is bound to the Runtime.", { code: "RUNTIME_NO_INSTANCE" });
    if (!["active", "paused"].includes(this.instance.status)) {
      throw new EncounterForgeError("Encounter actions can only be executed while the Encounter is active or paused.", { code: "RUNTIME_ACTION_INACTIVE" });
    }
    const action = typeof actionOrId === "string"
      ? (this.blueprint?.actions ?? []).find((entry) => entry.id === actionOrId)
      : actionOrId;
    if (!action) throw new EncounterForgeError(`Unknown Encounter action '${actionOrId}'.`, { code: "RUNTIME_ACTION_UNKNOWN" });

    const label = String(action.name ?? action.label ?? action.id ?? action.type ?? "Action");
    const result = await this.services.actions.execute(action, { reason, manual: true, instanceId: this.instance.id });
    if (result?.handled) {
      if (!result?.scheduled) {
        await this.addLog(
          "action.manual",
          localize("PF2E_ENCOUNTER_FORGE.Director.Log.ActionManual", `GM manually executed action: ${label}.`, { action: label }),
          { actionId: action.id ?? null, actionType: action.type ?? action.kind ?? null, reason, result: deepClone(result) }
        );
        await this.#persist({ reason: "manual-action" });
      }
      await this.bus.emit("director.changed", { instanceId: this.instance.id, reason: result?.scheduled ? "action-scheduled" : "manual-action" });
    }
    return result;
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

  debugSnapshot() {
    return {
      status: this.status(),
      instance: this.instance ? {
        id: this.instance.id,
        status: this.instance.status,
        deployment: this.instance.deployment ?? null,
        runtimeVariables: this.instance.runtimeVariables ?? null
      } : null,
      gameCombat: this.gameRef?.combat ? {
        id: this.gameRef.combat.id ?? null,
        uuid: this.gameRef.combat.uuid ?? null,
        started: this.gameRef.combat.started ?? null,
        round: this.gameRef.combat.round ?? null,
        turn: this.gameRef.combat.turn ?? null,
        sceneId: combatSceneContext(this.gameRef.combat, { instance: this.instance, gameRef: this.gameRef }).sceneId,
        flags: this.gameRef.combat.flags?.[MODULE_ID]?.encounter ?? {}
      } : null,
      events: this.services.events?.debugSnapshot?.() ?? null
    };
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
