import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// This module lives at <package>/dist/modules/storage-paths.js when compiled,
// so the built application root (the `dist` folder) is one level up.
const moduleDir = path.dirname(fileURLToPath(import.meta.url)); // <package>/dist/modules
const packageRoot = path.resolve(moduleDir, '..'); // <package>/dist

/** Absolute path to the built application (the `dist` folder). */
export function getPackageRoot(): string {
  return packageRoot;
}

/** Absolute path to the compiled frontend assets (dist/client). */
export function getClientDistDir(): string {
  return path.join(packageRoot, 'client');
}

/**
 * Stable, per-user data directory for Lazy Review. Unlike the process working
 * directory, this is the same no matter where the CLI is invoked from, so
 * state survives global `npm i -g lazy-review` installs.
 */
export function getAppDataDir(): string {
  return path.join(os.homedir(), '.lazy-review');
}

/**
 * Resolve the SQLite database path. Prefers the per-user data directory, but
 * keeps using a legacy `database.sqlite` found in the current working
 * directory so existing installs don't lose their data.
 */
export function getDatabasePath(): string {
  const legacy = path.resolve(process.cwd(), 'database.sqlite');
  if (fs.existsSync(legacy)) return legacy;
  return path.join(getAppDataDir(), 'database.sqlite');
}

/** Ensure the per-user data directory exists, returning its path. */
export function ensureAppDataDir(): string {
  const dir = getAppDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
