import { DOCUMENT_KINDS, REPOSITORY_FOLDERS } from "../constants.js";
import { assertEncounterBlueprint } from "../model/encounter-blueprint.js";
import { assertEncounterInstance } from "../model/encounter-instance.js";
import { FoundryJournalRepository } from "./foundry-journal-repository.js";

class TypedRepository {
  constructor(repository, assertFn) { this.repository = repository; this.assertFn = assertFn; }
  list() { return this.repository.list(); }
  get(idOrUuid) { return this.repository.get(idOrUuid); }
  ensureFolder() { return this.repository.ensureFolder(); }
  async create(data) { this.assertFn(data); return this.repository.create(data); }
  async save(data, options = {}) { this.assertFn(data); return this.repository.save(data, options); }
  delete(idOrUuid) { return this.repository.delete(idOrUuid); }
}

export function createBlueprintRepository(options = {}) {
  return new TypedRepository(new FoundryJournalRepository({ kind: DOCUMENT_KINDS.BLUEPRINT, folderName: REPOSITORY_FOLDERS.BLUEPRINTS, ...options }), assertEncounterBlueprint);
}

export function createInstanceRepository(options = {}) {
  return new TypedRepository(new FoundryJournalRepository({ kind: DOCUMENT_KINDS.INSTANCE, folderName: REPOSITORY_FOLDERS.RUNTIME, ...options }), assertEncounterInstance);
}
