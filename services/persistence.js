import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const GCS_BUCKET =
  process.env.STATE_STORAGE_BUCKET ||
  process.env.GCS_BUCKET ||
  process.env.PERSISTENCE_BUCKET ||
  '';
const GCS_OBJECT =
  process.env.STATE_STORAGE_OBJECT ||
  process.env.GCS_OBJECT ||
  process.env.PERSISTENCE_OBJECT ||
  'state.json';
const GCS_PROJECT =
  process.env.STATE_STORAGE_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  undefined;

const GOOGLE_METADATA_TOKEN_URL =
  process.env.STATE_STORAGE_TOKEN_URL ||
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

const gcsEnabled = Boolean(GCS_BUCKET && typeof fetch === 'function');

const EMPTY_STATE = {
  users: [],
  strategies: [],
  webhook: null,
};

const normalizeState = (input) => {
  if (!input || typeof input !== 'object') {
    return { ...EMPTY_STATE };
  }
  return {
    users: Array.isArray(input.users) ? input.users : [],
    strategies: Array.isArray(input.strategies) ? input.strategies : [],
    webhook:
      input.webhook && typeof input.webhook === 'object'
        ? {
            url: input.webhook.url ?? null,
            secret: input.webhook.secret ?? null,
            createdAt: input.webhook.createdAt ?? null,
            updatedAt: input.webhook.updatedAt ?? null,
            routes: Array.isArray(input.webhook.routes) ? input.webhook.routes : [],
          }
        : null,
  };
};

const loadFromFileSystem = async () => {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.error('Failed to load persisted state from file system', err);
    }
    return { ...EMPTY_STATE };
  }
};

const metadataHeaders = { 'Metadata-Flavor': 'Google' };

const fetchGoogleAccessToken = async () => {
  try {
    const response = await fetch(GOOGLE_METADATA_TOKEN_URL, { headers: metadataHeaders });
    if (!response.ok) {
      throw new Error(`Metadata server responded with ${response.status}`);
    }
    const data = await response.json();
    if (!data?.access_token) {
      throw new Error('Metadata server response missing access_token');
    }
    return data.access_token;
  } catch (err) {
    throw new Error(`Failed to obtain Google Cloud access token: ${err?.message || err}`);
  }
};

const buildDownloadUrl = () =>
  `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(GCS_BUCKET)}/o/${encodeURIComponent(
    GCS_OBJECT,
  )}?alt=media`;

const buildUploadUrl = () => {
  const base =
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(GCS_BUCKET)}/o` +
    `?uploadType=media&name=${encodeURIComponent(GCS_OBJECT)}`;
  if (GCS_PROJECT) {
    return `${base}&project=${encodeURIComponent(GCS_PROJECT)}`;
  }
  return base;
};

const loadFromGoogleCloudStorage = async () => {
  if (!gcsEnabled) {
    return null;
  }
  try {
    const token = await fetchGoogleAccessToken();
    const response = await fetch(buildDownloadUrl(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 404) {
      return { ...EMPTY_STATE };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`GCS download failed with status ${response.status}: ${text}`);
    }

    const text = await response.text();
    return normalizeState(JSON.parse(text));
  } catch (err) {
    console.error('Failed to load persisted state from Google Cloud Storage', err);
    return null;
  }
};

export const loadPersistentState = async () => {
  if (gcsEnabled) {
    const state = await loadFromGoogleCloudStorage();
    if (state) {
      return state;
    }
  }
  return loadFromFileSystem();
};

const saveToFileSystem = async (payload) => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, payload, 'utf8');
};

const saveToGoogleCloudStorage = async (payload) => {
  if (!gcsEnabled) {
    return;
  }
  const token = await fetchGoogleAccessToken();
  const response = await fetch(buildUploadUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: payload,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`GCS upload failed with status ${response.status}: ${text}`);
  }
};

let writeQueue = Promise.resolve();

export const savePersistentState = async (state) => {
  const payload = JSON.stringify(state ?? EMPTY_STATE, null, 2);
  const persist = async () => {
    if (gcsEnabled) {
      try {
        await saveToGoogleCloudStorage(payload);
        return;
      } catch (err) {
        console.error('Failed to write persisted state to Google Cloud Storage', err);
      }
    }
    await saveToFileSystem(payload);
  };

  writeQueue = writeQueue.catch(() => undefined).then(persist);
  return writeQueue;
};
