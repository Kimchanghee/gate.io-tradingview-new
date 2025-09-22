import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

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

const gcsConfigured = Boolean(GCS_BUCKET);
const fetchAvailable = typeof fetch === 'function';

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';
const TOKEN_SAFETY_MARGIN_MS = 60_000;

const SERVICE_ACCOUNT_JSON_ENV_KEYS = [
  'STATE_STORAGE_SERVICE_ACCOUNT',
  'STATE_STORAGE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
];

const SERVICE_ACCOUNT_EMAIL_ENV_KEYS = [
  'STATE_STORAGE_CLIENT_EMAIL',
  'STATE_STORAGE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_CLIENT_EMAIL',
];

const SERVICE_ACCOUNT_KEY_ENV_KEYS = [
  'STATE_STORAGE_PRIVATE_KEY',
  'STATE_STORAGE_SERVICE_ACCOUNT_PRIVATE_KEY',
  'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
  'GOOGLE_PRIVATE_KEY',
];

const SERVICE_ACCOUNT_FILE_ENV_KEYS = [
  'STATE_STORAGE_CREDENTIALS_FILE',
  'STATE_STORAGE_SERVICE_ACCOUNT_FILE',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_CREDENTIALS',
];

// 다국어 로깅 함수
const logMultilingual = (level, english, korean, error) => {
  const logger = console[level] || console.log;
  const prefix = '[persistence]';
  if (error) {
    logger.call(console, `${prefix} ${english}`, error);
    logger.call(console, `${prefix} ${korean}`);
    return;
  }
  logger.call(console, `${prefix} ${english}`);
  logger.call(console, `${prefix} ${korean}`);
};

// 스토리지 상태 결정
const determineStorageStatus = () => {
  if (!gcsConfigured) {
    return {
      enabled: false,
      english:
        'Falling back to local data/state.json because no Cloud Storage bucket is configured. Set the STATE_STORAGE_BUCKET environment variable to persist admin data across deployments.',
      korean:
        'Cloud Storage 버킷이 설정되지 않아 data/state.json 파일을 사용합니다. STATE_STORAGE_BUCKET 값을 지정하면 배포 후에도 관리자 데이터가 유지됩니다.',
    };
  }

  if (!fetchAvailable) {
    return {
      enabled: false,
      english:
        'Falling back to local data/state.json because the global fetch API is unavailable. Upgrade to Node 18+ or provide fetch to enable Cloud Storage persistence.',
      korean:
        '글로벌 fetch API를 사용할 수 없어 data/state.json 파일에 저장합니다. Cloud Storage 저장소를 사용하려면 Node 18+ 환경이거나 fetch를 직접 제공해야 합니다.',
    };
  }

  const objectPath = GCS_OBJECT || 'state.json';
  return {
    enabled: true,
    english: `Persisting admin data to Cloud Storage bucket "${GCS_BUCKET}" as "${objectPath}".`,
    korean: `관리자 데이터를 Cloud Storage 버킷 "${GCS_BUCKET}"의 "${objectPath}" 객체에 저장합니다.`,
  };
};

const { enabled: gcsEnabled, english: storageEnglish, korean: storageKorean } = determineStorageStatus();
logMultilingual('info', storageEnglish, storageKorean);

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

const readFirstEnvValue = (keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const normalisePrivateKey = (value) => {
  if (!value) {
    return '';
  }
  const trimmed = String(value).trim();
  return trimmed.includes('-----BEGIN') ? trimmed.replace(/\\n/g, '\n') : trimmed;
};

const parseServiceAccountJson = (raw) => {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    const email = parsed?.client_email;
    const privateKey = parsed?.private_key;
    if (email && privateKey) {
      return {
        clientEmail: String(email),
        privateKey: normalisePrivateKey(String(privateKey)),
      };
    }
  } catch (error) {
    // Ignore parse errors here; caller will log a warning.
  }
  return null;
};

let serviceAccountCredentialsLoaded = false;
let cachedServiceAccountCredentials = null;

const loadServiceAccountCredentials = async () => {
  if (serviceAccountCredentialsLoaded) {
    return cachedServiceAccountCredentials;
  }
  serviceAccountCredentialsLoaded = true;

  const rawJson = readFirstEnvValue(SERVICE_ACCOUNT_JSON_ENV_KEYS);
  if (rawJson) {
    const parsed = parseServiceAccountJson(rawJson);
    if (parsed) {
      cachedServiceAccountCredentials = parsed;
      return cachedServiceAccountCredentials;
    }
    logMultilingual(
      'warn',
      'Failed to parse Cloud Storage service account JSON from environment variables. Ignoring the value.',
      '환경 변수에 설정된 Cloud Storage 서비스 계정 JSON을 해석하지 못했습니다. 해당 값을 무시합니다.',
    );
  }

  const clientEmail = readFirstEnvValue(SERVICE_ACCOUNT_EMAIL_ENV_KEYS);
  const privateKeyRaw = readFirstEnvValue(SERVICE_ACCOUNT_KEY_ENV_KEYS);
  const privateKey = normalisePrivateKey(privateKeyRaw);

  if (clientEmail && privateKey) {
    cachedServiceAccountCredentials = { clientEmail, privateKey };
    return cachedServiceAccountCredentials;
  }

  if ((clientEmail && !privateKeyRaw) || (!clientEmail && privateKeyRaw)) {
    logMultilingual(
      'warn',
      'Incomplete Cloud Storage service account credentials provided. Both email and private key must be set.',
      'Cloud Storage 서비스 계정 자격 증명이 불완전합니다. 이메일과 개인 키를 모두 설정해야 합니다.',
    );
  }

  const credentialsFile = readFirstEnvValue(SERVICE_ACCOUNT_FILE_ENV_KEYS);
  if (credentialsFile) {
    try {
      const fileContents = await fs.readFile(credentialsFile, 'utf8');
      const parsed = parseServiceAccountJson(fileContents);
      if (parsed) {
        cachedServiceAccountCredentials = parsed;
        return cachedServiceAccountCredentials;
      }
      logMultilingual(
        'warn',
        `The service account file "${credentialsFile}" does not contain client_email/private_key fields.`,
        `서비스 계정 파일 "${credentialsFile}"에 client_email 또는 private_key 값이 없습니다.`,
      );
    } catch (error) {
      logMultilingual(
        'error',
        `Failed to read service account credentials from "${credentialsFile}" for Cloud Storage persistence.`,
        `Cloud Storage 저장을 위해 "${credentialsFile}" 파일에서 서비스 계정 자격 증명을 읽지 못했습니다.`,
        error,
      );
    }
  }

  return cachedServiceAccountCredentials;
};

