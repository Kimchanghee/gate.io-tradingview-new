'use strict';

/**
 * Legacy entry point kept for backwards compatibility.
 *
 * The Cloud Run/production deployment uses `server.js`, which simply
 * re-exports the Express application defined in `server-simple.js`.
 * Some older scripts, however, still execute `node serve.js` directly.
 * In those situations we want to boot the exact same server so all
 * routes (UID login, registration, metrics, admin APIs, etc.) are
 * available consistently instead of falling back to a stale copy of
 * the implementation.
 */
require('./server-simple');
