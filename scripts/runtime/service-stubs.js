class RuntimeService {
  constructor(name) { this.name = name; this.started = false; }
  async start() { this.started = true; return this.status(); }
  async stop() { this.started = false; return this.status(); }
  status() { return { name: this.name, started: this.started }; }
}

export class EventService extends RuntimeService { constructor(options = {}) { super("events"); this.bus = options.bus; } }
export class TriggerService extends RuntimeService { constructor(options = {}) { super("triggers"); this.bus = options.bus; } }
export class PhaseService extends RuntimeService { constructor(options = {}) { super("phases"); this.bus = options.bus; } }
export class ObjectiveService extends RuntimeService { constructor(options = {}) { super("objectives"); this.bus = options.bus; } }
export class ParticipantService extends RuntimeService { constructor(options = {}) { super("participants"); this.bus = options.bus; } }
export class TacticsService extends RuntimeService { constructor(options = {}) { super("tactics"); this.bus = options.bus; } }
export class ActionService extends RuntimeService { constructor(options = {}) { super("actions"); this.bus = options.bus; this.integrations = options.integrations; } }
export class RuntimePersistenceService extends RuntimeService { constructor(options = {}) { super("persistence"); this.repository = options.repository; } }
