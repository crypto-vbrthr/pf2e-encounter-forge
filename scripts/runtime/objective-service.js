import { RuntimeService } from "./base-service.js";

export class ObjectiveService extends RuntimeService {
  constructor({ getInstance = () => null, getBlueprint = () => null } = {}) {
    super("objectives");
    this.getInstance = getInstance;
    this.getBlueprint = getBlueprint;
  }

  list() {
    const instance = this.getInstance();
    const blueprint = this.getBlueprint();
    return (blueprint?.objectives ?? []).map((definition) => ({ definition, state: instance?.objectives?.[definition.id] ?? null }));
  }
}
