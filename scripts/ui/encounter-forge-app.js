import { MODULE_ID, TOKEN_DISPLAY_MODE_KEYS } from "../constants.js";
import { createEncounterBlueprint } from "../model/encounter-blueprint.js";
import { analyzeEncounterBudget } from "../engine/encounter-budget.js";
import {
  FLOW_EVENT_TYPES,
  FLOW_CONDITION_FIELDS,
  FLOW_NUMERIC_CONDITION_FIELDS,
  FLOW_BOOLEAN_CONDITION_FIELDS,
  FLOW_PARTICIPANT_CONTEXT_FIELDS,
  FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS,
  FLOW_GROUP_MATCH_MODES,
  FLOW_CONDITION_MODES,
  FLOW_OBJECTIVE_CONTEXT_FIELDS,
  FLOW_GROUP_CONTEXT_FIELDS,
  FLOW_OPERATORS,
  FLOW_ACTION_TYPES,
  analyzeEncounterFlow
} from "../engine/encounter-flow.js";
import { randomId } from "../utils/data.js";
import { ParticipantBrowserApp } from "./participant-browser-app.js";
import { ForgeParticipantEditorApp } from "./forge-participant-editor-app.js";
import { EncounterDeploymentDialogApp } from "./deployment-dialog-app.js";
import { IntegrationActionEditorApp } from "./integration-action-editor-app.js";
import { getConditionLogicDisplayMode } from "./ui-settings.js";
import {
  createExampleEncounterBlueprint,
  isExampleEncounterBlueprint,
  isInitialExampleSeedDone,
  markInitialExampleSeedDone
} from "../examples/index.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localize(key, fallback = key) {
  try {
    const value = game.i18n.localize(key);
    return value === key ? fallback : value;
  } catch {
    return fallback;
  }
}

async function confirmDialog(titleKey, promptKey) {
  const title = localize(titleKey, "Encounter Forge");
  const content = `<p>${localize(promptKey, "Discard unsaved changes?")}</p>`;
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (DialogV2?.confirm) {
    return Boolean(await DialogV2.confirm({ window: { title }, content, modal: true, rejectClose: false }));
  }
  return globalThis.confirm?.(localize(promptKey, "Discard unsaved changes?")) ?? false;
}



const INTEGRATION_ACTIONS = Object.freeze({
  "effect.apply": { integrationId: "effectForge", icon: "fa-wand-magic-sparkles" },
  "aura.setEnabled": { integrationId: "auraForge", icon: "fa-circle-nodes" },
  "affliction.apply": { integrationId: "afflictionForge", icon: "fa-virus" },
  "loot.createActor": { integrationId: "lootForge", icon: "fa-treasure-chest" }
});

function integrationActionDescriptor(type) { return INTEGRATION_ACTIONS[String(type ?? "")] ?? null; }

const ENCOUNTER_ROLES = Object.freeze([
  "leader",
  "frontliner",
  "defender",
  "skirmisher",
  "ranged",
  "controller",
  "support",
  "spellcaster",
  "artillery",
  "minion"
]);

function actorLevel(actor) {
  const value = actor?.system?.details?.level?.value ?? actor?.system?.details?.level ?? null;
  const level = Number(value);
  return Number.isInteger(level) ? level : null;
}

function normalizeSuggestedRole(value) {
  const role = String(value ?? "").toLowerCase();
  const direct = {
    brute: "frontliner", soldier: "defender", skirmisher: "skirmisher", sniper: "ranged",
    spellcaster: "spellcaster", controller: "controller", support: "support", artillery: "artillery", leader: "leader"
  };
  return direct[role] ?? (ENCOUNTER_ROLES.includes(role) ? role : null);
}

function tokenDisplayOptions(selected) {
  return [
    { value: "", label: localize("PF2E_ENCOUNTER_FORGE.Participants.TokenDisplay.Inherit", "Use Actor token setting"), selected: !selected },
    ...TOKEN_DISPLAY_MODE_KEYS.map((value) => ({
      value,
      label: localize(`PF2E_ENCOUNTER_FORGE.Participants.TokenDisplay.${value}`, value),
      selected: selected === value
    }))
  ];
}

function getApi() {
  return game.modules.get(MODULE_ID)?.api ?? null;
}

function asInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function asNullableNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function clone(value) {
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return structuredClone(value);
}

function conditionSummary(trigger, { phases = [], objectives = [], groups = [], participants = [], displayMode = "verbose" } = {}) {
  const conditions = Array.isArray(trigger?.conditions) ? trigger.conditions : [];
  if (!conditions.length) return "";
  const phaseNames = new Map(phases.map((entry) => [String(entry.value ?? entry.id), String(entry.label ?? entry.name ?? entry.id)]));
  const objectiveNames = new Map(objectives.map((entry) => [String(entry.value ?? entry.id), String(entry.label ?? entry.name ?? entry.id)]));
  const groupNames = new Map(groups.map((entry) => [String(entry.value ?? entry.id), String(entry.label ?? entry.name ?? entry.id)]));
  const participantNames = new Map(participants.map((entry) => [String(entry.value ?? entry.id), String(entry.label ?? entry.name ?? entry.id)]));
  const joinMode = displayMode === "operators" ? "operators" : "verbose";
  const joiner = String(trigger?.conditionMode ?? "all") === "any"
    ? ` ${localize(`PF2E_ENCOUNTER_FORGE.Flow.ConditionJoin.${joinMode}.any`, joinMode === "operators" ? "OR" : localize("PF2E_ENCOUNTER_FORGE.Flow.ConditionJoin.any", "OR"))} `
    : ` ${localize(`PF2E_ENCOUNTER_FORGE.Flow.ConditionJoin.${joinMode}.all`, joinMode === "operators" ? "AND" : localize("PF2E_ENCOUNTER_FORGE.Flow.ConditionJoin.all", "AND"))} `;
  return conditions.map((condition) => {
    const field = String(condition?.field ?? condition?.path ?? "");
    const operator = String(condition?.operator ?? "eq");
    let value = condition?.value ?? "";
    if (field === "currentPhaseId") value = phaseNames.get(String(value)) ?? value;
    let fieldLabel = localize(`PF2E_ENCOUNTER_FORGE.Flow.ConditionField.${field}`, field);
    if (FLOW_OBJECTIVE_CONTEXT_FIELDS.includes(field)) {
      const id = trigger?.conditionObjectiveId ?? trigger?.objectiveId ?? null;
      if (id) fieldLabel += ` [${objectiveNames.get(String(id)) ?? id}]`;
    }
    if (FLOW_GROUP_CONTEXT_FIELDS.includes(field)) {
      const id = trigger?.conditionGroupId ?? null;
      if (id) fieldLabel += ` [${groupNames.get(String(id)) ?? id}]`;
    }
    if (FLOW_PARTICIPANT_CONTEXT_FIELDS.includes(field)) {
      const id = condition?.participantId ?? null;
      if (id) fieldLabel += ` [${participantNames.get(String(id)) ?? id}]`;
    }
    if (FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS.includes(field)) {
      const id = condition?.groupId ?? trigger?.conditionGroupId ?? null;
      const mode = String(condition?.groupMatchMode ?? "any");
      let qualifier = localize(`PF2E_ENCOUNTER_FORGE.Flow.GroupMatch.${mode}`, mode);
      if (mode === "atLeast") qualifier += ` ${Math.max(1, Number(condition?.groupMatchCount ?? 1) || 1)}`;
      if (id) fieldLabel += ` [${groupNames.get(String(id)) ?? id} · ${qualifier}]`;
    }
    if (FLOW_BOOLEAN_CONDITION_FIELDS.includes(field)) {
      value = condition?.value === true || String(condition?.value) === "true"
        ? localize("PF2E_ENCOUNTER_FORGE.Flow.Boolean.true", "Yes")
        : localize("PF2E_ENCOUNTER_FORGE.Flow.Boolean.false", "No");
    }
    const negated = condition?.negate === true ? `${localize("PF2E_ENCOUNTER_FORGE.Flow.Not", "NOT")} ` : "";
    return `${negated}${fieldLabel} ${localize(`PF2E_ENCOUNTER_FORGE.Flow.Operator.${operator}`, operator)} ${value}`.trim();
  }).join(joiner);
}

