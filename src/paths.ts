import os from 'os';
import path from 'path';
import fs from 'fs';

export const APP_DIR = path.join(os.homedir(), '.lazy-review');
if (!fs.existsSync(APP_DIR)) {
  fs.mkdirSync(APP_DIR, { recursive: true });
}

export const DATABASE_PATH = path.join(APP_DIR, 'database.sqlite');
