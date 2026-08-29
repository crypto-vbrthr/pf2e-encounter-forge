import { MODULE_ID } from "../constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localize(key, fallback = key) {
  try {
    const value = game.i18n.localize(key);
    return value === key ? fallback : value;
  } catch { return fallback; }
}

function format(key, data, fallback) {
  try {
    const value = game.i18n.format?.(key, data);
    return value && value !== key ? value : fallback;
  } catch { return fallback; }
}

function getApi() { return game.modules.get(MODULE_ID)?.api ?? null; }
function clone(value) { return globalThis.foundry?.utils?.deepClone ? foundry.utils.deepClone(value) : structuredClone(value); }

function statusLabel(status) {
  return localize(`PF2E_ENCOUNTER_FORGE.Director.Status.${status}`, status ?? "unknown");
}

function objectiveLabel(definition) {
  return String(definition?.name ?? definition?.label ?? definition?.title ?? definition?.id ?? "").trim();
}

function phaseLabel(phase) {
  return String(phase?.name ?? phase?.label ?? phase?.title ?? phase?.id ?? "").trim();
}

function logTime(value) {
  if (!value) return "";
  try { return new Intl.DateTimeFormat(game.i18n?.lang ?? undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)); }
  catch { return String(value); }
}

export class EncounterDirectorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pf2e-encounter-forge-director",
    classes: ["pf2e-encounter-forge", "encounter-director-app"],
    window: {
      title: "PF2E_ENCOUNTER_FORGE.Director.WindowTitle",
      icon: "fa-solid fa-clapperboard",
      resizable: true
    },
    position: { width: 680, height: 800 },
    actions: {
      refresh: EncounterDirectorApp.refresh,
      startEncounter: EncounterDirectorApp.startEncounter,
      pauseEncounter: EncounterDirectorApp.pauseEncounter,
      resumeEncounter: EncounterDirectorApp.resumeEncounter,
      completeEncounter: EncounterDirectorApp.completeEncounter,
      reopenEncounter: EncounterDirectorApp.reopenEncounter,
      setPhase: EncounterDirectorApp.setPhase,
      objectiveDown: EncounterDirectorApp.objectiveDown,
      objectiveUp: EncounterDirectorApp.objectiveUp,
      objectiveComplete: EncounterDirectorApp.objectiveComplete,
      objectiveReopen: EncounterDirectorApp.objectiveReopen,
      acceptDecision: EncounterDirectorApp.acceptDecision,
      dismissDecision: EncounterDirectorApp.dismissDecision,
      viewScene: EncounterDirectorApp.viewScene
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/encounter-director-app.hbs` }
  };

  constructor({ instanceId = null, ...options } = {}) {
    super(options);
    this.instanceId = instanceId;
    this.snapshot = null;
    this.unsubscribers = [];
    this.renderTimer = null;
    this.pendingScrollTop = null;
  }

  async initialize(instanceId = null) {
    if (instanceId) this.instanceId = instanceId;
    await this.#refreshSnapshot();
    this.#subscribeRuntime();
    return this;
  }

  setInstance(instanceId) {
    this.instanceId = instanceId;
    return this.#refreshAndRender(false);
  }

  async #refreshSnapshot() {
    const api = getApi();
    this.snapshot = this.instanceId ? await api?.runtime?.inspect?.(this.instanceId) : null;
    if (this.snapshot?.instance?.id) this.instanceId = this.snapshot.instance.id;
    return this.snapshot;
  }

  #subscribeRuntime() {
    for (const unsubscribe of this.unsubscribers.splice(0)) { try { unsubscribe?.(); } catch {} }
    const api = getApi();
    if (!api?.runtime?.on) return;
    for (const type of ["director.changed", "decision.required", "decision.resolved", "runtime.started", "runtime.stopped"]) {
      const listener = (event = {}) => {
        if (event.instanceId && this.instanceId && event.instanceId !== this.instanceId) return;
        this.#scheduleRender();
      };
      api.runtime.on(type, listener);
      this.unsubscribers.push(() => api.runtime.off(type, listener));
    }
  }

  #scheduleRender() {
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => this.#refreshAndRender(true), 90);
  }

  async #refreshAndRender(preserveScroll = true) {
    if (preserveScroll) this.pendingScrollTop = this.element?.querySelector?.(".encounter-director-body")?.scrollTop ?? null;
    await this.#refreshSnapshot();
    await this.render({ force: true });
  }

  async _prepareContext() {
    const snapshot = this.snapshot ?? await this.#refreshSnapshot();
    if (!snapshot) return { missing: true };
    const { instance, blueprint, participants = [] } = snapshot;
    const groups = new Map((blueprint?.groups ?? []).map((entry) => [entry.id, entry.name ?? entry.label ?? entry.id]));
    const templates = new Map((blueprint?.participants ?? []).map((entry) => [entry.id, entry]));
    const phases = (blueprint?.phases ?? []).map((phase) => ({
      ...clone(phase),
      label: phaseLabel(phase),
      current: phase.id === instance.currentPhaseId
    }));
    const currentPhase = phases.find((phase) => phase.current) ?? null;
    const objectives = (blueprint?.objectives ?? []).map((definition) => {
      const state = instance.objectives?.[definition.id] ?? { state: "active", progress: 0, target: definition.target ?? null };
      const target = Number.isFinite(Number(state.target)) ? Number(state.target) : null;
      return {
        id: definition.id,
        label: objectiveLabel(definition),
        state: state.state ?? "active",
        stateLabel: localize(`PF2E_ENCOUNTER_FORGE.Director.ObjectiveState.${state.state ?? "active"}`, state.state ?? "active"),
        progress: Number(state.progress ?? 0),
        target,
        hasTarget: target !== null,
        complete: state.state === "completed"
      };
    });
    const templateMembers = new Map();
    for (const entry of instance.participants ?? []) {
      if (!templateMembers.has(entry.templateId)) templateMembers.set(entry.templateId, []);
      templateMembers.get(entry.templateId).push(entry.id);
    }
    const participantRows = participants.map((participant) => {
      const runtimeParticipant = instance.participants.find((entry) => entry.id === participant.id);
      const template = templates.get(runtimeParticipant?.templateId);
      const hp = participant.hp ?? {};
      const members = templateMembers.get(runtimeParticipant?.templateId) ?? [];
      const ordinal = Math.max(0, members.indexOf(participant.id)) + 1;
      const baseName = String(participant.name ?? runtimeParticipant?.display?.name ?? template?.name ?? participant.id);
      const autoId = /^participant-[A-Za-z0-9_-]+(?:-\d+)?$/.test(baseName);
      const preferredBase = autoId ? String(runtimeParticipant?.display?.name ?? template?.name ?? baseName) : baseName;
      const duplicate = members.length > 1;
      const displayName = duplicate && preferredBase === String(template?.name ?? runtimeParticipant?.display?.name ?? preferredBase)
        ? `${preferredBase} ${ordinal}`
        : preferredBase;
      const rawLevel = participant.level ?? template?.level ?? null;
      const level = rawLevel !== null && rawLevel !== undefined && rawLevel !== "" && Number.isInteger(Number(rawLevel)) ? Number(rawLevel) : null;
      const hpPercent = hp.percent ?? null;
      const healthBand = hpPercent === null ? "unknown" : hpPercent <= 25 ? "critical" : hpPercent <= 50 ? "wounded" : "healthy";
      return {
        ...participant,
        name: displayName,
        role: template?.role ? localize(`PF2E_ENCOUNTER_FORGE.Participants.Role.${template.role}`, template.role) : "",
        group: groups.get(runtimeParticipant?.groupId ?? template?.groupId) ?? "",
        level,
        hasLevel: level !== null,
        hpText: hp.value !== null && hp.max !== null ? `${hp.value} / ${hp.max}` : localize("PF2E_ENCOUNTER_FORGE.Director.NoHpData", "No HP data"),
        hpPercent,
        hasHp: hpPercent !== null,
        healthBand,
        stateLabel: localize(`PF2E_ENCOUNTER_FORGE.Director.ParticipantState.${runtimeParticipant?.state ?? participant.state}`, runtimeParticipant?.state ?? participant.state ?? "unknown")
      };
    });
    const pendingDecisions = (instance.decisions ?? []).filter((entry) => entry.status === "pending").map((entry) => ({
      ...clone(entry),
      title: entry.title || localize("PF2E_ENCOUNTER_FORGE.Director.Decision.Title", "Encounter decision")
    }));
    const logs = [...(instance.log ?? [])].slice(-80).reverse().map((entry) => ({ ...clone(entry), time: logTime(entry.at) }));
    const status = instance.status ?? "prepared";
    return {
      missing: false,
      instance,
      blueprint,
      name: instance.name ?? blueprint?.name ?? instance.id,
      status,
      statusLabel: statusLabel(status),
      isPrepared: status === "prepared",
      isActive: status === "active",
      isPaused: status === "paused",
      isCompleted: status === "completed",
      canComplete: ["active", "paused"].includes(status),
      canReopen: status === "completed",
      runtimeBound: snapshot.runtimeBound,
      authoritative: snapshot.authoritative,
      round: Number(instance.runtimeVariables?.round ?? 0),
      turn: Number(instance.runtimeVariables?.turn ?? 0),
      sceneName: instance.deployment?.sceneName ?? "",
      hasScene: Boolean(instance.deployment?.sceneUuid),
      combatPrepared: Boolean(instance.deployment?.combatUuid),
      phases,
      hasPhases: phases.length > 0,
      currentPhase,
      objectives,
      hasObjectives: objectives.length > 0,
      participants: participantRows,
      hasParticipants: participantRows.length > 0,
      pendingDecisions,
      hasPendingDecisions: pendingDecisions.length > 0,
      logs,
      hasLogs: logs.length > 0,
      firedTriggers: instance.triggeredEvents?.length ?? 0
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (this.pendingScrollTop !== null) {
      const body = this.element?.querySelector?.(".encounter-director-body");
      if (body) body.scrollTop = this.pendingScrollTop;
      this.pendingScrollTop = null;
    }
  }

  async close(options = {}) {
    clearTimeout(this.renderTimer);
    for (const unsubscribe of this.unsubscribers.splice(0)) { try { unsubscribe?.(); } catch {} }
    return super.close(options);
  }

  async #ensureBound() {
    const api = getApi();
    const status = api?.runtime?.status?.();
    if (!status?.started || status.activeInstanceId !== this.instanceId) await api?.runtime?.start?.(this.instanceId);
  }

  static async refresh() { await this.#refreshAndRender(true); }

  static async startEncounter() {
    await getApi()?.runtime?.activate?.(this.instanceId);
    await this.#refreshAndRender(true);
  }

  static async pauseEncounter() {
    await this.#ensureBound();
    await getApi()?.runtime?.pause?.();
    await this.#refreshAndRender(true);
  }

  static async resumeEncounter() {
    await this.#ensureBound();
    await getApi()?.runtime?.resume?.();
    await this.#refreshAndRender(true);
  }

  static async completeEncounter() {
    await this.#ensureBound();
    const DialogV2 = foundry.applications?.api?.DialogV2;
    const confirmed = DialogV2?.confirm
      ? await DialogV2.confirm({ window: { title: localize("PF2E_ENCOUNTER_FORGE.Director.CompleteTitle", "Complete Encounter") }, content: `<p>${localize("PF2E_ENCOUNTER_FORGE.Director.CompletePrompt", "Mark this Encounter as completed?")}</p>`, modal: true, rejectClose: false })
      : (globalThis.confirm?.(localize("PF2E_ENCOUNTER_FORGE.Director.CompletePrompt", "Mark this Encounter as completed?")) ?? false);
    if (!confirmed) return;
    await getApi()?.runtime?.complete?.();
    await this.#refreshAndRender(true);
  }

  static async reopenEncounter() {
    await this.#ensureBound();
    const DialogV2 = foundry.applications?.api?.DialogV2;
    const confirmed = DialogV2?.confirm
      ? await DialogV2.confirm({ window: { title: localize("PF2E_ENCOUNTER_FORGE.Director.ReopenTitle", "Reopen Encounter") }, content: `<p>${localize("PF2E_ENCOUNTER_FORGE.Director.ReopenPrompt", "Undo completion and resume this Encounter from its current state?")}</p>`, modal: true, rejectClose: false })
      : (globalThis.confirm?.(localize("PF2E_ENCOUNTER_FORGE.Director.ReopenPrompt", "Undo completion and resume this Encounter from its current state?")) ?? false);
    if (!confirmed) return;
    await getApi()?.runtime?.reopen?.();
    await this.#refreshAndRender(true);
  }

  static async setPhase(_event, target) {
    const id = target?.dataset?.phaseId;
    if (!id) return;
    await this.#ensureBound();
    await getApi()?.runtime?.setPhase?.(id);
    await this.#refreshAndRender(true);
  }

  static async objectiveDown(_event, target) {
    const id = target?.dataset?.objectiveId;
    if (!id) return;
    await this.#ensureBound();
    await getApi()?.runtime?.adjustObjective?.(id, -1);
    await this.#refreshAndRender(true);
  }

  static async objectiveUp(_event, target) {
    const id = target?.dataset?.objectiveId;
    if (!id) return;
    await this.#ensureBound();
    await getApi()?.runtime?.adjustObjective?.(id, 1);
    await this.#refreshAndRender(true);
  }

  static async objectiveComplete(_event, target) {
    const id = target?.dataset?.objectiveId;
    if (!id) return;
    await this.#ensureBound();
    await getApi()?.runtime?.setObjectiveState?.(id, "completed");
    await this.#refreshAndRender(true);
  }

  static async objectiveReopen(_event, target) {
    const id = target?.dataset?.objectiveId;
    if (!id) return;
    await this.#ensureBound();
    await getApi()?.runtime?.setObjectiveState?.(id, "active");
    await this.#refreshAndRender(true);
  }

  static async acceptDecision(_event, target) {
    const id = target?.dataset?.decisionId;
    if (!id) return;
    await this.#ensureBound();
    await getApi()?.runtime?.resolveDecision?.(id, "accept");
    await this.#refreshAndRender(true);
  }

  static async dismissDecision(_event, target) {
    const id = target?.dataset?.decisionId;
    if (!id) return;
    await this.#ensureBound();
    await getApi()?.runtime?.resolveDecision?.(id, "dismiss");
    await this.#refreshAndRender(true);
  }

  static async viewScene() {
    const uuid = this.snapshot?.instance?.deployment?.sceneUuid;
    if (!uuid || typeof globalThis.fromUuid !== "function") return;
    const scene = await globalThis.fromUuid(uuid);
    await scene?.view?.();
  }
}
