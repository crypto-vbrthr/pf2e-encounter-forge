import { MODULE_ID } from "../constants.js";
import { EncounterForgeError } from "../utils/errors.js";

function localize(key, fallback = key) {
  try {
    const value = globalThis.game?.i18n?.localize?.(key);
    return value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
}

function format(key, data, fallback) {
  try {
    const value = globalThis.game?.i18n?.format?.(key, data);
    return value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class PlacementHud {
  constructor({ total = 0 } = {}) {
    this.total = total;
    this.element = null;
  }

  show() {
    const doc = globalThis.document;
    if (!doc?.body) return;
    this.destroy();
    const element = doc.createElement("aside");
    element.id = `${MODULE_ID}-placement-hud`;
    element.className = "encounter-placement-hud";
    element.innerHTML = `
      <div class="encounter-placement-hud__heading">
        <i class="fa-solid fa-location-crosshairs"></i>
        <div>
          <strong>${localize("PF2E_ENCOUNTER_FORGE.Placement.Title", "Encounter placement")}</strong>
          <small data-placement-progress></small>
        </div>
      </div>
      <div class="encounter-placement-hud__current" data-placement-current></div>
      <div class="encounter-placement-hud__instructions">
        <span><i class="fa-solid fa-computer-mouse"></i> ${localize("PF2E_ENCOUNTER_FORGE.Placement.LeftClick", "Left-click to place")}</span>
        <span><i class="fa-solid fa-arrows-rotate"></i> ${localize("PF2E_ENCOUNTER_FORGE.Placement.Wheel", "Mouse wheel rotates")}</span>
        <span><kbd>Esc</kbd> ${localize("PF2E_ENCOUNTER_FORGE.Placement.Cancel", "Cancel deployment")}</span>
      </div>
    `;
    doc.body.appendChild(element);
    this.element = element;
  }

  update({ index = 0, label = "" } = {}) {
    if (!this.element) return;
    const humanIndex = Math.min(this.total, Math.max(1, Number(index) + 1));
    const progress = this.element.querySelector("[data-placement-progress]");
    const current = this.element.querySelector("[data-placement-current]");
    if (progress) progress.textContent = format(
      "PF2E_ENCOUNTER_FORGE.Placement.Progress",
      { current: humanIndex, total: this.total },
      `${humanIndex} / ${this.total}`
    );
    if (current) current.textContent = label || localize("PF2E_ENCOUNTER_FORGE.Placement.UnknownParticipant", "Encounter participant");
  }

  destroy() {
    this.element?.remove?.();
    this.element = null;
  }
}

export class InteractiveTokenPlacementService {
  constructor({ canvasRef = null, sceneReadyTimeout = 8000 } = {}) {
    this.canvasRef = canvasRef;
    this.sceneReadyTimeout = sceneReadyTimeout;
  }

  #canvas() {
    return typeof this.canvasRef === "function" ? this.canvasRef() : (this.canvasRef ?? globalThis.canvas ?? null);
  }

  async #ensureSceneViewed(scene) {
    let canvas = this.#canvas();
    if (canvas?.scene?.id === scene?.id) return canvas;
    if (typeof scene?.view !== "function") {
      throw new EncounterForgeError("Interactive placement requires the selected Scene to be viewable.", { code: "SCENE_VIEW_UNAVAILABLE" });
    }

    await scene.view();
    const deadline = Date.now() + this.sceneReadyTimeout;
    while (Date.now() < deadline) {
      canvas = this.#canvas();
      if (canvas?.scene?.id === scene.id && canvas?.tokens) return canvas;
      await sleep(50);
    }
    throw new EncounterForgeError("The selected Scene did not become ready for interactive Token placement.", { code: "SCENE_VIEW_TIMEOUT" });
  }

  async place({ scene, sources = [], placements = [] } = {}) {
    if (!scene) throw new EncounterForgeError("Interactive placement requires a Scene.", { code: "SCENE_REQUIRED" });
    if (!sources.length) return [];
    const canvas = await this.#ensureSceneViewed(scene);
    const tokenLayer = canvas?.tokens;
    if (typeof tokenLayer?.placeTokens !== "function") {
      throw new EncounterForgeError("Foundry TokenLayer.placeTokens() is unavailable.", { code: "INTERACTIVE_TOKEN_PLACEMENT_UNAVAILABLE" });
    }

    tokenLayer.activate?.();
    tokenLayer.releaseAll?.();

    const labels = placements.map((placement, index) => {
      const actorName = String(placement?.actor?.name ?? "").trim();
      const participantId = String(placement?.participant?.id ?? "").trim();
      return actorName || participantId || `#${index + 1}`;
    });
    const hud = new PlacementHud({ total: sources.length });
    hud.show();
    hud.update({ index: 0, label: labels[0] });

    try {
      const tokens = await tokenLayer.placeTokens(sources, {
        allowRotation: true,
        create: true,
        preSkip: () => false,
        onChange: ({ index = 0 } = {}) => hud.update({ index, label: labels[index] })
      });
      if (!Array.isArray(tokens) || tokens.length === 0) {
        throw new EncounterForgeError("Interactive Token placement was cancelled.", { code: "SCENE_PLACEMENT_CANCELLED" });
      }
      if (tokens.length !== sources.length) {
        throw new EncounterForgeError("Interactive Token placement returned an unexpected number of Tokens.", { code: "SCENE_TOKEN_COUNT_MISMATCH" });
      }
      return tokens;
    } finally {
      hud.destroy();
    }
  }
}
