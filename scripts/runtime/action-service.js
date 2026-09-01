import { MODULE_ID } from "../constants.js";
import { RuntimeService } from "./base-service.js";

function clone(value) {
  if (value == null) return value;
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return structuredClone(value);
}

function actionTarget(action = {}) {
  return {
    mode: String(action.targetMode ?? action.target?.mode ?? "participant"),
    id: String(action.targetId ?? action.target?.id ?? "").trim() || null
  };
}


function actionTiming(action = {}) {
  const mode = String(action?.timing?.mode ?? "immediate");
  const amount = Math.max(1, Math.trunc(Number(action?.timing?.amount ?? 1) || 1));
  return { mode, amount };
}

function integrationUnavailable(id) {
  const error = new Error(`Encounter Forge integration '${id}' is unavailable or disabled.`);
  error.code = "ENCOUNTER_INTEGRATION_UNAVAILABLE";
  error.integrationId = id;
  return error;
}

export class ActionService extends RuntimeService {
  constructor({ bus = null, integrations = null, participants = null, getInstance = () => null, handlers = {} } = {}) {
    super("actions");
    this.bus = bus;
    this.integrations = integrations;
    this.participants = participants;
    this.getInstance = getInstance;
    this.handlers = handlers;
  }

  async #integrationApi(id) {
    const api = this.integrations?.api?.(id) ?? null;
    if (!api) throw integrationUnavailable(id);
    return api;
  }

  async #targets(action) {
    const spec = actionTarget(action);
    const actors = await this.participants?.resolveActors?.(spec);
    if (!actors?.length) {
      const error = new Error(`Encounter action '${action?.name ?? action?.id ?? action?.type ?? "?"}' resolved no Actor targets.`);
      error.code = "ENCOUNTER_ACTION_NO_TARGETS";
      error.target = spec;
      throw error;
    }
    return actors;
  }

  async #effectApply(action, context) {
    const api = await this.#integrationApi("effectForge");
    if (!action.definition) throw new Error("Effect action requires an Effect Definition.");
    const targets = await this.#targets(action);
    const validation = api.effects?.validate?.(action.definition);
    if (validation?.valid === false) throw new Error(validation.errors?.map?.((entry) => entry.message).join("; ") || "Effect Definition is invalid.");
    const result = await api.effects.apply(action.definition, targets, {
      context: { encounter: clone(context ?? {}), actionId: action.id ?? null }
    });
    return { handled: true, integration: "effectForge", targetCount: targets.length, createdCount: result?.length ?? 0 };
  }

  async #auraSet(action) {
    const api = await this.#integrationApi("auraForge");
    const targets = await this.#targets(action);
    const enabled = action.enabled !== false;
    const definition = action.definition ?? null;
    const definitionId = String(definition?.id ?? action.definitionId ?? "").trim();
    if (!definitionId) throw new Error("Aura action requires an Aura Definition or definitionId.");

    const assignments = [];
    for (const actor of targets) {
      let instance = api.instances?.list?.(actor)?.find?.((entry) => String(entry?.definitionId ?? "") === definitionId) ?? null;
      if (enabled) {
        if (instance?.id) {
          await api.instances.setEnabled(actor, instance.id, true);
        } else {
          if (!definition) throw new Error("Enabling an Aura requires the stored Aura Definition.");
          instance = await api.instances.assignDefinition(actor, definition, { enabled: true });
          if (instance?.id) await api.instances.setEnabled(actor, instance.id, true);
        }
      } else if (instance?.id) {
        await api.instances.setEnabled(actor, instance.id, false);
      }
      assignments.push({ actorUuid: actor?.uuid ?? null, instanceId: instance?.id ?? null, enabled });
    }
    return { handled: true, integration: "auraForge", targetCount: targets.length, enabled, assignments };
  }

  async #afflictionApply(action, context) {
    const api = await this.#integrationApi("afflictionForge");
    if (!action.definition) throw new Error("Affliction action requires an Affliction Definition.");
    const targets = await this.#targets(action);
    const result = await api.engine.applyDefinition(action.definition, targets, {
      source: { moduleId: MODULE_ID, encounterInstanceId: this.getInstance()?.id ?? null, actionId: action.id ?? null },
      encounterContext: clone(context ?? {})
    });
    return { handled: true, integration: "afflictionForge", targetCount: targets.length, resultCount: Array.isArray(result) ? result.length : (result ? 1 : 0) };
  }

  async #lootCreate(action) {
    const api = await this.#integrationApi("lootForge");
    const stored = action.loot?.loot ?? action.loot?.result ?? null;
    const config = clone(action.loot?.config ?? {});
    const loot = stored ? clone(stored) : await api.generateLoot(config);
    const actorName = String(action.lootActorName ?? config?.newLootActorName ?? action.name ?? "Encounter Loot").trim() || "Encounter Loot";
    const actor = await api.createLootActorWithLoot(actorName, loot);
    const instance = this.getInstance();
    const folder = instance?.deployment?.actorFolderId ?? null;
    if (actor?.update) {
      const changes = {
        [`flags.${MODULE_ID}.encounter`]: {
          instanceId: instance?.id ?? null,
          actionId: action.id ?? null,
          kind: "loot"
        }
      };
      if (folder) changes.folder = folder;
      await actor.update(changes);
    }
    if (instance) {
      instance.runtimeVariables ??= {};
      instance.runtimeVariables.integrationActions ??= {};
      const state = instance.runtimeVariables.integrationActions[action.id] ??= {};
      state.lootActorUuids ??= [];
      if (actor?.uuid) state.lootActorUuids.push(actor.uuid);
    }
    return { handled: true, integration: "lootForge", actorUuid: actor?.uuid ?? null, actorName: actor?.name ?? actorName };
  }

  async execute(action, context = {}) {
    const type = String(action?.type ?? action?.kind ?? "").trim();
    if (!type) return { handled: false, reason: "missing-type" };

    const timing = actionTiming(action);
    if (!context?.scheduledExecution && timing.mode !== "immediate") {
      const scheduled = await this.handlers.scheduleAction?.(action, { ...context, timing });
      return scheduled ?? { handled: false, reason: "schedule-unavailable", type };
    }

    try {
      let result;
      if (type === "phase.transition") result = await this.handlers.phaseTransition?.(action.phaseId ?? action.targetPhaseId ?? action.target, context);
      else if (type === "objective.progress") result = await this.handlers.objectiveProgress?.(action.objectiveId ?? action.target, Number(action.amount ?? 1), context);
      else if (type === "director.message" || type === "chat.note") result = await this.handlers.directorMessage?.(String(action.message ?? action.text ?? action.label ?? ""), context);
      else if (type === "effect.apply") result = await this.#effectApply(action, context);
      else if (type === "aura.setEnabled") result = await this.#auraSet(action, context);
      else if (type === "affliction.apply") result = await this.#afflictionApply(action, context);
      else if (type === "loot.createActor") result = await this.#lootCreate(action, context);
      else return { handled: false, reason: "unsupported", type };

      const normalized = result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "handled")
        ? result
        : { handled: true, result };
      await this.bus?.emit?.("action.executed", { action: clone(action), type, result: clone(normalized), context: clone(context) });
      return normalized;
    } catch (error) {
      await this.bus?.emit?.("action.failed", {
        action: clone(action),
        type,
        error: { message: error?.message ?? String(error), code: error?.code ?? null },
        context: clone(context)
      });
      return { handled: false, reason: "error", type, error };
    }
  }
}
