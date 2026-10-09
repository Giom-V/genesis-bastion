/**
 * @file src/utils/logger.js
 * @description Centralized structured logging utility for Genesis Bastion.
 * Records informational, warning, evolutionary (genetic crossover, mutations,
 * hybridizations), and tactical alert events (Scout Patient Zero discoveries,
 * lineage eradications, famine waves) in an in-memory ring buffer.
 *
 * Used by:
 * - Headless CLI simulation (`scripts/dry-run-sim.js`) for full traceability
 * - Ecosystem & Genome engines (`src/ecosystem/*`) to log evolutionary events
 * - Entity & Scout AI (`src/entities/*`) to log discoveries and combat milestones
 * - HUD Live Evolution & Combat Feed (`src/ui/HUDManager.js`) via ring buffer & pub/sub
 */

const MAX_LOG_ENTRIES = 250;

/**
 * Formats a timestamp in MM:SS.mmm relative to session start.
 * @param {number} startTimeMs - Epoch milliseconds when logger initialized.
 * @returns {string} Formatted elapsed time string.
 */
function formatElapsed(startTimeMs) {
  const elapsedSec = Math.max(0, (Date.now() - startTimeMs) / 1000);
  const mins = Math.floor(elapsedSec / 60);
  const secs = Math.floor(elapsedSec % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

class GenesisLogger {
  constructor() {
    /** @type {number} */
    this.startTimeMs = Date.now();
    /** @type {Array<{id: number, timestamp: string, rawTime: number, level: string, category: string, message: string, meta: Object}>} */
    this.entries = [];
    /** @type {number} */
    this.nextId = 1;
    /** @type {Set<Function>} */
    this.listeners = new Set();
    /** @type {boolean} */
    this.silentConsole = false;
  }

  /**
   * Internal method to push a structured log entry into the ring buffer
   * and notify all subscribed HUD/simulation listeners.
   *
   * @param {'INFO'|'WARN'|'EVOLUTION'|'ALERT'} level - Log severity/domain level.
   * @param {string} category - Functional subsystem tag (e.g. 'ECO', 'GENOME', 'SCOUT', 'COMBAT').
   * @param {string} message - Human-readable event description.
   * @param {Object} [meta={}] - Structured metadata payload for inspection.
   * @returns {Object} The created log entry.
   */
  _record(level, category, message, meta = {}) {
    const entry = {
      id: this.nextId++,
      timestamp: formatElapsed(this.startTimeMs),
      rawTime: Date.now(),
      level,
      category: category || 'SYSTEM',
      message: String(message),
      meta: meta && typeof meta === 'object' ? { ...meta } : { value: meta },
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries.shift();
    }

    if (!this.silentConsole && typeof console !== 'undefined') {
      const prefix = `[${entry.timestamp}] [${entry.level}:${entry.category}]`;
      const hasMeta = Object.keys(entry.meta).length > 0;
      if (level === 'WARN' || level === 'ALERT') {
        if (hasMeta) {
          console.warn(prefix, entry.message, entry.meta);
        } else {
          console.warn(prefix, entry.message);
        }
      } else {
        if (hasMeta) {
          console.info(prefix, entry.message, entry.meta);
        } else {
          console.info(prefix, entry.message);
        }
      }
    }

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (err) {
        // Prevent a faulty UI listener from breaking game logic
      }
    }

    return entry;
  }

  /**
   * Logs a general informational event.
   * @param {string} category - Subsystem name (e.g. 'WORLD', 'BASTION', 'PLAYER').
   * @param {string} message - Event description.
   * @param {Object} [meta={}] - Additional context parameters.
   * @returns {Object} Created log entry.
   */
  info(category, message, meta = {}) {
    if (typeof message === 'undefined' || (typeof message === 'object' && message !== null)) {
      return this._record('INFO', 'GENERAL', String(category), message || {});
    }
    return this._record('INFO', category, message, meta);
  }

  /**
   * Logs a warning or ecological stress event (e.g. overpopulation famine, low bastion HP).
   * @param {string} category - Subsystem name.
   * @param {string} message - Warning description.
   * @param {Object} [meta={}] - Additional context parameters.
   * @returns {Object} Created log entry.
   */
  warn(category, message, meta = {}) {
    if (typeof message === 'undefined' || (typeof message === 'object' && message !== null)) {
      return this._record('WARN', 'WARNING', String(category), message || {});
    }
    return this._record('WARN', category, message, meta);
  }

  /**
   * Logs a runtime error or caught exception so render/tick loops can recover safely.
   * @param {string} category - Subsystem name or error message.
   * @param {string|Object} [message] - Error description or metadata object.
   * @param {Object} [meta={}] - Additional error context.
   * @returns {Object} Created log entry.
   */
  error(category, message, meta = {}) {
    if (typeof message === 'undefined' || (typeof message === 'object' && message !== null)) {
      return this._record('WARN', 'ERROR', String(category), message || {});
    }
    return this._record('WARN', category || 'ERROR', message, meta);
  }

  /**
   * Logs a Darwinian evolutionary event (crossover birth, Mendelian dominant inheritance,
   * de novo mutation emergence, or inter-species hybridization).
   * @param {string} message - Evolutionary event description.
   * @param {Object} [meta={}] - Genetic metadata (parents, mutationId, fitnessScore, generation).
   * @returns {Object} Created log entry.
   */
  evolution(message, meta = {}) {
    return this._record('EVOLUTION', 'GENETICS', message, meta);
  }

  /**
   * Logs a high-priority tactical alert (e.g. Scout discovering a Mutant Patient Zero,
   * mutant lineage reaching dominance, or mutant lineage eradication).
   * @param {string} message - Alert message.
   * @param {Object} [meta={}] - Tactical context (enemyId, mutationId, position, scoutId).
   * @returns {Object} Created log entry.
   */
  alert(message, meta = {}) {
    return this._record('ALERT', 'SCOUT', message, meta);
  }

  /**
   * Retrieves the most recent structured log entries (newest last or newest first controllable,
   * returns chronological slice of recent entries up to `limit`).
   * @param {number} [limit=50] - Maximum number of entries to return.
   * @returns {Array<Object>} Array of recent log entries.
   */
  getRecentLogs(limit = 50) {
    const count = Math.max(1, Math.min(limit, this.entries.length));
    return this.entries.slice(this.entries.length - count);
  }

  /**
   * Subscribes a listener function to be invoked synchronously whenever a new log entry is added.
   * @param {Function} listener - Callback receiving `(entry)`.
   * @returns {Function} Unsubscribe function.
   */
  subscribe(listener) {
    if (typeof listener === 'function') {
      this.listeners.add(listener);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Clears all stored log entries (useful between headless test runs).
   */
  clear() {
    this.entries = [];
  }
}

export const logger = new GenesisLogger();
export default logger;
