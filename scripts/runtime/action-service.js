import { RuntimeService } from "./base-service.js";

export class ActionService extends RuntimeService {
  constructor({ bus = null, integrations = null, handlers = {} } = {}) {
    super("actions");
    this.bus = bus;
    this.integrations = integrations;
    this.handlers = handlers;
  }

  async execute(action, context = {}) {
    const type = String(action?.type ?? action?.kind ?? "").trim();
    if (!type) return { handled: false, reason: "missing-type" };
    if (type === "phase.transition") return this.handlers.phaseTransition?.(action.phaseId ?? action.targetPhaseId ?? action.target, context);
    if (type === "objective.progress") return this.handlers.objectiveProgress?.(action.objectiveId ?? action.target, Number(action.amount ?? 1), context);
    if (type === "director.message" || type === "chat.note") return this.handlers.directorMessage?.(String(action.message ?? action.text ?? action.label ?? ""), context);
    return { handled: false, reason: "unsupported", type };
  }
}