const base64UrlEncode = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const createJwtAssertion = (clientEmail, privateKey) => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: STORAGE_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${encodedHeader}.${encodedPayload}`);
  const signature = signer.sign(privateKey);
  const encodedSignature = base64UrlEncode(signature);
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
};

const createTokenCache = () => ({ token: null, expiresAt: 0 });

const serviceAccountTokenCache = createTokenCache();
const metadataTokenCache = createTokenCache();

const getCachedToken = (cache) => (cache.token && cache.expiresAt > Date.now() ? cache.token : null);

const updateTokenCache = (cache, token, expiresInMs) => {
  const lifetime = Number.isFinite(expiresInMs) ? expiresInMs : 0;
  const safeExpiry = Date.now() + Math.max(0, lifetime - TOKEN_SAFETY_MARGIN_MS);
  cache.token = token;
  cache.expiresAt = safeExpiry;
};

const requestServiceAccountAccessToken = async (credentials) => {
  const cachedToken = getCachedToken(serviceAccountTokenCache);
  if (cachedToken) {
    return cachedToken;
  }

  const assertion = createJwtAssertion(credentials.clientEmail, credentials.privateKey);
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Service account token request failed with status ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error('Service account token response missing access_token');
  }

  const expiresInMs = Number(data.expires_in || 0) * 1000;
  updateTokenCache(serviceAccountTokenCache, data.access_token, expiresInMs);
  return serviceAccountTokenCache.token;
};

const fetchMetadataServerAccessToken = async () => {
  const cachedToken = getCachedToken(metadataTokenCache);
  if (cachedToken) {
    return cachedToken;
  }

  const response = await fetch(GOOGLE_METADATA_TOKEN_URL, { headers: metadataHeaders });
  if (!response.ok) {
    throw new Error(`Metadata server responded with ${response.status}`);
  }
  const data = await response.json();
  if (!data?.access_token) {
    throw new Error('Metadata server response missing access_token');
  }
  const expiresInMs = Number(data.expires_in || 0) * 1000;
  updateTokenCache(metadataTokenCache, data.access_token, expiresInMs);
  return metadataTokenCache.token;
};

const fetchGoogleAccessToken = async () => {
  let serviceAccountError = null;
  const credentials = await loadServiceAccountCredentials();
  if (credentials) {
    try {
      return await requestServiceAccountAccessToken(credentials);
    } catch (error) {
      serviceAccountError = error;
      logMultilingual(
        'warn',
        'Failed to obtain Cloud Storage access token using service account credentials. Falling back to the metadata server.',
        '서비스 계정 자격 증명으로 Cloud Storage 액세스 토큰을 받지 못해 메타데이터 서버를 사용합니다.',
        error,
      );
    }
  }

  try {
    return await fetchMetadataServerAccessToken();
  } catch (metadataError) {
    if (serviceAccountError) {
      throw new Error(
        `Service account token request failed (${serviceAccountError.message}); metadata server request failed (${metadataError.message})`,
      );
    }
    throw new Error(`Failed to obtain Google Cloud access token: ${metadataError.message}`);
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
    logMultilingual(
      'error',
      'Failed to load persisted state from Google Cloud Storage. Confirm the service account has storage.objects.get access and that the metadata server is reachable.',
      'Google Cloud Storage에서 상태를 불러오지 못했습니다. 서비스 계정에 storage.objects.get 권한이 있는지와 메타데이터 서버에 접근 가능한지 확인하세요.',
      err,
    );
    logMultilingual(
      'warn',
      'Falling back to local data/state.json after Cloud Storage error.',
      'Cloud Storage 오류로 인해 data/state.json 파일을 사용합니다.',
    );
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
        logMultilingual(
          'error',
          'Failed to write persisted state to Google Cloud Storage. Ensure the service account has storage.objects.create access and the bucket exists.',
          'Google Cloud Storage에 상태를 기록하지 못했습니다. 서비스 계정에 storage.objects.create 권한이 있는지와 대상 버킷이 존재하는지 확인하세요.',
          err,
        );
        logMultilingual(
          'warn',
          'Falling back to local data/state.json after Cloud Storage error.',
          'Cloud Storage 오류로 인해 data/state.json 파일을 사용합니다.',
        );
      }
    }
    await saveToFileSystem(payload);
  };

  writeQueue = writeQueue.catch(() => undefined).then(persist);
  return writeQueue;
};
