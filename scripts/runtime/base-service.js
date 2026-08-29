export class RuntimeService {
  constructor(name) {
    this.name = name;
    this.started = false;
  }

  async start() {
    this.started = true;
    return this.status();
  }

  async stop() {
    this.started = false;
    return this.status();
  }

  status() {
    return { name: this.name, started: this.started };
  }
}
