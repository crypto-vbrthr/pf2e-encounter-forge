import {
  API_VERSION, BLUEPRINT_SCHEMA_VERSION, INSTANCE_SCHEMA_VERSION, MODULE_ID, MODULE_VERSION
} from "../constants.js";
import {
  assertEncounterBlueprint, assertEncounterInstance, createEncounterBlueprint, createEncounterInstance,
  validateEncounterBlueprint, validateEncounterInstance
} from "../model/index.js";
import { ActorFolderService } from "../deployment/folder-service.js";
import { openEncounterForge } from "../ui/encounter-forge-ui.js";
import { findPreferredEncounterInstanceId, openEncounterDirector } from "../director/encounter-director-ui.js";
import { openEncounterInstanceManager } from "../director/encounter-instance-manager-ui.js";
import { detectCurrentParty } from "../engine/party-analyzer.js";
import { analyzeEncounterBudget, targetBudgetForThreat, xpForCreatureLevel } from "../engine/encounter-budget.js";
import { analyzeEncounterFlow, FLOW_ACTION_TIMING_MODES, FLOW_ACTION_TYPES, FLOW_BOOLEAN_CONDITION_FIELDS, FLOW_CONDITION_FIELDS, FLOW_CONDITION_MODES, FLOW_EVENT_TYPES, FLOW_GROUP_MATCH_MODES, FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS, FLOW_OPERATORS, FLOW_PARTICIPANT_CONTEXT_FIELDS, FLOW_REGION_CONDITION_FIELDS, FLOW_REGION_EVENT_TYPES, FLOW_REGION_TOKEN_SCOPES, FLOW_TARGET_MODES } from "../engine/encounter-flow.js";
import { isIntegrationEnabled, setIntegrationEnabled } from "../integrations/integration-settings.js";
import { createExampleEncounterBlueprint, isExampleEncounterBlueprint } from "../examples/index.js";

