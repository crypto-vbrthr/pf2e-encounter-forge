import { ACTOR_MODES, MODULE_ID } from "../constants.js";
import { ActorFolderService } from "../deployment/folder-service.js";
import { collectionContents } from "../utils/data.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localize(key, fallback = key) {
  try {
    const value = game.i18n.localize(key);
    return value === key ? fallback : value;
  } catch {
    return fallback;
  }
}

function sceneRows() {
  const scenes = collectionContents(game.scenes);
  const activeId = globalThis.canvas?.scene?.id ?? game.scenes?.active?.id ?? null;
  return scenes
    .map((scene) => ({ id: scene.id, uuid: scene.uuid ?? `Scene.${scene.id}`, name: scene.name ?? scene.id, active: scene.id === activeId }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, game.i18n?.lang));
}

export class EncounterDeploymentDialogApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pf2e-encounter-forge-deployment-dialog",
    classes: ["pf2e-encounter-forge", "encounter-deployment-dialog"],
    tag: "form",
    window: {
      title: "PF2E_ENCOUNTER_FORGE.Deployment.Title",
      icon: "fa-solid fa-people-arrows",
      resizable: true
    },
    position: { width: 620, height: 610 },
    actions: {
      cancel: EncounterDeploymentDialogApp.cancel,
      deploy: EncounterDeploymentDialogApp.deploy
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/deployment-dialog-app.hbs` }
  };

  constructor({ blueprint, blueprintUuid = null, onDeploy = null, ...options } = {}) {
    super(options);
    this.blueprint = blueprint;
    this.blueprintUuid = blueprintUuid;
    this.onDeploy = onDeploy;
    this.deploying = false;
  }

  async _prepareContext() {
    const scenes = sceneRows();
    const active = scenes.find((scene) => scene.active) ?? scenes[0] ?? null;
    const folders = new ActorFolderService().options();
    const templateCount = this.blueprint?.participants?.length ?? 0;
    const participantCount = (this.blueprint?.participants ?? []).reduce((sum, participant) => sum + Math.max(1, Number(participant.quantity) || 1), 0);

    return {
      blueprint: this.blueprint,
      scenes: scenes.map((scene) => ({ ...scene, selected: scene.uuid === active?.uuid })),
      hasScenes: scenes.length > 0,
      folders,
      templateCount,
      participantCount,
      defaultSubfolderName: this.blueprint?.name ?? localize("PF2E_ENCOUNTER_FORGE.Editor.Untitled", "Untitled Encounter"),
      actorModes: ACTOR_MODES.map((value) => ({
        value,
        label: localize(`PF2E_ENCOUNTER_FORGE.Deployment.ActorMode.${value === "per-type" ? "perType" : "perParticipant"}`, value),
        selected: value === "per-type"
      })),
      deploying: this.deploying
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;
    const checkbox = root.querySelector('[name="createSubfolder"]');
    const nameInput = root.querySelector('[name="subfolderName"]');
    const actorMode = root.querySelector('[name="actorMode"]');
    const summary = root.querySelector("[data-deployment-actor-count]");
    const update = () => {
      if (nameInput) nameInput.disabled = !checkbox?.checked;
      if (summary) summary.textContent = String(actorMode?.value === "per-participant"
        ? (context.participantCount ?? 0)
        : (context.templateCount ?? 0));
    };
    checkbox?.addEventListener("change", update);
    actorMode?.addEventListener("change", update);
    update();
  }

  static async cancel() {
    await this.close();
  }

  static async deploy() {
    if (this.deploying) return;
    const root = this.element;
    if (!(root instanceof HTMLElement)) return;
    const read = (name) => root.querySelector(`[name="${name}"]`);
    const createSubfolder = Boolean(read("createSubfolder")?.checked);
    const options = {
      blueprintUuid: this.blueprintUuid,
      sceneUuid: String(read("sceneUuid")?.value ?? "").trim() || null,
      actorFolderId: String(read("actorFolderId")?.value ?? "").trim() || null,
      createSubfolder,
      subfolderName: createSubfolder ? String(read("subfolderName")?.value ?? "").trim() || this.blueprint?.name : null,
      actorMode: String(read("actorMode")?.value ?? "per-type")
    };

    this.deploying = true;
    for (const button of root.querySelectorAll("button, input, select")) button.disabled = true;
    try {
      const result = await this.onDeploy?.(options);
      if (result !== false) await this.close();
    } catch (error) {
      console.error(`${MODULE_ID} | Encounter deployment failed.`, error);
      ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.DeploymentFailed", "Encounter deployment failed."));
      this.deploying = false;
      await this.render({ force: true });
    }
  }
}
