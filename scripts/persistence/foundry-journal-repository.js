import { MODULE_ID, REPOSITORY_FOLDERS } from "../constants.js";
import { collectionContents, deepClone, nowIso } from "../utils/data.js";
import { EncounterForgeError } from "../utils/errors.js";

function ownershipNone() {
  return globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.NONE ?? 0;
}

function journalContents(gameRef) {
  const collection = gameRef?.journal ?? gameRef?.collections?.get?.("JournalEntry") ?? null;
  return collectionContents(collection);
}

function folderContents(gameRef) {
  return collectionContents(gameRef?.folders);
}

export class FoundryJournalRepository {
  constructor({ kind, folderName, gameRef = globalThis.game, JournalEntryClass = globalThis.JournalEntry, FolderClass = globalThis.Folder } = {}) {
    this.kind = String(kind ?? "");
    this.folderName = String(folderName ?? "");
    this.gameRef = gameRef;
    this.JournalEntryClass = JournalEntryClass;
    this.FolderClass = FolderClass;
    if (!this.kind || !this.folderName) throw new TypeError("FoundryJournalRepository requires kind and folderName.");
  }

  #assertGm() {
    if (!this.gameRef?.user?.isGM) throw new EncounterForgeError("Only a GM may modify Encounter Forge repositories.", { code: "GM_ONLY" });
  }

  #flag(document) {
    return document?.flags?.[MODULE_ID] ?? document?.getFlag?.(MODULE_ID, "repository") ?? null;
  }

  #matches(document) {
    const flag = document?.flags?.[MODULE_ID]?.repository;
    return flag?.kind === this.kind;
  }

  async #ensureFolder(name, parent = null) {
    const parentId = parent?.id ?? parent ?? null;
    const existing = folderContents(this.gameRef).find((folder) => folder?.type === "JournalEntry" && folder?.name === name && (folder?.folder?.id ?? folder?.folder ?? null) === parentId);
    if (existing) return existing;
    if (!this.FolderClass?.create) throw new EncounterForgeError("Foundry Folder.create() is unavailable.", { code: "FOUNDRY_FOLDER_UNAVAILABLE" });
    return this.FolderClass.create({ name, type: "JournalEntry", folder: parentId, sorting: "a" });
  }

  async ensureFolder() {
    this.#assertGm();
    const root = await this.#ensureFolder(REPOSITORY_FOLDERS.ROOT, null);
    return this.#ensureFolder(this.folderName, root);
  }

  list() {
    return journalContents(this.gameRef).filter((document) => this.#matches(document)).map((document) => ({ document, data: deepClone(document.flags[MODULE_ID].repository.data) }));
  }

  get(idOrUuid) {
    const key = String(idOrUuid ?? "");
    const match = journalContents(this.gameRef).find((document) => {
      if (!this.#matches(document)) return false;
      const repository = document.flags[MODULE_ID].repository;
      return document.id === key || document.uuid === key || repository.id === key || repository.data?.id === key;
    });
    return match ? { document: match, data: deepClone(match.flags[MODULE_ID].repository.data) } : null;
  }

  async create(data) {
    this.#assertGm();
    if (!this.JournalEntryClass?.create) throw new EncounterForgeError("Foundry JournalEntry.create() is unavailable.", { code: "FOUNDRY_JOURNAL_UNAVAILABLE" });
    const folder = await this.ensureFolder();
    const payload = deepClone(data);
    const document = await this.JournalEntryClass.create({
      name: String(payload.name ?? payload.id ?? "Encounter Forge Data"),
      folder: folder.id,
      ownership: { default: ownershipNone() },
      flags: {
        [MODULE_ID]: {
          repository: {
            kind: this.kind,
            id: payload.id,
            schemaVersion: payload.schemaVersion,
            savedAt: nowIso(),
            data: payload
          }
        }
      }
    }, { renderSheet: false });
    return { document, data: deepClone(payload) };
  }

  async save(data, { create = true } = {}) {
    this.#assertGm();
    const current = this.get(data?.id);
    if (!current) {
      if (!create) throw new EncounterForgeError(`No ${this.kind} '${data?.id}' exists.`, { code: "REPOSITORY_NOT_FOUND" });
      return this.create(data);
    }
    const payload = deepClone(data);
    await current.document.update({
      name: String(payload.name ?? payload.id ?? current.document.name),
      [`flags.${MODULE_ID}.repository`]: {
        kind: this.kind,
        id: payload.id,
        schemaVersion: payload.schemaVersion,
        savedAt: nowIso(),
        data: payload
      }
    }, { render: false });
    return { document: current.document, data: deepClone(payload) };
  }

  async delete(idOrUuid) {
    this.#assertGm();
    const current = this.get(idOrUuid);
    if (!current) return false;
    await current.document.delete();
    return true;
  }
}