export function createPublicApi({ integrations, participantSources, blueprintRepository, instanceRepository, deployment, runtime } = {}) {
  const setBlueprintArchived = async (idOrUuid, archived) => {
    const current = blueprintRepository.get(idOrUuid);
    if (!current?.data) return null;
    const normalized = createEncounterBlueprint({
      ...current.data,
      id: current.data.id,
      metadata: {
        ...current.data.metadata,
        createdAt: current.data.metadata?.createdAt,
        archivedAt: archived ? new Date().toISOString() : null
      }
    });
    return blueprintRepository.save(assertEncounterBlueprint(normalized), { create: false });
  };

  const api = Object.freeze({
    version: API_VERSION,
    moduleVersion: MODULE_VERSION,
    schemaVersion: Object.freeze({ blueprint: BLUEPRINT_SCHEMA_VERSION, instance: INSTANCE_SCHEMA_VERSION }),

    blueprints: Object.freeze({
      create: (input = {}) => createEncounterBlueprint(input),
      validate: (value) => validateEncounterBlueprint(value),
      assert: (value) => assertEncounterBlueprint(value),
      list: () => blueprintRepository.list(),
      get: (idOrUuid) => blueprintRepository.get(idOrUuid),
      save: (value, options = {}) => blueprintRepository.save(assertEncounterBlueprint(value), options),
      delete: (idOrUuid) => blueprintRepository.delete(idOrUuid),
      archive: (idOrUuid) => setBlueprintArchived(idOrUuid, true),
      restore: (idOrUuid) => setBlueprintArchived(idOrUuid, false),
      isArchived: (value) => Boolean((value?.data ?? value)?.metadata?.archivedAt),
      ensureFolder: () => blueprintRepository.ensureFolder()
    }),

    instances: Object.freeze({
      create: (blueprint, options = {}) => createEncounterInstance(blueprint, options),
      validate: (value) => validateEncounterInstance(value),
      assert: (value) => assertEncounterInstance(value),
      list: () => instanceRepository.list(),
      get: (idOrUuid) => instanceRepository.get(idOrUuid),
      save: (value, options = {}) => instanceRepository.save(assertEncounterInstance(value), options),
      delete: (idOrUuid) => instanceRepository.delete(idOrUuid),
      ensureFolder: () => instanceRepository.ensureFolder()
    }),

    integrations: Object.freeze({
      list: () => integrations.list(),
      get: (id) => integrations.get(id),
      api: (id) => integrations.api(id),
      status: (id = null) => id ? integrations.status(id) : integrations.statusAll(),
      isEnabled: (id) => isIntegrationEnabled(id),
      setEnabled: (id, enabled) => setIntegrationEnabled(id, enabled),
      register: (descriptor, options = {}) => integrations.register(descriptor, options),
      unregister: (id) => integrations.unregister(id)
    }),

    participantSources: Object.freeze({
      list: () => participantSources.list(),
      get: (type) => participantSources.get(type),
      validate: (source) => participantSources.validate(source),
      preview: (source, context = {}) => participantSources.preview(source, context),
      materialize: (source, context = {}) => participantSources.materialize(source, context),
      register: (type, handler, options = {}) => participantSources.register(type, handler, options),
      unregister: (type) => participantSources.unregister(type)
    }),

    folders: Object.freeze({
      actors: () => new ActorFolderService()
    }),


    deployment: Object.freeze({
      deploy: (blueprint, options = {}) => deployment.deploy(assertEncounterBlueprint(blueprint), options)
    }),

    party: Object.freeze({
      detect: (options = {}) => detectCurrentParty(options)
    }),

    budget: Object.freeze({
      analyze: (options = {}) => analyzeEncounterBudget(options),
      targetForThreat: (threat, partySize = 4) => targetBudgetForThreat(threat, partySize),
      xpForCreatureLevel: (creatureLevel, partyLevel) => xpForCreatureLevel(creatureLevel, partyLevel)
    }),

    flow: Object.freeze({
      analyze: (blueprint) => analyzeEncounterFlow(blueprint),
      events: FLOW_EVENT_TYPES,
      actionTypes: FLOW_ACTION_TYPES,
      actionTimingModes: FLOW_ACTION_TIMING_MODES,
      targetModes: FLOW_TARGET_MODES,
      conditionFields: FLOW_CONDITION_FIELDS,
      participantContextFields: FLOW_PARTICIPANT_CONTEXT_FIELDS,
      groupParticipantContextFields: FLOW_GROUP_PARTICIPANT_CONTEXT_FIELDS,
      booleanConditionFields: FLOW_BOOLEAN_CONDITION_FIELDS,
      conditionModes: FLOW_CONDITION_MODES,
      groupMatchModes: FLOW_GROUP_MATCH_MODES,
      regionEventTypes: FLOW_REGION_EVENT_TYPES,
      regionTokenScopes: FLOW_REGION_TOKEN_SCOPES,
      regionConditionFields: FLOW_REGION_CONDITION_FIELDS,
      operators: FLOW_OPERATORS
    }),

    examples: Object.freeze({
      createBlueprint: (options = {}) => createExampleEncounterBlueprint(options),
      isExample: (blueprint) => isExampleEncounterBlueprint(blueprint)
    }),

    ui: Object.freeze({
      open: () => openEncounterForge(),
      openDirector: (instanceOrId = null) => openEncounterDirector(instanceOrId),
      openInstanceManager: (options = {}) => openEncounterInstanceManager(options),
      preferredDirectorInstanceId: () => findPreferredEncounterInstanceId()
    }),

    runtime: Object.freeze({
      start: (instanceOrId = null, options = {}) => runtime.start(instanceOrId, options),
      activate: (instanceOrId = null, options = {}) => runtime.activate(instanceOrId, options),
      pause: (options = {}) => runtime.pause(options),
      resume: (options = {}) => runtime.resume(options),
      complete: (options = {}) => runtime.complete(options),
      reopen: (options = {}) => runtime.reopen(options),
      setPhase: (phaseId, options = {}) => runtime.setPhase(phaseId, options),
      adjustObjective: (objectiveId, amount = 1, options = {}) => runtime.adjustObjective(objectiveId, amount, options),
      setObjectiveState: (objectiveId, state, options = {}) => runtime.setObjectiveState(objectiveId, state, options),
      resolveDecision: (decisionId, resolution, options = {}) => runtime.resolveDecision(decisionId, resolution, options),
      executeAction: (actionOrId, options = {}) => runtime.executeAction(actionOrId, options),
      cancelScheduledAction: (scheduleId, options = {}) => runtime.cancelScheduledAction(scheduleId, options),
      executeScheduledActionNow: (scheduleId, options = {}) => runtime.executeScheduledActionNow(scheduleId, options),
      inspect: (instanceOrId = null) => runtime.inspect(instanceOrId),
      stop: (options = {}) => runtime.stop(options),
      restore: (options = {}) => runtime.restore(options),
      status: () => runtime.status(),
      debug: () => runtime.debugSnapshot(),
      on: (type, listener) => runtime.bus.on(type, listener),
      off: (type, listener) => runtime.bus.off(type, listener)
    })
  });

  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (module) module.api = api;
  return api;
}
