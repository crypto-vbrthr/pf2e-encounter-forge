import { RuntimeService } from "./base-service.js";

export class TacticsService extends RuntimeService {
  constructor({ getBlueprint = () => null } = {}) {
    super("tactics");
    this.getBlueprint = getBlueprint;
  }

  profile(id) {
    if (!id) return null;
    return (this.getBlueprint()?.tactics?.profiles ?? []).find((entry) => entry.id === id) ?? null;
  }

  recommendation(participant) {
    const profile = this.profile(participant?.tacticsProfileId);
    if (!profile) return null;
    return String(profile.summary ?? profile.instructions ?? profile.description ?? "").trim() || null;
  }
}