export class EncounterForgeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pf2e-encounter-forge-app",
    classes: ["pf2e-encounter-forge", "encounter-forge-app"],
    tag: "form",
    window: {
      title: "PF2E_ENCOUNTER_FORGE.WindowTitle",
      icon: "fa-solid fa-shield-halved",
      resizable: true
    },
    position: { width: 1280, height: 800 },
    actions: {
      newBlueprint: EncounterForgeApp.newBlueprint,
      createExampleBlueprint: EncounterForgeApp.createExampleBlueprint,
      selectBlueprint: EncounterForgeApp.selectBlueprint,
      saveBlueprint: EncounterForgeApp.saveBlueprint,
      duplicateBlueprint: EncounterForgeApp.duplicateBlueprint,
      deleteBlueprint: EncounterForgeApp.deleteBlueprint,
      refreshBlueprints: EncounterForgeApp.refreshBlueprints,
      detectParty: EncounterForgeApp.detectParty,
      browseParticipant: EncounterForgeApp.browseParticipant,
      addCreatureForgeParticipant: EncounterForgeApp.addCreatureForgeParticipant,
      addNpcForgeParticipant: EncounterForgeApp.addNpcForgeParticipant,
      editParticipant: EncounterForgeApp.editParticipant,
      removeParticipant: EncounterForgeApp.removeParticipant,
      addGroup: EncounterForgeApp.addGroup,
      removeGroup: EncounterForgeApp.removeGroup,
      addPhase: EncounterForgeApp.addPhase,
      duplicatePhase: EncounterForgeApp.duplicatePhase,
      removePhase: EncounterForgeApp.removePhase,
      movePhaseUp: EncounterForgeApp.movePhaseUp,
      movePhaseDown: EncounterForgeApp.movePhaseDown,
      addObjective: EncounterForgeApp.addObjective,
      duplicateObjective: EncounterForgeApp.duplicateObjective,
      removeObjective: EncounterForgeApp.removeObjective,
      addFlowAction: EncounterForgeApp.addFlowAction,
      duplicateFlowAction: EncounterForgeApp.duplicateFlowAction,
      removeFlowAction: EncounterForgeApp.removeFlowAction,
      configureFlowAction: EncounterForgeApp.configureFlowAction,
      addTrigger: EncounterForgeApp.addTrigger,
      duplicateTrigger: EncounterForgeApp.duplicateTrigger,
      removeTrigger: EncounterForgeApp.removeTrigger,
      addTriggerCondition: EncounterForgeApp.addTriggerCondition,
      removeTriggerCondition: EncounterForgeApp.removeTriggerCondition,
      toggleIntegrations: EncounterForgeApp.toggleIntegrations,
      toggleIntegration: EncounterForgeApp.toggleIntegration,
      deployEncounter: EncounterForgeApp.deployEncounter,
      openDirector: EncounterForgeApp.openDirector
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/encounter-forge-app.hbs` }
  };

  constructor(options = {}) {
    super(options);
    this.blueprints = [];
    this.selectedBlueprintId = null;
    this.draft = createEncounterBlueprint({});
    this.savedSnapshot = JSON.stringify(this.draft);
    this.initialized = false;
    this.allowCloseWithoutPrompt = false;
    this.partyDetection = null;
    this.childApps = new Set();
    this.integrationsExpanded = false;
    this.pendingScrollState = null;
  }

  get isDirty() {
    return JSON.stringify(this.draft) !== this.savedSnapshot;
  }

  async initialize() {
    await this.#reloadBlueprints();
    const seeded = await this.#seedInitialExampleIfNeeded();
    if (seeded) await this.#reloadBlueprints();
    if (this.blueprints.length > 0) this.#loadBlueprint(this.blueprints[0].id);
    else this.#resetDraft();
    this.initialized = true;
    return this;
  }

  async _prepareContext() {
    const api = getApi();
    const integrationStatus = api?.integrations?.status?.() ?? {};
    const rawIntegrationRows = Array.isArray(integrationStatus) ? integrationStatus : Object.values(integrationStatus ?? {});
    const integrationRows = rawIntegrationRows.map((entry) => {
      let state = "missing";
      if (entry?.installed && !entry?.active) state = "inactive";
      else if (entry?.active && !entry?.ready) state = "notReady";
      else if (entry?.ready && !entry?.enabled) state = "disabled";
      else if (entry?.usable) state = "integrated";
      return {
        ...entry,
        state,
        statusLabel: localize(`PF2E_ENCOUNTER_FORGE.Integrations.Status.${state}`, state),
        versionText: entry?.moduleVersion ? `v${entry.moduleVersion}` : "",
        canToggle: Boolean(entry?.ready),
        toggleLabel: localize(
          entry?.enabled ? "PF2E_ENCOUNTER_FORGE.Integrations.Disable" : "PF2E_ENCOUNTER_FORGE.Integrations.Enable",
          entry?.enabled ? "Disable" : "Enable"
        )
      };
    });
    const readyIntegrations = integrationRows.filter((entry) => entry?.usable).length;

    const draft = this.draft ?? createEncounterBlueprint({});
    const partyDetection = this.partyDetection ?? api?.party?.detect?.() ?? null;
    const averageLevelText = Number.isFinite(partyDetection?.averageLevel)
      ? new Intl.NumberFormat(game.i18n?.lang ?? undefined, { maximumFractionDigits: 2 }).format(partyDetection.averageLevel)
      : null;

    const budget = analyzeEncounterBudget({
      participants: draft.participants,
      partyLevel: draft.party?.level ?? 1,
      partySize: draft.party?.size ?? 4,
      threat: draft.threat?.target ?? "moderate",
      budgetOverride: draft.threat?.budget
    });
    const budgetRows = new Map(budget.rows.map((row) => [row.id, row]));
    const groups = (draft.groups ?? []).map((group) => ({ id: group.id, name: group.name || group.id }));
    const participants = (draft.participants ?? []).map((participant) => {
      const row = budgetRows.get(participant.id);
      const sourceType = participant.source?.type ?? "document";
      const sourceLabel = participant.source?.label || localize(`PF2E_ENCOUNTER_FORGE.Participants.SourceType.${sourceType}`, sourceType);
      return {
        ...participant,
        levelText: Number.isInteger(participant.level) ? String(participant.level) : "—",
        levelValue: Number.isInteger(participant.level) ? String(participant.level) : "",
        sourceLabel,
        xpText: Number.isFinite(row?.totalXp) ? String(row.totalXp) : "—",
        xpEachText: Number.isFinite(row?.xpEach) ? String(row.xpEach) : "—",
        budgetSupported: Boolean(row?.supported),
        canEditSource: ["document", "creatureForge", "npcForge"].includes(sourceType),
        roleOptions: [
          { value: "", label: localize("PF2E_ENCOUNTER_FORGE.Participants.RoleNone", "No role"), selected: !participant.role },
          ...ENCOUNTER_ROLES.map((value) => ({
            value,
            label: localize(`PF2E_ENCOUNTER_FORGE.Participants.Role.${value}`, value),
            selected: participant.role === value
          }))
        ],
        groupOptions: [
          { value: "", label: localize("PF2E_ENCOUNTER_FORGE.Participants.GroupNone", "No group"), selected: !participant.groupId },
          ...groups.map((group) => ({ ...group, value: group.id, label: group.name, selected: participant.groupId === group.id }))
        ],
        tokenNameDisplayOptions: tokenDisplayOptions(participant.tokenDisplay?.displayName),
        hpBarDisplayOptions: tokenDisplayOptions(participant.tokenDisplay?.displayBars)
      };
    });

    const hasPlaceholderParticipants = (draft.participants ?? []).some((participant) => participant.source?.type === "example");
    const isExample = isExampleEncounterBlueprint(draft);

    const creatureApi = api?.integrations?.api?.("creatureForge");
    const npcApi = api?.integrations?.api?.("npcForge");
    const creatureForgeReady = Boolean(api?.integrations?.status?.("creatureForge")?.usable && creatureApi?.ui?.creatureEditor?.create);
    const npcForgeReady = Boolean(api?.integrations?.status?.("npcForge")?.usable && npcApi?.ui?.createEditor);

    const phaseChoices = (draft.phases ?? []).map((phase) => ({ value: phase.id, label: phase.name || phase.id }));
    const objectiveChoices = (draft.objectives ?? []).map((objective) => ({ value: objective.id, label: objective.name || objective.id }));
    const participantChoices = (draft.participants ?? []).map((participant) => ({ value: participant.id, label: participant.name || participant.id }));
    const groupChoices = (draft.groups ?? []).map((group) => ({ value: group.id, label: group.name || group.id }));
    const flowActions = (draft.actions ?? []).map((action) => {
      const type = String(action.type ?? action.kind ?? "director.message");
      const integration = integrationActionDescriptor(type);
      const integrationState = integration ? api?.integrations?.status?.(integration.integrationId) : null;
      const targetMode = String(action.targetMode ?? "participant");
      const targetOptions = targetMode === "group" ? groupChoices : participantChoices;
      const integrationConfigured = type === "loot.createActor"
        ? Boolean(action.loot?.config || action.loot?.loot || action.loot?.result)
        : Boolean(action.definition || action.definitionId);
      return {
        ...action,
        type,
        isPhaseTransition: type === "phase.transition",
        isObjectiveProgress: type === "objective.progress",
        isDirectorMessage: type === "director.message",
        isIntegrationAction: Boolean(integration),
        isAuraAction: type === "aura.setEnabled",
        isLootAction: type === "loot.createActor",
        integrationUsable: Boolean(integrationState?.usable),
        integrationConfigured,
        hasSpecificTarget: targetMode !== "all",
        targetMode,
        integrationStatusLabel: integrationState ? localize(`PF2E_ENCOUNTER_FORGE.Integrations.Status.${integrationState.usable ? "integrated" : (integrationState.ready ? "disabled" : integrationState.active ? "notReady" : integrationState.installed ? "inactive" : "missing")}`, integrationState.usable ? "Integrated" : "Unavailable") : "",
        amountValue: Number.isFinite(Number(action.amount)) ? Number(action.amount) : 1,
        auraEnabledChecked: action.enabled !== false,
        typeOptions: FLOW_ACTION_TYPES.map((value) => {
          const descriptor = integrationActionDescriptor(value);
          const status = descriptor ? api?.integrations?.status?.(descriptor.integrationId) : null;
          const available = !descriptor || Boolean(status?.usable) || value === type;
          return { value, label: localize(`PF2E_ENCOUNTER_FORGE.Flow.ActionType.${value}`, value), selected: type === value, disabled: !available };
        }),
        phaseOptions: [{ value: "", label: localize("PF2E_ENCOUNTER_FORGE.Flow.SelectPhase", "Select phase"), selected: !action.phaseId }, ...phaseChoices.map((entry) => ({ ...entry, selected: action.phaseId === entry.value }))],
        objectiveOptions: [{ value: "", label: localize("PF2E_ENCOUNTER_FORGE.Flow.SelectObjective", "Select objective"), selected: !action.objectiveId }, ...objectiveChoices.map((entry) => ({ ...entry, selected: action.objectiveId === entry.value }))],
        targetModeOptions: ["participant", "group", "all"].map((value) => ({ value, label: localize(`PF2E_ENCOUNTER_FORGE.Flow.TargetMode.${value}`, value), selected: targetMode === value })),
        targetOptions: [{ value: "", label: localize("PF2E_ENCOUNTER_FORGE.Flow.SelectTarget", "Select target"), selected: !action.targetId }, ...targetOptions.map((entry) => ({ ...entry, selected: action.targetId === entry.value }))]
      };
    });
    const conditionLogicDisplayMode = getConditionLogicDisplayMode();
    const triggers = (draft.triggers ?? []).map((trigger) => {
      const authoredConditions = trigger.conditions ?? [];
      const usesObjectiveConditionContext = authoredConditions.some((condition) => FLOW_OBJECTIVE_CONTEXT_FIELDS.includes(String(condition?.field ?? condition?.path ?? "")));
      const usesGroupConditionContext = authoredConditions.some((condition) => FLOW_GROUP_CONTEXT_FIELDS.includes(String(condition?.field ?? condition?.path ?? "")));
      return {
      ...trigger,
      enabledChecked: trigger.enabled !== false,
      onceChecked: trigger.once !== false,
      confirmChecked: trigger.confirm !== false && trigger.automatic !== true,
      usesObjectiveConditionContext,
      usesGroupConditionContext,
      conditionSummary: conditionSummary(trigger, { phases: phaseChoices, objectives: objectiveChoices, groups: groupChoices, participants: participantChoices, displayMode: conditionLogicDisplayMode }),
      eventOptions: FLOW_EVENT_TYPES.map((value) => ({ value, label: localize(`PF2E_ENCOUNTER_FORGE.Flow.Event.${value}`, value), selected: String(trigger.event ?? "") === value })),
      activePhaseOptions: [{ value: "", label: localize("PF2E_ENCOUNTER_FORGE.Flow.AnyPhase", "Any phase"), selected: !trigger.activePhaseId }, ...phaseChoices.map((entry) => ({ ...entry, selected: trigger.activePhaseId === entry.value }))],
      participantOptions: [{ value: "", label: localize("PF2E_ENCOUNTER_FORGE.Flow.AnyParticipant", "Any participant"), selected: !trigger.participantId }, ...participantChoices.map((entry) => ({ ...entry, selected: trigger.participantId === entry.value }))],
      objectiveOptions: [{ value: "", label: localize("PF2E_ENCOUNTER_FORGE.Flow.AnyObjective", "Any objective"), selected: !trigger.objectiveId }, ...objectiveChoices.map((entry) => ({ ...entry, selected: trigger.objectiveId === entry.value }))],
      conditionModeOptions: FLOW_CONDITION_MODES.map((value) => ({ value, label: localize(`PF2E_ENCOUNTER_FORGE.Flow.ConditionMode.${conditionLogicDisplayMode}.${value}`, value === "all" ? "AND" : "OR"), selected: String(trigger.conditionMode ?? "all") === value })),
      conditionObjectiveOptions: [{ value: "", label: localize("PF2E_ENCOUNTER_FORGE.Flow.NoConditionObjective", "No objective context"), selected: !trigger.conditionObjectiveId }, ...objectiveChoices.map((entry) => ({ ...entry, selected: trigger.conditionObjectiveId === entry.value }))],
      conditionGroupOptions: [{ value: "", label: localize("PF2E_ENCOUNTER_FORGE.Flow.NoConditionGroup", "No group context"), selected: !trigger.conditionGroupId }, ...groupChoices.map((entry) => ({ ...entry, selected: trigger.conditionGroupId === entry.value }))],
      conditions: (trigger.conditions ?? []).map((condition, conditionIndex) => {
        const field = String(condition.field ?? condition.path ?? "");
        const isParticipantContext = FLOW_PARTICIPANT_CONTEXT_FIELDS.includes(field);
        const isGroupParticipantContext = FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS.includes(field);
        const isBooleanContext = FLOW_BOOLEAN_CONDITION_FIELDS.includes(field);
        const operatorValues = isBooleanContext ? ["eq", "neq"] : FLOW_OPERATORS;
        const groupMatchMode = FLOW_GROUP_MATCH_MODES.includes(String(condition.groupMatchMode ?? "any")) ? String(condition.groupMatchMode ?? "any") : "any";
        return {
          ...condition,
          conditionIndex,
          negateChecked: condition.negate === true,
          isPhaseContext: field === "currentPhaseId",
          isParticipantContext,
          isGroupParticipantContext,
          isBooleanContext,
          isGroupMatchCount: groupMatchMode === "atLeast",
          groupMatchCountValue: Math.max(1, Number(condition.groupMatchCount ?? 1) || 1),
          phaseValueOptions: [{ value: "", label: localize("PF2E_ENCOUNTER_FORGE.Flow.SelectPhase", "Select phase"), selected: !condition.value }, ...phaseChoices.map((entry) => ({ ...entry, selected: String(condition.value ?? "") === entry.value }))],
          participantContextOptions: [{ value: "", label: localize("PF2E_ENCOUNTER_FORGE.Flow.SelectConditionParticipant", "Select participant"), selected: !condition.participantId }, ...participantChoices.map((entry) => ({ ...entry, selected: String(condition.participantId ?? "") === entry.value }))],
          groupContextOptions: [{ value: "", label: localize("PF2E_ENCOUNTER_FORGE.Flow.SelectConditionGroup", "Select group"), selected: !(condition.groupId ?? trigger.conditionGroupId) }, ...groupChoices.map((entry) => ({ ...entry, selected: String(condition.groupId ?? trigger.conditionGroupId ?? "") === entry.value }))],
          groupMatchModeOptions: FLOW_GROUP_MATCH_MODES.map((value) => ({ value, label: localize(`PF2E_ENCOUNTER_FORGE.Flow.GroupMatch.${value}`, value), selected: groupMatchMode === value })),
          booleanValueOptions: [
            { value: "true", label: localize("PF2E_ENCOUNTER_FORGE.Flow.Boolean.true", "Yes"), selected: condition.value === true || String(condition.value) === "true" },
            { value: "false", label: localize("PF2E_ENCOUNTER_FORGE.Flow.Boolean.false", "No"), selected: condition.value === false || String(condition.value) === "false" }
          ],
          fieldOptions: FLOW_CONDITION_FIELDS.map((value) => ({ value, label: localize(`PF2E_ENCOUNTER_FORGE.Flow.ConditionField.${value}`, value), selected: field === value })),
          operatorOptions: operatorValues.map((value) => ({ value, label: localize(`PF2E_ENCOUNTER_FORGE.Flow.Operator.${value}`, value), selected: String(condition.operator ?? "eq") === value }))
        };
      }),
      actionOptions: flowActions.map((action) => ({ id: action.id, label: action.name || action.id, checked: (trigger.actions ?? trigger.actionIds ?? []).includes(action.id) }))
      };
    });
    const phases = (draft.phases ?? []).map((phase, index, rows) => ({ ...phase, index, initial: index === 0, canMoveUp: index > 0, canMoveDown: index < rows.length - 1 }));
    const objectives = (draft.objectives ?? []).map((objective) => ({ ...objective, targetValue: Number.isFinite(Number(objective.target)) ? Number(objective.target) : 1 }));
    const flowReport = analyzeEncounterFlow(draft);
    const flowIssues = [...flowReport.errors.map((issue) => ({ ...issue, severity: "error" })), ...flowReport.warnings.map((issue) => ({ ...issue, severity: "warning" }))].map((issue) => ({
      ...issue,
      label: localize(`PF2E_ENCOUNTER_FORGE.Flow.Validation.${issue.code}`, issue.message),
      pathLabel: issue.path || "flow",
      icon: issue.severity === "error" ? "fa-circle-xmark" : "fa-triangle-exclamation"
    }));

    return {
      blueprints: this.blueprints.map((entry) => ({
        id: entry.id,
        name: entry.name || localize("PF2E_ENCOUNTER_FORGE.Editor.Untitled", "Untitled Encounter"),
        selected: entry.id === this.selectedBlueprintId,
        partyLevel: entry.party?.level ?? 1,
        partySize: entry.party?.size ?? 4,
        threat: localize(`PF2E_ENCOUNTER_FORGE.Threat.${entry.threat?.target ?? "moderate"}`, entry.threat?.target ?? "moderate")
      })),
      hasBlueprints: this.blueprints.length > 0,
      draft: {
        ...draft,
        threatBudget: draft.threat?.budget ?? "",
        participantCount: draft.participants?.reduce?.((sum, participant) => sum + (Number(participant.quantity) || 1), 0) ?? 0,
        groupCount: draft.groups?.length ?? 0,
        objectiveCount: draft.objectives?.length ?? 0,
        phaseCount: draft.phases?.length ?? 0,
        triggerCount: draft.triggers?.length ?? 0,
        actionCount: draft.actions?.length ?? 0
      },
      isDirty: this.isDirty,
      isSaved: Boolean(this.selectedBlueprintId),
      readyIntegrations,
      totalIntegrations: integrationRows.length,
      integrationRows,
      integrationsExpanded: this.integrationsExpanded,
      participants,
      groups,
      hasParticipants: participants.length > 0,
      canDeploy: participants.length > 0 && !hasPlaceholderParticipants,
      hasPlaceholderParticipants,
      isExample,
      hasGroups: groups.length > 0,
      creatureForgeReady,
      npcForgeReady,
      phases,
      objectives,
      flowActions,
      triggers,
      hasPhases: phases.length > 0,
      hasObjectives: objectives.length > 0,
      hasFlowActions: flowActions.length > 0,
      hasTriggers: triggers.length > 0,
      flowReport: { ...flowReport, issues: flowIssues, issueCount: flowIssues.length },
      budget: {
        ...budget,
        statusLabel: localize(`PF2E_ENCOUNTER_FORGE.Budget.Status.${budget.status}`, budget.status),
        remainingLabel: budget.remainingXp >= 0
          ? localize("PF2E_ENCOUNTER_FORGE.Budget.Remaining", "Remaining")
          : localize("PF2E_ENCOUNTER_FORGE.Budget.Over", "Over budget"),
        remainingAbs: Math.abs(budget.remainingXp)
      },
      partyDetection: partyDetection ? {
        ...partyDetection,
        averageLevelText,
        memberLevels: partyDetection.members?.map?.((member) => member.level).filter(Number.isFinite).join(", ") ?? "",
        sourceLabel: localize(`PF2E_ENCOUNTER_FORGE.Party.Source.${partyDetection.source}`, partyDetection.source ?? "")
      } : null,
      threatOptions: ["trivial", "low", "moderate", "severe", "extreme"].map((value) => ({
        value,
        label: localize(`PF2E_ENCOUNTER_FORGE.Threat.${value}`, value),
        selected: draft.threat?.target === value
      }))
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;

    for (const input of root.querySelectorAll("[data-blueprint-field], [data-participant-field], [data-group-field], [data-phase-field], [data-objective-field], [data-flow-action-field], [data-trigger-field], [data-trigger-condition-field], [data-trigger-action]")) {
      const syncAndRefreshReferences = () => {
        this.#syncDraftFromForm();
        this.#refreshReferenceLabels();
      };
      input.addEventListener("input", syncAndRefreshReferences);
      input.addEventListener("change", syncAndRefreshReferences);
    }
    for (const select of root.querySelectorAll('[data-flow-action-field="type"]')) {
      select.addEventListener("change", async () => {
        this.#syncDraftFromForm();
        await this.#renderFresh();
      });
    }
    for (const control of root.querySelectorAll('[data-flow-action-field="phaseId"], [data-flow-action-field="objectiveId"], [data-flow-action-field="targetMode"], [data-flow-action-field="targetId"], [data-flow-action-field="enabled"], [data-trigger-field="event"], [data-trigger-field="activePhaseId"], [data-trigger-field="participantId"], [data-trigger-field="objectiveId"], [data-trigger-field="conditionMode"], [data-trigger-field="conditionObjectiveId"], [data-trigger-field="conditionGroupId"], [data-trigger-condition-field], [data-trigger-action]')) {
      control.addEventListener("change", async () => {
        this.#syncDraftFromForm();
        await this.#renderFresh();
      });
    }

    const dropZone = root.querySelector("[data-participant-drop]");
    dropZone?.addEventListener("dragover", (event) => { event.preventDefault(); dropZone.classList.add("dragover"); });
    dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone?.addEventListener("drop", async (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragover");
      await this.#handleParticipantDrop(event);
    });
    this.#updateDirtyIndicator();
    this.#updateBudgetDisplay();
    this.#restoreScrollState();
  }

  async close(options = {}) {
    this.#syncDraftFromForm();
    if (!this.allowCloseWithoutPrompt && this.isDirty) {
      const confirmed = await confirmDialog(
        "PF2E_ENCOUNTER_FORGE.Dialogs.DiscardTitle",
        "PF2E_ENCOUNTER_FORGE.Dialogs.DiscardPrompt"
      );
      if (!confirmed) return this;
    }
    this.allowCloseWithoutPrompt = false;
    for (const app of [...this.childApps]) {
      try { await app.close?.({ animate: false }); } catch {}
    }
    this.childApps.clear();
    return super.close(options);
  }

  async #reloadBlueprints() {
    const api = getApi();
    const rows = api?.blueprints?.list?.() ?? [];
    this.blueprints = rows
      .map((row) => clone(row?.data ?? row))
      .filter((entry) => entry?.id)
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), game.i18n?.lang));
  }

  async #seedInitialExampleIfNeeded() {
    if (!game.user?.isGM || isInitialExampleSeedDone()) return false;
    let created = false;
    try {
      if (this.blueprints.length === 0) {
        const detection = getApi()?.party?.detect?.() ?? null;
        const example = createExampleEncounterBlueprint({
          partyLevel: detection?.available ? detection.partyLevel : 5,
          partySize: detection?.available ? detection.size : 4
        });
        await getApi()?.blueprints?.save?.(example);
        created = true;
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Initial example Encounter could not be created.`, error);
    } finally {
      await markInitialExampleSeedDone();
    }
    return created;
  }

  #resetDraft() {
    this.selectedBlueprintId = null;
    const detection = getApi()?.party?.detect?.() ?? null;
    this.partyDetection = detection;
    const party = detection?.available
      ? { level: detection.partyLevel, size: detection.size }
      : undefined;
    this.draft = createEncounterBlueprint({
      name: localize("PF2E_ENCOUNTER_FORGE.Editor.NewEncounter", "New Encounter"),
      party
    });
    this.savedSnapshot = JSON.stringify(this.draft);
  }

  #loadBlueprint(id) {
    const found = this.blueprints.find((entry) => entry.id === id);
    if (!found) return false;
    this.selectedBlueprintId = found.id;
    this.draft = clone(found);
    this.partyDetection = getApi()?.party?.detect?.() ?? null;
    this.savedSnapshot = JSON.stringify(this.draft);
    return true;
  }

  #syncDraftFromForm() {
    const root = this.element;
    if (!(root instanceof HTMLElement)) return this.draft;

    const value = (name) => root.querySelector(`[name="${name}"]`)?.value;
    const next = clone(this.draft);
    next.name = String(value("name") ?? next.name ?? "").trim();
    next.description = String(value("description") ?? next.description ?? "");
    next.party ??= {};
    next.party.level = asInteger(value("partyLevel"), next.party.level ?? 1, { min: 1, max: 20 });
    next.party.size = asInteger(value("partySize"), next.party.size ?? 4, { min: 1, max: 12 });
    next.threat ??= {};
    next.threat.target = String(value("threatTarget") ?? next.threat.target ?? "moderate");
    next.threat.budget = asNullableNumber(value("threatBudget"));

    const participantById = new Map((next.participants ?? []).map((participant) => [participant.id, participant]));
    for (const card of root.querySelectorAll(".encounter-forge-participant[data-participant-id]")) {
      const participant = participantById.get(card.dataset.participantId);
      if (!participant) continue;
      const read = (field) => card.querySelector(`[data-participant-field="${field}"]`)?.value;
      participant.name = String(read("name") ?? participant.name ?? "").trim() || participant.name;
      const levelText = String(read("level") ?? "").trim();
      participant.level = levelText === "" ? null : asInteger(levelText, participant.level ?? 0, { min: -1, max: 24 });
      participant.quantity = asInteger(read("quantity"), participant.quantity ?? 1, { min: 1, max: 99 });
      participant.role = String(read("role") ?? "").trim() || null;
      participant.groupId = String(read("groupId") ?? "").trim() || null;
      participant.tokenDisplay ??= {};
      const displayName = String(read("tokenDisplayName") ?? "").trim();
      const displayBars = String(read("tokenDisplayBars") ?? "").trim();
      participant.tokenDisplay.displayName = TOKEN_DISPLAY_MODE_KEYS.includes(displayName) ? displayName : null;
      participant.tokenDisplay.displayBars = TOKEN_DISPLAY_MODE_KEYS.includes(displayBars) ? displayBars : null;
      participant.tokenDisplay.hpBarAttribute = "attributes.hp";
    }

    const groupById = new Map((next.groups ?? []).map((group) => [group.id, group]));
    for (const row of root.querySelectorAll(".encounter-forge-group-row[data-group-id]")) {
      const group = groupById.get(row.dataset.groupId);
      if (!group) continue;
      const name = row.querySelector('[data-group-field="name"]')?.value;
      group.name = String(name ?? group.name ?? group.id).trim() || group.id;
    }

    const phaseById = new Map((next.phases ?? []).map((phase) => [phase.id, phase]));
    for (const row of root.querySelectorAll(".encounter-forge-phase-row[data-phase-id]")) {
      const phase = phaseById.get(row.dataset.phaseId);
      if (!phase) continue;
      const read = (field) => row.querySelector(`[data-phase-field="${field}"]`)?.value;
      phase.name = String(read("name") ?? phase.name ?? phase.id).trim() || phase.id;
      phase.description = String(read("description") ?? phase.description ?? "");
    }

    const objectiveById = new Map((next.objectives ?? []).map((objective) => [objective.id, objective]));
    for (const row of root.querySelectorAll(".encounter-forge-objective-row[data-objective-id]")) {
      const objective = objectiveById.get(row.dataset.objectiveId);
      if (!objective) continue;
      const read = (field) => row.querySelector(`[data-objective-field="${field}"]`)?.value;
      objective.name = String(read("name") ?? objective.name ?? objective.id).trim() || objective.id;
      objective.description = String(read("description") ?? objective.description ?? "");
      objective.target = asInteger(read("target"), Number(objective.target ?? 1), { min: 1, max: 999 });
    }

    const actionById = new Map((next.actions ?? []).map((action) => [action.id, action]));
    for (const row of root.querySelectorAll(".encounter-forge-flow-action-row[data-flow-action-id]")) {
      const action = actionById.get(row.dataset.flowActionId);
      if (!action) continue;
      const read = (field) => row.querySelector(`[data-flow-action-field="${field}"]`)?.value;
      action.name = String(read("name") ?? action.name ?? action.id).trim() || action.id;
      action.type = String(read("type") ?? action.type ?? "director.message");
      action.phaseId = String(read("phaseId") ?? "").trim() || null;
      action.objectiveId = String(read("objectiveId") ?? "").trim() || null;
      action.amount = asInteger(read("amount"), Number(action.amount ?? 1), { min: -999, max: 999 });
      action.message = String(read("message") ?? action.message ?? "");
      action.targetMode = String(read("targetMode") ?? action.targetMode ?? "participant");
      action.targetId = action.targetMode === "all" ? null : (String(read("targetId") ?? action.targetId ?? "").trim() || null);
      const enabledControl = row.querySelector('[data-flow-action-field="enabled"]');
      if (enabledControl) action.enabled = Boolean(enabledControl.checked);
    }

    const triggerById = new Map((next.triggers ?? []).map((trigger) => [trigger.id, trigger]));
    const numericConditionFields = new Set(FLOW_NUMERIC_CONDITION_FIELDS);
    for (const row of root.querySelectorAll(".encounter-forge-trigger-row[data-trigger-id]")) {
      const trigger = triggerById.get(row.dataset.triggerId);
      if (!trigger) continue;
      const field = (name) => row.querySelector(`[data-trigger-field="${name}"]`);
      const read = (name) => field(name)?.value;
      trigger.name = String(read("name") ?? trigger.name ?? trigger.id).trim() || trigger.id;
      trigger.event = String(read("event") ?? trigger.event ?? "combat.roundChanged");
      trigger.activePhaseId = String(read("activePhaseId") ?? "").trim() || null;
      trigger.participantId = String(read("participantId") ?? "").trim() || null;
      trigger.objectiveId = String(read("objectiveId") ?? "").trim() || null;
      trigger.conditionMode = FLOW_CONDITION_MODES.includes(String(read("conditionMode") ?? "all")) ? String(read("conditionMode") ?? "all") : "all";
      trigger.conditionObjectiveId = String(read("conditionObjectiveId") ?? "").trim() || null;
      trigger.conditionGroupId = String(read("conditionGroupId") ?? "").trim() || null;
      trigger.enabled = Boolean(field("enabled")?.checked);
      trigger.once = Boolean(field("once")?.checked);
      trigger.confirm = Boolean(field("confirm")?.checked);
      trigger.automatic = !trigger.confirm;
      trigger.conditions = [];
      for (const conditionRow of row.querySelectorAll(".encounter-forge-trigger-condition[data-condition-index]")) {
        const readCondition = (name) => conditionRow.querySelector(`[data-trigger-condition-field="${name}"]`)?.value;
        const conditionField = String(readCondition("field") ?? "").trim();
        if (!conditionField) continue;
        const rawValue = String(readCondition("value") ?? "").trim();
        const isBoolean = FLOW_BOOLEAN_CONDITION_FIELDS.includes(conditionField);
        trigger.conditions.push({
          field: conditionField,
          operator: String(readCondition("operator") ?? "eq"),
          value: isBoolean ? rawValue === "true" : (numericConditionFields.has(conditionField) && rawValue !== "" && Number.isFinite(Number(rawValue)) ? Number(rawValue) : rawValue),
          participantId: FLOW_PARTICIPANT_CONTEXT_FIELDS.includes(conditionField) ? (String(readCondition("participantId") ?? "").trim() || null) : null,
          groupId: FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS.includes(conditionField) ? (String(readCondition("groupId") ?? "").trim() || null) : null,
          groupMatchMode: FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS.includes(conditionField) && FLOW_GROUP_MATCH_MODES.includes(String(readCondition("groupMatchMode") ?? "any")) ? String(readCondition("groupMatchMode") ?? "any") : null,
          groupMatchCount: FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS.includes(conditionField) && String(readCondition("groupMatchMode") ?? "any") === "atLeast" ? asInteger(readCondition("groupMatchCount"), 1, { min: 1, max: 999 }) : null,
          negate: Boolean(conditionRow.querySelector('[data-trigger-condition-field="negate"]')?.checked)
        });
      }
      trigger.actions = [...row.querySelectorAll('[data-trigger-action]:checked')].map((input) => String(input.dataset.triggerAction ?? "")).filter(Boolean);
    }

    this.draft = next;
    this.#updateDirtyIndicator();
    this.#updateBudgetDisplay();
    return next;
  }

  #refreshReferenceLabels() {
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;

    const phases = new Map((this.draft?.phases ?? []).map((entry) => [String(entry.id), String(entry.name || entry.id)]));
    const objectives = new Map((this.draft?.objectives ?? []).map((entry) => [String(entry.id), String(entry.name || entry.id)]));
    const participants = new Map((this.draft?.participants ?? []).map((entry) => [String(entry.id), String(entry.name || entry.id)]));
    const groups = new Map((this.draft?.groups ?? []).map((entry) => [String(entry.id), String(entry.name || entry.id)]));
    const actions = new Map((this.draft?.actions ?? []).map((entry) => [String(entry.id), String(entry.name || entry.id)]));

    const refreshOptions = (selector, labels) => {
      for (const select of root.querySelectorAll(selector)) {
        for (const option of select.options ?? []) {
          const label = labels.get(String(option.value ?? ""));
          if (label) option.textContent = label;
        }
      }
    };

    refreshOptions('[data-flow-action-field="phaseId"], [data-trigger-field="activePhaseId"]', phases);
    refreshOptions('[data-flow-action-field="objectiveId"], [data-trigger-field="objectiveId"], [data-trigger-field="conditionObjectiveId"]', objectives);
    refreshOptions('[data-trigger-field="participantId"], [data-trigger-condition-field="participantId"]', participants);
    refreshOptions('[data-participant-field="groupId"], [data-trigger-field="conditionGroupId"], [data-trigger-condition-field="groupId"]', groups);
    for (const row of root.querySelectorAll('.encounter-forge-flow-action-row[data-flow-action-id]')) {
      const mode = row.querySelector('[data-flow-action-field="targetMode"]')?.value;
      const labels = mode === "group" ? groups : participants;
      const select = row.querySelector('[data-flow-action-field="targetId"]');
      if (!select) continue;
      for (const option of select.options ?? []) {
        const label = labels.get(String(option.value ?? ""));
        if (label) option.textContent = label;
      }
    }

    for (const label of root.querySelectorAll("[data-trigger-action-label]")) {
      const text = actions.get(String(label.dataset.triggerActionLabel ?? ""));
      if (text) label.textContent = text;
    }

    const title = root.querySelector(".encounter-forge-editor-header h1");
    if (title) title.textContent = String(this.draft?.name || localize("PF2E_ENCOUNTER_FORGE.Editor.Untitled", "Untitled Encounter"));
  }

  #updateDirtyIndicator() {
    const indicator = this.element?.querySelector?.("[data-dirty-indicator]");
    if (!(indicator instanceof HTMLElement)) return;
    indicator.classList.toggle("dirty", this.isDirty);
    indicator.classList.toggle("clean", !this.isDirty);
    const text = indicator.querySelector("[data-dirty-text]");
    if (text) {
      text.textContent = localize(
        this.isDirty ? "PF2E_ENCOUNTER_FORGE.Editor.UnsavedChanges" : "PF2E_ENCOUNTER_FORGE.Editor.AllChangesSaved",
        this.isDirty ? "Unsaved changes" : "All changes saved"
      );
    }
  }

  #updateBudgetDisplay() {
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;
    const budget = analyzeEncounterBudget({
      participants: this.draft?.participants ?? [],
      partyLevel: this.draft?.party?.level ?? 1,
      partySize: this.draft?.party?.size ?? 4,
      threat: this.draft?.threat?.target ?? "moderate",
      budgetOverride: this.draft?.threat?.budget
    });
    const set = (selector, value) => { const el = root.querySelector(selector); if (el) el.textContent = value; };
    set("[data-budget-used]", String(budget.usedXp));
    set("[data-budget-target]", String(budget.targetXp));
    set("[data-budget-automatic]", String(budget.automaticTarget));
    set("[data-structure-participant-count]", String((this.draft?.participants ?? []).reduce((sum, participant) => sum + (Number(participant.quantity) || 1), 0)));
    set("[data-budget-status]", localize(`PF2E_ENCOUNTER_FORGE.Budget.Status.${budget.status}`, budget.status));
    set("[data-budget-remaining]", String(Math.abs(budget.remainingXp)));
    set("[data-budget-remaining-label]", budget.remainingXp >= 0
      ? localize("PF2E_ENCOUNTER_FORGE.Budget.Remaining", "Remaining")
      : localize("PF2E_ENCOUNTER_FORGE.Budget.Over", "Over budget"));
    const box = root.querySelector("[data-budget-summary]");
    if (box) box.dataset.status = budget.status;
    const warning = root.querySelector("[data-budget-warning]");
    if (warning instanceof HTMLElement) warning.hidden = budget.unknownCount === 0;

    for (const row of budget.rows) {
      set(`[data-participant-xp="${row.id}"]`, Number.isFinite(row.totalXp) ? String(row.totalXp) : "—");
      set(`[data-participant-xp-each="${row.id}"]`, Number.isFinite(row.xpEach) ? String(row.xpEach) : "—");
      set(`[data-participant-xp-quantity="${row.id}"]`, String(row.quantity));
      const card = root.querySelector(`[data-participant-id="${row.id}"]`);
      const xpBox = card?.querySelector?.(".encounter-forge-participant-xp");
      xpBox?.classList?.toggle?.("unsupported", !row.supported);
      if (xpBox instanceof HTMLElement) {
        xpBox.dataset.delta = Number.isInteger(row.delta) ? String(row.delta) : "";
        xpBox.dataset.supported = String(Boolean(row.supported));
      }
    }
  }

  async #confirmDiscardIfNeeded() {
    this.#syncDraftFromForm();
    if (!this.isDirty) return true;
    return confirmDialog("PF2E_ENCOUNTER_FORGE.Dialogs.DiscardTitle", "PF2E_ENCOUNTER_FORGE.Dialogs.DiscardPrompt");
  }

  #captureScrollState() {
    const root = this.element;
    if (!(root instanceof HTMLElement)) return null;
    const editor = root.querySelector(".encounter-forge-editor");
    const library = root.querySelector(".encounter-forge-blueprint-list");
    const integrations = root.querySelector(".encounter-forge-integration-list");
    return {
      editorTop: editor instanceof HTMLElement ? editor.scrollTop : 0,
      editorLeft: editor instanceof HTMLElement ? editor.scrollLeft : 0,
      libraryTop: library instanceof HTMLElement ? library.scrollTop : 0,
      integrationsTop: integrations instanceof HTMLElement ? integrations.scrollTop : 0
    };
  }

  #restoreScrollState() {
    const state = this.pendingScrollState;
    this.pendingScrollState = null;
    if (!state) return;
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;
    const editor = root.querySelector(".encounter-forge-editor");
    const library = root.querySelector(".encounter-forge-blueprint-list");
    const integrations = root.querySelector(".encounter-forge-integration-list");
    if (editor instanceof HTMLElement) {
      editor.scrollTop = state.editorTop;
      editor.scrollLeft = state.editorLeft;
    }
    if (library instanceof HTMLElement) library.scrollTop = state.libraryTop;
    if (integrations instanceof HTMLElement) integrations.scrollTop = state.integrationsTop;
  }

  async #renderFresh({ preserveScroll = true } = {}) {
    this.pendingScrollState = preserveScroll ? this.#captureScrollState() : null;
    await this.render({ force: true });
  }


  #addParticipant(payload = {}) {
    const participant = {
      id: randomId("participant"),
      name: String(payload.name ?? localize("PF2E_ENCOUNTER_FORGE.Participants.NewParticipant", "Participant")),
      img: payload.img ?? null,
      level: payload.level !== null && payload.level !== "" && Number.isInteger(Number(payload.level)) ? Number(payload.level) : null,
      source: clone(payload.source ?? { type: "document", uuid: null }),
      quantity: 1,
      role: normalizeSuggestedRole(payload.suggestedRole),
      groupId: null,
      tacticsProfileId: null,
      tokenDisplay: { displayName: null, displayBars: null, hpBarAttribute: "attributes.hp" },
      adjustments: [],
      overrides: {}
    };
    const next = clone(this.draft);
    next.participants ??= [];
    next.participants.push(participant);
    this.draft = next;
    return participant;
  }

  async #addActorFromUuid(uuid) {
    if (!uuid || typeof globalThis.fromUuid !== "function") return false;
    const actor = await globalThis.fromUuid(uuid);
    if (!actor || actor.documentName !== "Actor" || actor.type !== "npc") {
      ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.ActorMustBeNpc", "Only PF2e NPC Actors can be added as encounter participants."));
      return false;
    }
    const pack = actor.pack ? game.packs?.get?.(actor.pack) : null;
    this.#addParticipant({
      name: actor.name,
      img: actor.img,
      level: actorLevel(actor),
      source: {
        type: "document",
        uuid: actor.uuid,
        label: pack?.metadata?.label ?? (actor.pack ? actor.pack : localize("PF2E_ENCOUNTER_FORGE.Participants.WorldActors", "World Actors"))
      }
    });
    await this.#renderFresh();
    return true;
  }

  async #handleParticipantDrop(event) {
    this.#syncDraftFromForm();
    let data = null;
    try { data = globalThis.TextEditor?.getDragEventData?.(event) ?? null; } catch { data = null; }
    const uuid = data?.uuid ?? null;
    if (!uuid) {
      ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.ActorDropUnsupported", "Drop an Actor from the sidebar or an Actor compendium here."));
      return;
    }
    try { await this.#addActorFromUuid(uuid); }
    catch (error) {
      console.error(`${MODULE_ID} | Participant drop failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.ParticipantAddFailed", "Participant could not be added."));
    }
  }

  #trackChild(app) {
    if (app) this.childApps.add(app);
    return app;
  }

  async #openIntegrationActionEditor(action) {
    const descriptor = integrationActionDescriptor(action?.type);
    if (!descriptor) return;
    const status = getApi()?.integrations?.status?.(descriptor.integrationId);
    if (!status?.usable) {
      ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.IntegrationActionUnavailable", "The required integration is not available or enabled."));
      return;
    }
    const app = this.#trackChild(new IntegrationActionEditorApp({
      action,
      partyLevel: this.draft?.party?.level ?? 1,
      partySize: this.draft?.party?.size ?? 4,
      onCommit: async (payload) => {
        this.#syncDraftFromForm();
        const next = clone(this.draft);
        const target = next.actions?.find?.((entry) => entry.id === action.id);
        if (target) Object.assign(target, clone(payload));
        this.draft = next;
        await this.#renderFresh();
      }
    }));
    await app.render({ force: true });
  }

  async #openForgeParticipantEditor(kind, participant = null) {
    const source = participant?.source?.type === kind ? participant.source : null;
    const app = this.#trackChild(new ForgeParticipantEditorApp({
      kind,
      partyLevel: this.draft?.party?.level ?? 1,
      source,
      onCommit: async (payload) => {
        this.#syncDraftFromForm();
        if (participant) {
          const next = clone(this.draft);
          const target = next.participants?.find?.((entry) => entry.id === participant.id);
          if (target) {
            target.source = clone(payload.source);
            target.name = payload.name ?? target.name;
            target.level = payload.level !== null && payload.level !== "" && Number.isInteger(Number(payload.level)) ? Number(payload.level) : target.level;
            target.img = payload.img ?? target.img;
            target.role ??= normalizeSuggestedRole(payload.suggestedRole);
          }
          this.draft = next;
        } else {
          this.#addParticipant(payload);
        }
        await this.#renderFresh();
      }
    }));
    await app.render({ force: true });
  }



  static async browseParticipant() {
    this.#syncDraftFromForm();
    const app = this.#trackChild(new ParticipantBrowserApp({ onSelect: (uuid) => this.#addActorFromUuid(uuid) }));
    await app.initialize();
    await app.render({ force: true });
  }

  static async addCreatureForgeParticipant() {
    this.#syncDraftFromForm();
    await this.#openForgeParticipantEditor("creatureForge");
  }

  static async addNpcForgeParticipant() {
    this.#syncDraftFromForm();
    await this.#openForgeParticipantEditor("npcForge");
  }

  static async editParticipant(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.participantId;
    const participant = this.draft?.participants?.find?.((entry) => entry.id === id);
    if (!participant) return;
    if (participant.source?.type === "creatureForge" || participant.source?.type === "npcForge") {
      await this.#openForgeParticipantEditor(participant.source.type, participant);
      return;
    }
    if (participant.source?.type === "document" && participant.source?.uuid && typeof globalThis.fromUuid === "function") {
      const actor = await globalThis.fromUuid(participant.source.uuid);
      actor?.sheet?.render?.({ force: true });
    }
  }

  static async removeParticipant(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.participantId;
    if (!id) return;
    const next = clone(this.draft);
    next.participants = (next.participants ?? []).filter((entry) => entry.id !== id);
    for (const trigger of next.triggers ?? []) {
      if (trigger.participantId === id) trigger.participantId = null;
      for (const condition of trigger.conditions ?? []) if (condition.participantId === id) condition.participantId = null;
    }
    for (const action of next.actions ?? []) {
      if (String(action.targetMode ?? "participant") === "participant" && action.targetId === id) action.targetId = null;
    }
    this.draft = next;
    await this.#renderFresh();
  }

  static async addGroup() {
    this.#syncDraftFromForm();
    const next = clone(this.draft);
    next.groups ??= [];
    const number = next.groups.length + 1;
    next.groups.push({ id: randomId("group"), name: `${localize("PF2E_ENCOUNTER_FORGE.Participants.Group", "Group")} ${number}` });
    this.draft = next;
    await this.#renderFresh();
  }

  static async removeGroup(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.groupId;
    if (!id) return;
    const next = clone(this.draft);
    next.groups = (next.groups ?? []).filter((entry) => entry.id !== id);
    for (const participant of next.participants ?? []) if (participant.groupId === id) participant.groupId = null;
    for (const trigger of next.triggers ?? []) {
      if (trigger.conditionGroupId === id) trigger.conditionGroupId = null;
      for (const condition of trigger.conditions ?? []) if (condition.groupId === id) condition.groupId = null;
    }
    this.draft = next;
    await this.#renderFresh();
  }

  static async addPhase() {
    this.#syncDraftFromForm();
    const next = clone(this.draft);
    next.phases ??= [];
    const number = next.phases.length + 1;
    next.phases.push({
      id: randomId("phase"),
      name: `${localize("PF2E_ENCOUNTER_FORGE.Flow.Phase", "Phase")} ${number}`,
      description: ""
    });
    this.draft = next;
    await this.#renderFresh();
  }

  static async duplicatePhase(_event, target) {
    this.#syncDraftFromForm();
    const id = String(target?.dataset?.phaseId ?? "").trim();
    const next = clone(this.draft);
    const index = (next.phases ?? []).findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const source = clone(next.phases[index]);
    source.id = randomId("phase");
    source.name = `${source.name || localize("PF2E_ENCOUNTER_FORGE.Flow.Phase", "Phase")} (${localize("PF2E_ENCOUNTER_FORGE.Flow.Copy", "Copy")})`;
    next.phases.splice(index + 1, 0, source);
    this.draft = next;
    await this.#renderFresh();
  }

  static async removePhase(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.phaseId;
    if (!id) return;
    const next = clone(this.draft);
    next.phases = (next.phases ?? []).filter((entry) => entry.id !== id);
    for (const action of next.actions ?? []) if (action.phaseId === id) action.phaseId = null;
    for (const trigger of next.triggers ?? []) {
      if (trigger.activePhaseId === id) trigger.activePhaseId = null;
      for (const condition of trigger.conditions ?? []) {
        if (condition.field === "currentPhaseId" && String(condition.value ?? "") === String(id)) condition.value = "";
      }
    }
    this.draft = next;
    await this.#renderFresh();
  }

  static async movePhaseUp(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.phaseId;
    const next = clone(this.draft);
    const index = next.phases?.findIndex?.((entry) => entry.id === id) ?? -1;
    if (index <= 0) return;
    [next.phases[index - 1], next.phases[index]] = [next.phases[index], next.phases[index - 1]];
    this.draft = next;
    await this.#renderFresh();
  }

  static async movePhaseDown(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.phaseId;
    const next = clone(this.draft);
    const index = next.phases?.findIndex?.((entry) => entry.id === id) ?? -1;
    if (index < 0 || index >= (next.phases?.length ?? 0) - 1) return;
    [next.phases[index], next.phases[index + 1]] = [next.phases[index + 1], next.phases[index]];
    this.draft = next;
    await this.#renderFresh();
  }

  static async addObjective() {
    this.#syncDraftFromForm();
    const next = clone(this.draft);
    next.objectives ??= [];
    const number = next.objectives.length + 1;
    next.objectives.push({
      id: randomId("objective"),
      name: `${localize("PF2E_ENCOUNTER_FORGE.Flow.Objective", "Objective")} ${number}`,
      description: "",
      target: 1
    });
    this.draft = next;
    await this.#renderFresh();
  }

  static async duplicateObjective(_event, target) {
    this.#syncDraftFromForm();
    const id = String(target?.dataset?.objectiveId ?? "").trim();
    const next = clone(this.draft);
    const index = (next.objectives ?? []).findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const source = clone(next.objectives[index]);
    source.id = randomId("objective");
    source.name = `${source.name || localize("PF2E_ENCOUNTER_FORGE.Flow.Objective", "Objective")} (${localize("PF2E_ENCOUNTER_FORGE.Flow.Copy", "Copy")})`;
    next.objectives.splice(index + 1, 0, source);
    this.draft = next;
    await this.#renderFresh();
  }

  static async removeObjective(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.objectiveId;
    if (!id) return;
    const next = clone(this.draft);
    next.objectives = (next.objectives ?? []).filter((entry) => entry.id !== id);
    for (const action of next.actions ?? []) if (action.objectiveId === id) action.objectiveId = null;
    for (const trigger of next.triggers ?? []) {
      if (trigger.objectiveId === id) trigger.objectiveId = null;
      if (trigger.conditionObjectiveId === id) trigger.conditionObjectiveId = null;
    }
    this.draft = next;
    await this.#renderFresh();
  }

  static async addFlowAction() {
    this.#syncDraftFromForm();
    const next = clone(this.draft);
    next.actions ??= [];
    const number = next.actions.length + 1;
    next.actions.push({
      id: randomId("action"),
      name: `${localize("PF2E_ENCOUNTER_FORGE.Flow.Action", "Action")} ${number}`,
      type: "director.message",
      message: "",
      amount: 1,
      phaseId: null,
      objectiveId: null
    });
    this.draft = next;
    await this.#renderFresh();
  }

  static async duplicateFlowAction(_event, target) {
    this.#syncDraftFromForm();
    const id = String(target?.dataset?.flowActionId ?? "").trim();
    const next = clone(this.draft);
    const index = (next.actions ?? []).findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const source = clone(next.actions[index]);
    source.id = randomId("action");
    source.name = `${source.name || localize("PF2E_ENCOUNTER_FORGE.Flow.Action", "Action")} (${localize("PF2E_ENCOUNTER_FORGE.Flow.Copy", "Copy")})`;
    next.actions.splice(index + 1, 0, source);
    this.draft = next;
    await this.#renderFresh();
  }

  static async configureFlowAction(_event, target) {
    this.#syncDraftFromForm();
    const id = String(target?.dataset?.flowActionId ?? "").trim();
    const action = this.draft?.actions?.find?.((entry) => entry.id === id);
    if (!action) return;
    await this.#openIntegrationActionEditor(action);
  }

  static async removeFlowAction(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.flowActionId;
    if (!id) return;
    const next = clone(this.draft);
    next.actions = (next.actions ?? []).filter((entry) => entry.id !== id);
    for (const trigger of next.triggers ?? []) {
      trigger.actions = (trigger.actions ?? trigger.actionIds ?? []).filter((actionId) => actionId !== id);
      delete trigger.actionIds;
    }
    this.draft = next;
    await this.#renderFresh();
  }

  static async addTrigger() {
    this.#syncDraftFromForm();
    const next = clone(this.draft);
    next.triggers ??= [];
    const number = next.triggers.length + 1;
    next.triggers.push({
      id: randomId("trigger"),
      name: `${localize("PF2E_ENCOUNTER_FORGE.Flow.Trigger", "Trigger")} ${number}`,
      event: "combat.roundEnded",
      activePhaseId: null,
      participantId: null,
      objectiveId: null,
      conditionMode: "all",
      conditionObjectiveId: null,
      conditionGroupId: null,
      enabled: true,
      once: true,
      confirm: true,
      automatic: false,
      conditions: [],
      actions: []
    });
    this.draft = next;
    await this.#renderFresh();
  }

  static async duplicateTrigger(_event, target) {
    this.#syncDraftFromForm();
    const id = String(target?.dataset?.triggerId ?? "").trim();
    const next = clone(this.draft);
    const index = (next.triggers ?? []).findIndex((entry) => entry.id === id);
    if (index < 0) return;
    const source = clone(next.triggers[index]);
    source.id = randomId("trigger");
    source.name = `${source.name || localize("PF2E_ENCOUNTER_FORGE.Flow.Trigger", "Trigger")} (${localize("PF2E_ENCOUNTER_FORGE.Flow.Copy", "Copy")})`;
    // Duplicate triggers start disabled so a copied trigger cannot accidentally fire alongside its source.
    source.enabled = false;
    next.triggers.splice(index + 1, 0, source);
    this.draft = next;
    await this.#renderFresh();
  }

  static async removeTrigger(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.triggerId;
    if (!id) return;
    const next = clone(this.draft);
    next.triggers = (next.triggers ?? []).filter((entry) => entry.id !== id);
    this.draft = next;
    await this.#renderFresh();
  }

  static async addTriggerCondition(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.triggerId;
    const next = clone(this.draft);
    const trigger = next.triggers?.find?.((entry) => entry.id === id);
    if (!trigger) return;
    trigger.conditions ??= [];
    const hpEvent = ["participant.hpChanged", "participant.hpDecreased", "participant.hpIncreased"].includes(trigger.event);
    const defaults = hpEvent
      ? { field: "hpPercent", operator: "lte", value: 50 }
      : trigger.event === "objective.progressChanged"
        ? { field: "progress", operator: "gte", value: 1 }
        : { field: "round", operator: "gte", value: 1 };
    trigger.conditions.push({ ...defaults, negate: false });
    this.draft = next;
    await this.#renderFresh();
  }

  static async removeTriggerCondition(_event, target) {
    this.#syncDraftFromForm();
    const id = target?.dataset?.triggerId;
    const index = Number.parseInt(target?.dataset?.conditionIndex ?? "-1", 10);
    if (!id || index < 0) return;
    const next = clone(this.draft);
    const trigger = next.triggers?.find?.((entry) => entry.id === id);
    if (!trigger) return;
    trigger.conditions = (trigger.conditions ?? []).filter((_entry, conditionIndex) => conditionIndex !== index);
    this.draft = next;
    await this.#renderFresh();
  }

  static async toggleIntegrations() {
    this.#syncDraftFromForm();
    this.integrationsExpanded = !this.integrationsExpanded;
    await this.#renderFresh();
  }

  static async toggleIntegration(_event, target) {
    this.#syncDraftFromForm();
    const id = String(target?.dataset?.integrationId ?? "").trim();
    if (!id) return;
    const api = getApi();
    const status = api?.integrations?.status?.(id);
    if (!status?.ready || !api?.integrations?.setEnabled) return;
    const enabled = !status.enabled;
    await api.integrations.setEnabled(id, enabled);
    ui.notifications.info(localize(
      enabled ? "PF2E_ENCOUNTER_FORGE.Notifications.IntegrationEnabled" : "PF2E_ENCOUNTER_FORGE.Notifications.IntegrationDisabled",
      enabled ? "Integration enabled." : "Integration disabled."
    ));
    await this.#renderFresh();
  }

  static async detectParty() {
    this.#syncDraftFromForm();
    const detection = getApi()?.party?.detect?.() ?? null;
    this.partyDetection = detection;
    if (!detection?.available) {
      ui.notifications.warn(localize(
        "PF2E_ENCOUNTER_FORGE.Notifications.PartyNotDetected",
        "No player characters could be detected."
      ));
      await this.#renderFresh();
      return;
    }

    const next = clone(this.draft);
    next.party ??= {};
    next.party.size = detection.size;
    next.party.level = detection.partyLevel;
    this.draft = next;
    ui.notifications.info(localize(
      "PF2E_ENCOUNTER_FORGE.Notifications.PartyDetected",
      "Party size and level were updated from the current player characters."
    ));
    await this.#renderFresh();
  }

  static async createExampleBlueprint() {
    if (!await this.#confirmDiscardIfNeeded()) return;
    const existing = this.blueprints.find((entry) => isExampleEncounterBlueprint(entry));
    if (existing) {
      this.#loadBlueprint(existing.id);
      await markInitialExampleSeedDone();
      await this.#renderFresh({ preserveScroll: false });
      return;
    }

    const detection = getApi()?.party?.detect?.() ?? null;
    const example = createExampleEncounterBlueprint({
      partyLevel: detection?.available ? detection.partyLevel : 5,
      partySize: detection?.available ? detection.size : 4
    });
    try {
      await getApi()?.blueprints?.save?.(example);
      await markInitialExampleSeedDone();
      await this.#reloadBlueprints();
      this.#loadBlueprint(example.id);
      ui.notifications.info(localize("PF2E_ENCOUNTER_FORGE.Notifications.ExampleCreated", "Example encounter created."));
      await this.#renderFresh({ preserveScroll: false });
    } catch (error) {
      console.error(`${MODULE_ID} | Creating example Encounter failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.ExampleCreateFailed", "The example encounter could not be created."));
    }
  }

  static async newBlueprint() {
    if (!await this.#confirmDiscardIfNeeded()) return;
    this.#resetDraft();
    await this.#renderFresh({ preserveScroll: false });
  }

  static async selectBlueprint(_event, target) {
    const id = target?.dataset?.blueprintId;
    if (!id || id === this.selectedBlueprintId) return;
    if (!await this.#confirmDiscardIfNeeded()) return;
    if (this.#loadBlueprint(id)) await this.#renderFresh({ preserveScroll: false });
  }

  async #persistDraft({ notify = true } = {}) {
    const api = getApi();
    if (!api?.blueprints?.save) return null;
    this.#syncDraftFromForm();

    const normalized = createEncounterBlueprint({
      ...this.draft,
      id: this.draft.id,
      metadata: {
        ...this.draft.metadata,
        createdAt: this.draft.metadata?.createdAt
      }
    });
    const validation = api.blueprints.validate(normalized);
    if (!validation.valid) {
      const details = validation.errors.slice(0, 5).map((entry) => `• ${entry.message}`).join("\n");
      ui.notifications.error(`${localize("PF2E_ENCOUNTER_FORGE.Notifications.ValidationFailed", "Encounter blueprint is invalid.")}\n${details}`);
      return null;
    }

    try {
      const saved = await api.blueprints.save(normalized);
      this.draft = clone(normalized);
      this.selectedBlueprintId = normalized.id;
      this.savedSnapshot = JSON.stringify(this.draft);
      await this.#reloadBlueprints();
      if (notify) ui.notifications.info(localize("PF2E_ENCOUNTER_FORGE.Notifications.Saved", "Encounter saved."));
      return { saved, blueprint: normalized };
    } catch (error) {
      console.error(`${MODULE_ID} | Saving encounter blueprint failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.SaveFailed", "Encounter could not be saved."));
      return null;
    }
  }


  static async openDirector() {
    await getApi()?.ui?.openDirector?.();
  }

  static async deployEncounter() {
    const persisted = await this.#persistDraft({ notify: false });
    if (!persisted) return;
    if (!(persisted.blueprint.participants ?? []).length) {
      ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.DeploymentNeedsParticipants", "Add at least one participant before deployment."));
      return;
    }
    if ((persisted.blueprint.participants ?? []).some((participant) => participant.source?.type === "example")) {
      ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.ExampleNeedsParticipants", "Replace the example placeholder opponents with real Encounter participants before deployment."));
      return;
    }

    const api = getApi();
    const blueprintUuid = persisted.saved?.document?.uuid ?? api?.blueprints?.get?.(persisted.blueprint.id)?.document?.uuid ?? null;

    // Refresh the parent before opening the modal-like child. Rendering the parent after
    // the deployment dialog would put the Encounter Forge back above its own child.
    await this.#renderFresh();

    const app = this.#trackChild(new EncounterDeploymentDialogApp({
      blueprint: clone(persisted.blueprint),
      blueprintUuid,
      onDeploy: async (options) => {
        const interactive = options.placeTokens && options.placementMode === "interactive";
        const forgeElement = interactive && this.element instanceof HTMLElement ? this.element : null;
        const previousHidden = forgeElement?.hidden ?? false;
        const previousAriaHidden = forgeElement?.getAttribute?.("aria-hidden") ?? null;
        if (forgeElement) {
          // Native Token placement needs the canvas completely unobstructed. Hide the
          // full Forge window, including its title bar, for the duration of placement.
          forgeElement.hidden = true;
          forgeElement.setAttribute("aria-hidden", "true");
        }
        try {
          const result = await api?.deployment?.deploy?.(persisted.blueprint, { ...options, blueprintUuid });
          if (!result) return false;
          const actorCount = result.actors?.length ?? 0;
          const tokenCount = result.tokens?.length ?? 0;
          const folderName = result.folder?.name ?? localize("PF2E_ENCOUNTER_FORGE.Deployment.ActorRoot", "Actor Directory root");
          const combatPrepared = Boolean(result.combat);
          ui.notifications.info(game.i18n.format?.("PF2E_ENCOUNTER_FORGE.Notifications.DeploymentComplete", {
            actors: actorCount,
            tokens: tokenCount,
            folder: folderName,
            combat: combatPrepared ? localize("PF2E_ENCOUNTER_FORGE.Deployment.CombatYes", "Combat prepared") : localize("PF2E_ENCOUNTER_FORGE.Deployment.CombatNo", "no Combat")
          }) ?? `${actorCount} Actors and ${tokenCount} Tokens prepared in ${folderName}.`);
          if (!interactive && options.viewScene && result.scene?.view) await result.scene.view();
          return result;
        } finally {
          if (forgeElement) {
            forgeElement.hidden = previousHidden;
            if (previousAriaHidden === null) forgeElement.removeAttribute("aria-hidden");
            else forgeElement.setAttribute("aria-hidden", previousAriaHidden);
            this.bringToFront?.();
          }
        }
      }
    }));
    await app.render({ force: true });
    app.bringToFront?.();
  }

  static async saveBlueprint() {
    const persisted = await this.#persistDraft({ notify: true });
    if (!persisted) return;
    await this.#renderFresh();
  }

  static async duplicateBlueprint() {
    const api = getApi();
    if (!api?.blueprints?.save) return;
    this.#syncDraftFromForm();
    const suffix = localize("PF2E_ENCOUNTER_FORGE.Editor.CopySuffix", "Copy");
    const copy = createEncounterBlueprint({
      ...this.draft,
      id: undefined,
      name: `${this.draft.name || localize("PF2E_ENCOUNTER_FORGE.Editor.Untitled", "Untitled Encounter")} (${suffix})`,
      metadata: { sourceModule: MODULE_ID, notes: {} }
    });
    try {
      await api.blueprints.save(copy);
      await this.#reloadBlueprints();
      this.#loadBlueprint(copy.id);
      ui.notifications.info(localize("PF2E_ENCOUNTER_FORGE.Notifications.Duplicated", "Encounter duplicated."));
      await this.#renderFresh({ preserveScroll: false });
    } catch (error) {
      console.error(`${MODULE_ID} | Duplicating encounter blueprint failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.SaveFailed", "Encounter could not be saved."));
    }
  }

  static async deleteBlueprint(_event, target) {
    const blueprintId = target?.dataset?.blueprintId || this.selectedBlueprintId;
    if (!blueprintId) return;
    const confirmed = await confirmDialog(
      "PF2E_ENCOUNTER_FORGE.Dialogs.DeleteTitle",
      "PF2E_ENCOUNTER_FORGE.Dialogs.DeletePrompt"
    );
    if (!confirmed) return;

    const api = getApi();
    const deletingSelected = blueprintId === this.selectedBlueprintId;
    const previousSelected = this.selectedBlueprintId;
    try {
      await api?.blueprints?.delete?.(blueprintId);
      await this.#reloadBlueprints();
      if (deletingSelected) {
        if (this.blueprints.length > 0) this.#loadBlueprint(this.blueprints[0].id);
        else this.#resetDraft();
      } else if (previousSelected) {
        this.#loadBlueprint(previousSelected);
      }
      ui.notifications.info(localize("PF2E_ENCOUNTER_FORGE.Notifications.Deleted", "Encounter deleted."));
      await this.#renderFresh({ preserveScroll: !deletingSelected });
    } catch (error) {
      console.error(`${MODULE_ID} | Deleting encounter blueprint failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.DeleteFailed", "Encounter could not be deleted."));
    }
  }

  static async refreshBlueprints() {
    if (!await this.#confirmDiscardIfNeeded()) return;
    const selected = this.selectedBlueprintId;
    await this.#reloadBlueprints();
    if (selected && this.#loadBlueprint(selected)) {
      // keep selected encounter after refresh
    } else if (this.blueprints.length > 0) this.#loadBlueprint(this.blueprints[0].id);
    else this.#resetDraft();
    await this.#renderFresh();
  }
}
