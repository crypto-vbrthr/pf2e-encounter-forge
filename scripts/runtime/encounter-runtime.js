import { assertEncounterInstance } from "../model/encounter-instance.js";
import { EncounterForgeError } from "../utils/errors.js";
import { AuthorityService } from "./authority-service.js";
import { EncounterEventBus } from "./event-bus.js";
import {
  ActionService, EventService, ObjectiveService, ParticipantService, PhaseService,
  RuntimePersistenceService, TacticsService, TriggerService
} from "./service-stubs.js";

export class EncounterRuntime {
  constructor({ instanceRepository, integrations, gameRef = globalThis.game } = {}) {
    this.instanceRepository = instanceRepository;
    this.integrations = integrations;
    this.bus = new EncounterEventBus();
    this.authority = new AuthorityService({ gameRef });
    this.services = Object.freeze({
      events: new EventService({ bus: this.bus }),
      triggers: new TriggerService({ bus: this.bus }),
      phases: new PhaseService({ bus: this.bus }),
      objectives: new ObjectiveService({ bus: this.bus }),
      participants: new ParticipantService({ bus: this.bus }),
      tactics: new TacticsService({ bus: this.bus }),
      actions: new ActionService({ bus: this.bus, integrations }),
      persistence: new RuntimePersistenceService({ repository: instanceRepository })
    });
    this.activeInstanceId = null;
    this.started = false;
  }

  async start(instanceOrId = null, { force = false } = {}) {
    if (!force && !this.authority.isAuthoritative()) throw new EncounterForgeError("Encounter Runtime may only start on the authoritative GM client.", { code: "RUNTIME_NOT_AUTHORITATIVE" });
    let instance = instanceOrId;
    if (typeof instanceOrId === "string") instance = this.instanceRepository?.get(instanceOrId)?.data ?? null;
    if (instance) {
      assertEncounterInstance(instance);
      this.activeInstanceId = instance.id;
    }
    for (const service of Object.values(this.services)) await service.start();
    this.started = true;
    await this.bus.emit("runtime.started", { instanceId: this.activeInstanceId });
    return this.status();
  }

  async stop() {
    for (const service of [...Object.values(this.services)].reverse()) await service.stop();
    this.started = false;
    const stopped = this.activeInstanceId;
    this.activeInstanceId = null;
    await this.bus.emit("runtime.stopped", { instanceId: stopped });
    return this.status();
  }

  async restore({ force = false } = {}) {
    if (!force && !this.authority.isAuthoritative()) return { restored: false, reason: "not-authoritative", status: this.status() };
    const candidates = this.instanceRepository?.list?.() ?? [];
    const active = candidates.find((entry) => ["active", "paused", "prepared"].includes(entry.data?.status));
    if (!active) return { restored: false, reason: "no-instance", status: this.status() };
    await this.start(active.data, { force: true });
    return { restored: true, instanceId: active.data.id, status: this.status() };
  }

  status() {
    return {
      started: this.started,
      activeInstanceId: this.activeInstanceId,
      authority: this.authority.status(),
      services: Object.fromEntries(Object.entries(this.services).map(([key, service]) => [key, service.status()]))
    };
  }
}
