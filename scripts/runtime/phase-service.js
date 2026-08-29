import { RuntimeService } from "./base-service.js";

export class PhaseService extends RuntimeService {
  constructor({ getInstance = () => null, getBlueprint = () => null } = {}) {
    super("phases");
    this.getInstance = getInstance;
    this.getBlueprint = getBlueprint;
  }

  list() { return this.getBlueprint()?.phases ?? []; }
  current() {
    const id = this.getInstance()?.currentPhaseId ?? null;
    return this.list().find((phase) => phase.id === id) ?? null;
  }
  has(id) { return this.list().some((phase) => phase.id === id); }
}
