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

function blueprintSceneBinding(blueprint = {}) {
  const binding = blueprint?.sceneBinding;
  const id = String(binding?.sceneId ?? "").trim();
  if (!id) return null;
  return {
    sceneId: id,
    sceneUuid: String(binding?.sceneUuid ?? `Scene.${id}`).trim() || `Scene.${id}`,
    sceneName: String(binding?.sceneName ?? id).trim() || id
  };
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
    const binding = blueprintSceneBinding(this.blueprint);
    const boundScene = binding ? scenes.find((scene) => scene.id === binding.sceneId) ?? null : null;
    const active = boundScene ?? scenes.find((scene) => scene.active) ?? scenes[0] ?? null;
    const displayScenes = binding && !boundScene
      ? [{ id: binding.sceneId, uuid: binding.sceneUuid, name: binding.sceneName, active: false, missing: true }, ...scenes]
      : scenes;
    const folders = new ActorFolderService().options();
    const templateCount = this.blueprint?.participants?.length ?? 0;
    const participantCount = (this.blueprint?.participants ?? []).reduce((sum, participant) => sum + Math.max(1, Number(participant.quantity) || 1), 0);

    return {
      blueprint: this.blueprint,
      scenes: displayScenes.map((scene) => ({ ...scene, selected: scene.uuid === active?.uuid || Boolean(binding && scene.id === binding.sceneId) })),
      hasScenes: scenes.length > 0,
      sceneLocked: Boolean(binding),
      bindingSceneMissing: Boolean(binding && !boundScene),
      bindingSceneName: binding?.sceneName ?? null,
      deploymentBlocked: Boolean(binding && !boundScene),
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
    const sceneSelect = root.querySelector('[name="sceneUuid"]');
    const placeTokens = root.querySelector('[name="placeTokens"]');
    const placementMode = root.querySelector('[name="placementMode"]');
    const createCombat = root.querySelector('[name="createCombat"]');
    const includePlayerTokens = root.querySelector('[name="includePlayerTokens"]');
    const viewScene = root.querySelector('[name="viewScene"]');
    const summary = root.querySelector("[data-deployment-actor-count]");
    const tokenSummary = root.querySelector("[data-deployment-token-count]");
    const sceneDisabledNote = root.querySelector("[data-scene-disabled-note]");
    const interactiveNote = root.querySelector("[data-interactive-placement-note]");
    const update = () => {
      if (nameInput) nameInput.disabled = !checkbox?.checked;
      if (summary) summary.textContent = String(actorMode?.value === "per-participant"
        ? (context.participantCount ?? 0)
        : (context.templateCount ?? 0));

      const hasScene = Boolean(sceneSelect?.value);
      const tokensEnabled = hasScene && Boolean(placeTokens?.checked);
      const interactive = tokensEnabled && placementMode?.value === "interactive";
      if (placeTokens) placeTokens.disabled = !hasScene;
      if (placementMode) placementMode.disabled = !tokensEnabled;
      if (createCombat) createCombat.disabled = !tokensEnabled;
      if (includePlayerTokens) includePlayerTokens.disabled = !tokensEnabled || !createCombat?.checked;
      if (viewScene) {
        if (interactive) viewScene.checked = true;
        viewScene.disabled = !hasScene || interactive;
      }
      if (sceneDisabledNote instanceof HTMLElement) sceneDisabledNote.hidden = hasScene;
      if (interactiveNote instanceof HTMLElement) interactiveNote.hidden = !interactive;
      if (tokenSummary) tokenSummary.textContent = String(tokensEnabled ? (context.participantCount ?? 0) : 0);
    };
    checkbox?.addEventListener("change", update);
    actorMode?.addEventListener("change", update);
    sceneSelect?.addEventListener("change", update);
    placeTokens?.addEventListener("change", update);
    placementMode?.addEventListener("change", update);
    createCombat?.addEventListener("change", update);
    update();
  }

  static async cancel() {
    await this.close();
  }

  static async deploy() {
    if (this.deploying) return;
    const binding = blueprintSceneBinding(this.blueprint);
    if (binding && !collectionContents(game.scenes).some((scene) => String(scene?.id ?? "") === binding.sceneId)) {
      ui.notifications.warn(localize("PF2E_ENCOUNTER_FORGE.Notifications.BoundSceneMissing", "The Scene bound to this Encounter Blueprint no longer exists. Rebind the Blueprint before deployment."));
      return;
    }
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
      actorMode: String(read("actorMode")?.value ?? "per-type"),
      placeTokens: Boolean(read("sceneUuid")?.value) && Boolean(read("placeTokens")?.checked),
      placementMode: String(read("placementMode")?.value ?? "interactive"),
      createCombat: Boolean(read("sceneUuid")?.value) && Boolean(read("placeTokens")?.checked) && Boolean(read("createCombat")?.checked),
      includePlayerTokens: Boolean(read("includePlayerTokens")?.checked),
      viewScene: Boolean(read("sceneUuid")?.value) && Boolean(read("viewScene")?.checked)
    };

    const interactive = options.placeTokens && options.placementMode === "interactive";
    this.deploying = true;
    for (const button of root.querySelectorAll("button, input, select")) button.disabled = true;
    if (interactive) await this.close({ animate: false });
    try {
      const result = await this.onDeploy?.(options);
      if (result !== false && !interactive) await this.close();
    } catch (error) {
      if (error?.code === "SCENE_PLACEMENT_CANCELLED") {
        console.info(`${MODULE_ID} | Interactive Encounter placement cancelled by GM.`);
        ui.notifications.info(localize("PF2E_ENCOUNTER_FORGE.Notifications.PlacementCancelled", "Interactive placement cancelled. Deployment changes were rolled back."));
      } else {
        console.error(`${MODULE_ID} | Encounter deployment failed.`, error);
        ui.notifications.error(localize("PF2E_ENCOUNTER_FORGE.Notifications.DeploymentFailed", "Encounter deployment failed."));
      }
      this.deploying = false;
      if (interactive) await this.render({ force: true });
      else await this.render({ force: true });
    }
  }
}
