import { collectionContents } from "../utils/data.js";

export class AuthorityService {
  constructor({ gameRef = globalThis.game } = {}) { this.gameRef = gameRef; }

  primaryGmId() {
    const users = this.gameRef?.users;
    if (users?.activeGM?.id) return String(users.activeGM.id);
    const active = collectionContents(users)
      .filter((user) => user?.isGM && user?.active !== false)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return active[0]?.id ? String(active[0].id) : null;
  }

  isAuthoritative(user = this.gameRef?.user) {
    if (!user?.isGM || user?.active === false) return false;
    const primary = this.primaryGmId();
    return !primary || String(user.id) === primary;
  }

  status() {
    return { primaryGmId: this.primaryGmId(), authoritative: this.isAuthoritative(), userId: this.gameRef?.user?.id ?? null };
  }
}
