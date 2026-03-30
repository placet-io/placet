const { TestEnvironment } = require('jest-environment-node');
const path = require('path');

// Load .env from the backend root (two levels up from test/setup/)
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Custom Jest 30 test environment that shares mutable state across test files.
 * Jest 30 creates a vm.createContext() per file which sandboxes globalThis.
 * Module-level variables here live *outside* the sandbox and persist for the
 * entire Jest run (with --runInBand).
 *
 * Tests hit the real backend running in Docker — no NestJS bootstrapping
 * inside Jest, so no VM-context teardown issues with lazy-loaded modules.
 */

// ── Module-level singletons (survive across test files) ─────────────
let sharedPrisma = null;
const sharedState = {
  accessToken: '',
  userId: '',
  apiKeyId: '',
  apiKeyRaw: '',
  agentId: '',
  uploadedFileIds: [],
  agentMessageId: '',
  reviewMessageId: '',
  logId: '',
};

class E2EEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();

    // Expose a bridge object inside the sandbox that reads/writes
    // module-level variables living outside the sandbox.
    this.global.__e2e__ = {
      get prisma() {
        return sharedPrisma;
      },
      set prisma(v) {
        sharedPrisma = v;
      },
      state: sharedState,
    };
  }
}

module.exports = E2EEnvironment;
