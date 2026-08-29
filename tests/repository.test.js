import test from "node:test";
import assert from "node:assert/strict";
import { FoundryJournalRepository } from "../scripts/persistence/foundry-journal-repository.js";

function createFakeFoundry() {
  const folders = [];
  const journals = [];
  let next = 1;
  const gameRef = { user: { id: "gm", isGM: true }, folders: { contents: folders }, journal: { contents: journals } };

  class FolderClass {
    static async create(data) {
      const folder = { id: `f${next++}`, ...data };
      folders.push(folder);
      return folder;
    }
  }

  class JournalEntryClass {
    static async create(data) {
      const document = {
        id: `j${next++}`,
        uuid: `JournalEntry.j${next}`,
        ...data,
        async update(changes) {
          for (const [key, value] of Object.entries(changes)) {
            if (key.startsWith("flags.")) {
              const path = key.split(".");
              this.flags ??= {};
              this.flags[path[1]] ??= {};
              this.flags[path[1]][path[2]] = value;
            } else this[key] = value;
          }
          return this;
        },
        async delete() {
          const index = journals.indexOf(this);
          if (index >= 0) journals.splice(index, 1);
        }
      };
      journals.push(document);
      return document;
    }
  }
  return { gameRef, FolderClass, JournalEntryClass, folders, journals };
}

test("Journal repository creates root/subfolder, saves, updates and deletes payload", async () => {
  const fake = createFakeFoundry();
  const repo = new FoundryJournalRepository({ kind: "blueprint", folderName: "Blueprints", ...fake });
  const created = await repo.create({ id: "e1", name: "Encounter 1", schemaVersion: 1, value: 1 });
  assert.equal(fake.folders.length, 2);
  assert.equal(repo.get("e1").data.value, 1);
  await repo.save({ id: "e1", name: "Encounter renamed", schemaVersion: 1, value: 2 });
  assert.equal(repo.get("e1").data.value, 2);
  assert.equal(created.document.name, "Encounter renamed");
  assert.equal(await repo.delete("e1"), true);
  assert.equal(repo.get("e1"), null);
});
