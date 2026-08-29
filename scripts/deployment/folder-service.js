import { EncounterForgeError } from "../utils/errors.js";
import { collectionContents } from "../utils/data.js";

function parentId(folder) {
  return folder?.folder?.id ?? folder?.folder ?? null;
}

function safeName(value, fallback = "Encounter") {
  return String(value ?? "").trim() || fallback;
}

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

  options() {
    const folders = this.list();
    const children = new Map();
    for (const folder of folders) {
      const key = parentId(folder) ?? "__root__";
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(folder);
    }
    for (const rows of children.values()) {
      rows.sort((a, b) => (Number(a?.sort) || 0) - (Number(b?.sort) || 0) || String(a?.name ?? "").localeCompare(String(b?.name ?? "")));
    }

    const result = [];
    const visited = new Set();
    const walk = (key, depth) => {
      for (const folder of children.get(key) ?? []) {
        if (visited.has(folder.id)) continue;
        visited.add(folder.id);
        result.push({ id: folder.id, name: folder.name, depth, label: `${"  ".repeat(depth)}${folder.name}` });
        walk(folder.id, depth + 1);
      }
    };
    walk("__root__", 0);
    for (const folder of folders) {
      if (!visited.has(folder.id)) result.push({ id: folder.id, name: folder.name, depth: 0, label: folder.name });
    }
    return result;
  }

  async create(name, { parentId: parent = null } = {}) {
    if (!this.gameRef?.user?.isGM) throw new EncounterForgeError("Only a GM may create Actor folders.", { code: "GM_ONLY" });
    if (!this.FolderClass?.create) throw new EncounterForgeError("Foundry Folder.create() is unavailable.", { code: "FOUNDRY_FOLDER_UNAVAILABLE" });
    return this.FolderClass.create({ name: safeName(name), type: "Actor", folder: parent, sorting: "a" });
  }

  #uniqueChildName(name, parent = null) {
    const base = safeName(name);
    const siblings = this.list().filter((folder) => (parentId(folder) ?? null) === (parent ?? null));
    const names = new Set(siblings.map((folder) => String(folder.name ?? "")));
    if (!names.has(base)) return base;
    let index = 2;
    while (names.has(`${base} (${index})`)) index += 1;
    return `${base} (${index})`;
  }

  async resolveTarget({ folderId = null, createSubfolder = false, subfolderName = null } = {}) {
    const parent = folderId ? this.get(folderId) : null;
    if (folderId && !parent) throw new EncounterForgeError(`Actor folder '${folderId}' was not found.`, { code: "ACTOR_FOLDER_NOT_FOUND" });
    if (!createSubfolder) return { folder: parent, created: false };
    const name = this.#uniqueChildName(subfolderName || "Encounter", parent?.id ?? null);
    const folder = await this.create(name, { parentId: parent?.id ?? null });
    return { folder, created: true };
  }

  async resolve(options = {}) {
    const result = await this.resolveTarget(options);
    return result.folder;
  }
}
