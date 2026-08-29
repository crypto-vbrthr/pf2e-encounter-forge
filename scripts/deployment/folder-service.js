import { EncounterForgeError } from "../utils/errors.js";
import { collectionContents } from "../utils/data.js";

export class ActorFolderService {
  constructor({ gameRef = globalThis.game, FolderClass = globalThis.Folder } = {}) {
    this.gameRef = gameRef;
    this.FolderClass = FolderClass;
  }

  list() {
    return collectionContents(this.gameRef?.folders).filter((folder) => folder?.type === "Actor");
  }

  get(id) {
    return this.list().find((folder) => String(folder.id) === String(id)) ?? null;
  }

  async create(name, { parentId = null } = {}) {
    if (!this.gameRef?.user?.isGM) throw new EncounterForgeError("Only a GM may create Actor folders.", { code: "GM_ONLY" });
    if (!this.FolderClass?.create) throw new EncounterForgeError("Foundry Folder.create() is unavailable.", { code: "FOUNDRY_FOLDER_UNAVAILABLE" });
    return this.FolderClass.create({ name: String(name || "Encounter"), type: "Actor", folder: parentId, sorting: "a" });
  }

  async resolve({ folderId = null, createSubfolder = false, subfolderName = null } = {}) {
    const parent = folderId ? this.get(folderId) : null;
    if (folderId && !parent) throw new EncounterForgeError(`Actor folder '${folderId}' was not found.`, { code: "ACTOR_FOLDER_NOT_FOUND" });
    if (!createSubfolder) return parent;
    return this.create(subfolderName || "Encounter", { parentId: parent?.id ?? null });
  }
}
