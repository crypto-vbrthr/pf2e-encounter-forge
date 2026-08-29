import { nowIso } from "../utils/data.js";
import { RuntimeService } from "./base-service.js";

export class RuntimePersistenceService extends RuntimeService {
  constructor({ repository = null } = {}) {
    super("persistence");
    this.repository = repository;
    this.queue = Promise.resolve();
  }

  async save(instance) {
    if (!instance) return null;
    instance.metadata ??= {};
    instance.metadata.modifiedAt = nowIso();
    const task = async () => this.repository?.save?.(instance) ?? { data: instance, document: null };
    this.queue = this.queue.then(task, task);
    return this.queue;
  }

  status() {
    return { ...super.status(), repository: Boolean(this.repository) };
  }
}
