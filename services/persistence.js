import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const EMPTY_STATE = {
  users: [],
  strategies: [],
  webhook: null,
};

export const loadPersistentState = async () => {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ...EMPTY_STATE };
    }
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      strategies: Array.isArray(parsed.strategies) ? parsed.strategies : [],
      webhook:
        parsed.webhook && typeof parsed.webhook === 'object'
          ? {
              url: parsed.webhook.url ?? null,
              secret: parsed.webhook.secret ?? null,
              createdAt: parsed.webhook.createdAt ?? null,
              updatedAt: parsed.webhook.updatedAt ?? null,
              routes: Array.isArray(parsed.webhook.routes) ? parsed.webhook.routes : [],
            }
          : null,
    };
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.error('Failed to load persisted state', err);
    }
    return { ...EMPTY_STATE };
  }
};

let writeQueue = Promise.resolve();

export const savePersistentState = async (state) => {
  const payload = JSON.stringify(state ?? EMPTY_STATE, null, 2);
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(STATE_FILE, payload, 'utf8');
    });
  return writeQueue;
};
