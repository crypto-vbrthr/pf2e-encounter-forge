export class EncounterForgeError extends Error {
  constructor(message, { code = "ENCOUNTER_FORGE_ERROR", details = null, cause = undefined } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "EncounterForgeError";
    this.code = code;
    this.details = details;
  }
}

export class EncounterValidationError extends EncounterForgeError {
  constructor(message, report) {
    super(message, { code: "ENCOUNTER_VALIDATION_FAILED", details: report });
    this.name = "EncounterValidationError";
    this.validation = report;
  }
}
