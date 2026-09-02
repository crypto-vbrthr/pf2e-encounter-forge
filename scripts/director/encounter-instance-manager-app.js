import { MODULE_ID } from "../constants.js";
import { EncounterDeploymentDialogApp } from "../ui/deployment-dialog-app.js";

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

function dateTime(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(game.i18n?.lang ?? undefined, {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  } catch { return String(value); }
}

function timestamp(instance) {
  return String(instance?.metadata?.modifiedAt ?? instance?.metadata?.createdAt ?? "");
}

function blueprintEntry(api, instance) {
  const reference = instance?.blueprint ?? {};
  return api?.blueprints?.get?.(reference.uuid ?? reference.id)
    ?? api?.blueprints?.get?.(reference.id)
    ?? null;
}

export class EncounterInstanceManagerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pf2e-encounter-forge-instance-manager",
    classes: ["pf2e-encounter-forge", "encounter-instance-manager-app"],
    window: {
      title: "PF2E_ENCOUNTER_FORGE.InstanceManager.WindowTitle",
      icon: "fa-solid fa-box-archive",
      resizable: true
    },
    position: { width: 760, height: 680 },
    actions: {
      refresh: EncounterInstanceManagerApp.refresh,
      openInstance: EncounterInstanceManagerApp.openInstance,
      createInstance: EncounterInstanceManagerApp.createInstance,
      deleteInstance: EncounterInstanceManagerApp.deleteInstance,
      purgeOrphans: EncounterInstanceManagerApp.purgeOrphans,
      purgeCompleted: EncounterInstanceManagerApp.purgeCompleted
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/encounter-instance-manager-app.hbs` }
  };

  constructor({ selectedInstanceId = null, ...options } = {}) {
    super(options);
    this.selectedInstanceId = selectedInstanceId;
  }

  async setSelectedInstance(instanceId = null) {
    this.selectedInstanceId = instanceId;
    if (this.element) await this.render({ force: true });
    return this;
  }

  #blueprintRows() {
    const api = getApi();
    const instances = api?.instances?.list?.() ?? [];
    const liveCounts = new Map();
    for (const entry of instances) {
      const instance = entry?.data ?? {};
      if (!["prepared", "active", "paused"].includes(instance.status)) continue;
      const blueprintId = String(instance.blueprint?.id ?? "").trim();
      if (blueprintId) liveCounts.set(blueprintId, (liveCounts.get(blueprintId) ?? 0) + 1);
    }
    return (api?.blueprints?.list?.() ?? [])
      .map((entry) => {
        const blueprint = clone(entry?.data ?? {});
        const participantCount = (blueprint.participants ?? []).reduce((sum, participant) => sum + Math.max(1, Number(participant?.quantity) || 1), 0);
        const hasExampleParticipants = (blueprint.participants ?? []).some((participant) => participant?.source?.type === "example");
        return {
          id: String(blueprint.id ?? ""),
          uuid: entry?.document?.uuid ?? null,
          name: String(blueprint.name ?? blueprint.id ?? localize("PF2E_ENCOUNTER_FORGE.Editor.Untitled", "Untitled Encounter")),
          participantCount,
          phaseCount: blueprint.phases?.length ?? 0,
          liveInstanceCount: liveCounts.get(String(blueprint.id ?? "")) ?? 0,
          canCreate: participantCount > 0 && !hasExampleParticipants,
          needsParticipants: participantCount <= 0,
          hasExampleParticipants
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n?.lang));
  }

  #rows() {
    const api = getApi();
    const runtimeStatus = api?.runtime?.status?.() ?? {};
    const rows = (api?.instances?.list?.() ?? []).map((entry) => {
      const instance = clone(entry?.data ?? {});
      const blueprint = blueprintEntry(api, instance);
      const orphaned = !blueprint?.data;
      const status = String(instance.status ?? "prepared");
      const createdAt = instance.metadata?.createdAt ?? null;
      const modifiedAt = instance.metadata?.modifiedAt ?? createdAt;
      const blueprintName = String(blueprint?.data?.name ?? instance.blueprint?.id ?? localize("PF2E_ENCOUNTER_FORGE.InstanceManager.UnknownBlueprint", "Unknown Blueprint"));
      return {
        id: instance.id,
        name: String(instance.name ?? blueprint?.data?.name ?? instance.id),
        status,
        statusLabel: statusLabel(status),
        sceneName: String(instance.deployment?.sceneName ?? "").trim(),
        blueprintName,
        orphaned,
        current: runtimeStatus.activeInstanceId === instance.id || this.selectedInstanceId === instance.id,
        runtimeBound: runtimeStatus.activeInstanceId === instance.id,
        historical: ["completed", "aborted"].includes(status),
        createdAt: dateTime(createdAt),
        modifiedAt: dateTime(modifiedAt),
        sortTimestamp: timestamp(instance),
        documentUuid: entry?.document?.uuid ?? null,
        canOpen: !orphaned
      };
    });

    rows.sort((a, b) => {
      if (a.runtimeBound !== b.runtimeBound) return a.runtimeBound ? -1 : 1;
      if (a.orphaned !== b.orphaned) return a.orphaned ? 1 : -1;
      return b.sortTimestamp.localeCompare(a.sortTimestamp);
    });
    return rows;
  }

  async _prepareContext() {
    const rows = this.#rows();
    const blueprints = this.#blueprintRows();
    const orphanCount = rows.filter((entry) => entry.orphaned).length;
    const completedCount = rows.filter((entry) => entry.status === "completed").length;
    return {
      instances: rows,
      hasInstances: rows.length > 0,
      blueprints,
      hasBlueprints: blueprints.length > 0,
      orphanCount,
      hasOrphans: orphanCount > 0,
      completedCount,
      hasCompleted: completedCount > 0,
      completedSummary: format(
        "PF2E_ENCOUNTER_FORGE.InstanceManager.CompletedCount",
        { count: completedCount },
        `${completedCount} completed instance(s)`
      ),
      orphanSummary: format(
        "PF2E_ENCOUNTER_FORGE.InstanceManager.OrphanCount",
        { count: orphanCount },
        `${orphanCount} orphaned instance(s)`
      )
    };
  }

  static async refresh() {
    await this.render({ force: true });
  }

  static async openInstance(_event, target) {
    const id = String(target?.dataset?.instanceId ?? "").trim();
    if (!id) return;
    await getApi()?.ui?.openDirector?.(id);
    await this.close();
  }

  static async createInstance(_event, target) {
    const blueprintId = String(target?.dataset?.blueprintId ?? "").trim();
    if (!blueprintId) return;
    const api = getApi();
    const entry = api?.blueprints?.get?.(blueprintId);
    const blueprint = clone(entry?.data ?? null);
    if (!blueprint) {
      ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.BlueprintMissing", "Encounter Blueprint is no longer available."));
      await this.render({ force: true });
      return;
    }
    if (!(blueprint.participants ?? []).length) {
      ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.DeploymentNeedsParticipants", "Add at least one participant before deployment."));
      return;
    }
    if ((blueprint.participants ?? []).some((participant) => participant?.source?.type === "example")) {
      ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.ExampleNeedsParticipants", "Replace the example placeholder opponents with real Encounter participants before deployment."));
      return;
    }

    const blueprintUuid = entry?.document?.uuid ?? null;
    const deploymentApp = new EncounterDeploymentDialogApp({
      blueprint,
      blueprintUuid,
      onDeploy: async (options) => {
        const interactive = options.placeTokens && options.placementMode === "interactive";
        const managerElement = interactive && this.element instanceof HTMLElement ? this.element : null;
        const previousHidden = managerElement?.hidden ?? false;
        const previousAriaHidden = managerElement?.getAttribute?.("aria-hidden") ?? null;
        if (managerElement) {
          managerElement.hidden = true;
          managerElement.setAttribute("aria-hidden", "true");
        }
        try {
          const result = await api?.deployment?.deploy?.(blueprint, { ...options, blueprintUuid });
          if (!result) return false;
          if (!interactive && options.viewScene && result.scene?.view) await result.scene.view();
          ui.notifications.info(format(
            "PF2E_ENCOUNTER_FORGE.Notifications.InstancePreparedFromBlueprint",
            { name: blueprint.name ?? blueprint.id },
            `Encounter Instance prepared from '${blueprint.name ?? blueprint.id}'.`
          ));
          await this.close();
          await api?.ui?.openDirector?.(result.instance?.id ?? null);
          return result;
        } finally {
          if (managerElement) {
            managerElement.hidden = previousHidden;
            if (previousAriaHidden === null) managerElement.removeAttribute("aria-hidden");
            else managerElement.setAttribute("aria-hidden", previousAriaHidden);
          }
        }
      }
    });
    await deploymentApp.render({ force: true });
    deploymentApp.bringToFront?.();
  }

  async #confirm({ title, prompt } = {}) {
    const DialogV2 = foundry.applications?.api?.DialogV2;
    if (DialogV2?.confirm) {
      return DialogV2.confirm({
        window: { title },
        content: `<p>${prompt}</p>`,
        modal: true,
        rejectClose: false
      });
    }
    return globalThis.confirm?.(prompt) ?? false;
  }

  async #deleteById(id) {
    const api = getApi();
    if (!id || !api) return false;
    const runtimeStatus = api.runtime?.status?.() ?? {};
    if (runtimeStatus.activeInstanceId === id) await api.runtime?.stop?.();
    return api.instances?.delete?.(id) ?? false;
  }

  static async deleteInstance(_event, target) {
    const id = String(target?.dataset?.instanceId ?? "").trim();
    if (!id) return;
    const entry = getApi()?.instances?.get?.(id);
    if (!entry?.data) {
      await this.render({ force: true });
      return;
    }
    const name = String(entry.data.name ?? entry.data.id ?? id);
    const confirmed = await this.#confirm({
      title: localize("PF2E_ENCOUNTER_FORGE.InstanceManager.DeleteTitle", "Delete Encounter Instance"),
      prompt: format(
        "PF2E_ENCOUNTER_FORGE.InstanceManager.DeletePrompt",
        { name },
        `Delete Encounter Instance '${name}'? This removes only the stored Runtime Instance; deployed Actors and Tokens are not deleted.`
      )
    });
    if (!confirmed) return;
    await this.#deleteById(id);
    ui.notifications.info(localize("PF2E_ENCOUNTER_FORGE.Notifications.InstanceDeleted", "Encounter Instance deleted."));
    await this.render({ force: true });
  }

  static async purgeCompleted() {
    const rows = this.#rows().filter((entry) => entry.status === "completed");
    if (!rows.length) return;
    const confirmed = await this.#confirm({
      title: localize("PF2E_ENCOUNTER_FORGE.InstanceManager.PurgeCompletedTitle", "Delete Completed Encounters"),
      prompt: format(
        "PF2E_ENCOUNTER_FORGE.InstanceManager.PurgeCompletedPrompt",
        { count: rows.length },
        `Delete all ${rows.length} completed Encounter Instance(s)? Deployed Actors and Tokens are not deleted.`
      )
    });
    if (!confirmed) return;
    let deleted = 0;
    for (const row of rows) if (await this.#deleteById(row.id)) deleted += 1;
    ui.notifications.info(format(
      "PF2E_ENCOUNTER_FORGE.Notifications.CompletedInstancesDeleted",
      { count: deleted },
      `${deleted} completed Encounter Instance(s) deleted.`
    ));
    await this.render({ force: true });
  }

  static async purgeOrphans() {
    const rows = this.#rows().filter((entry) => entry.orphaned);
    if (!rows.length) return;
    const confirmed = await this.#confirm({
      title: localize("PF2E_ENCOUNTER_FORGE.InstanceManager.PurgeOrphansTitle", "Delete Orphaned Instances"),
      prompt: format(
        "PF2E_ENCOUNTER_FORGE.InstanceManager.PurgeOrphansPrompt",
        { count: rows.length },
        `Delete ${rows.length} Encounter Instance(s) whose Blueprint no longer exists? Deployed Actors and Tokens are not deleted.`
      )
    });
    if (!confirmed) return;
    let deleted = 0;
    for (const row of rows) if (await this.#deleteById(row.id)) deleted += 1;
    ui.notifications.info(format(
      "PF2E_ENCOUNTER_FORGE.Notifications.OrphanInstancesDeleted",
      { count: deleted },
      `${deleted} orphaned Encounter Instance(s) deleted.`
    ));
    await this.render({ force: true });
  }
}
