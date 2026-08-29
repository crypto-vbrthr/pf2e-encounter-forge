import { RuntimeService } from "./base-service.js";

function getPath(object, path) {
  return String(path ?? "").split(".").filter(Boolean).reduce((value, key) => value?.[key], object);
}

function compare(left, operator, right) {
  switch (operator) {
    case "eq": return left === right;
    case "neq": return left !== right;
    case "gt": return Number(left) > Number(right);
    case "gte": return Number(left) >= Number(right);
    case "lt": return Number(left) < Number(right);
    case "lte": return Number(left) <= Number(right);
    case "includes": return Array.isArray(left) ? left.includes(right) : String(left ?? "").includes(String(right ?? ""));
    default: return left === right;
  }
}

function matchesEvent(trigger, event) {
  const expected = String(trigger?.event ?? trigger?.eventType ?? trigger?.type ?? "").trim();
  if (!expected) return false;
  return expected === event.type;
}

function matchesConditions(trigger, event, instance = null) {
  if (trigger?.activePhaseId && trigger.activePhaseId !== instance?.currentPhaseId) return false;
  if (trigger?.participantId && trigger.participantId !== event.participantId) return false;
  if (Number.isFinite(Number(trigger?.round)) && Number(event.round) < Number(trigger.round)) return false;
  const conditions = Array.isArray(trigger?.conditions) ? trigger.conditions : [];
  return conditions.every((condition) => compare(getPath(event, condition.field ?? condition.path), String(condition.operator ?? "eq"), condition.value));
}

export class TriggerService extends RuntimeService {
  constructor({ bus = null, getInstance = () => null, getBlueprint = () => null, enabled = () => true, onTrigger = null } = {}) {
    super("triggers");
    this.bus = bus;
    this.getInstance = getInstance;
    this.getBlueprint = getBlueprint;
    this.enabled = enabled;
    this.onTrigger = onTrigger;
    this.unsubscribe = null;
  }

  async start() {
    if (this.started) return this.status();
    await super.start();
    this.unsubscribe = this.bus?.on?.("encounter.event", (event) => this.evaluate(event)) ?? null;
    return this.status();
  }

  async stop() {
    try { this.unsubscribe?.(); } catch {}
    this.unsubscribe = null;
    return super.stop();
  }

  async evaluate(event) {
    if (!this.enabled()) return [];
    const instance = this.getInstance();
    const blueprint = this.getBlueprint();
    if (!instance || !blueprint) return [];
    const fired = new Set(instance.triggeredEvents ?? []);
    const matches = [];
    for (const trigger of blueprint.triggers ?? []) {
      if (trigger?.enabled === false) continue;
      const once = trigger?.once !== false;
      if (once && fired.has(trigger.id)) continue;
      if (!matchesEvent(trigger, event) || !matchesConditions(trigger, event, instance)) continue;
      matches.push(trigger);
      await this.onTrigger?.(trigger, event);
    }
    return matches;
  }
}
