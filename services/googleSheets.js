import crypto from 'node:crypto';

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_SAFETY_MARGIN_MS = 60_000; // 60 seconds

let cachedToken = { token: null, expiresAt: 0 };

const callFetch = (...args) => {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available for Google Sheets integration.');
  }
  return fetch(...args);
};

const base64UrlEncode = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const getPrivateKey = () => {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!raw) return null;
  return raw.includes('-----BEGIN PRIVATE KEY-----') ? raw.replace(/\\n/g, '\n') : raw;
};

export const isSheetsConfigured = () =>
  Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      getPrivateKey() &&
      process.env.GOOGLE_SHEETS_ID,
  );

const createJwtAssertion = () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = getPrivateKey();
  if (!email || !privateKey) {
    throw new Error('Google Sheets service account credentials are not fully configured.');
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: email,
    scope: SHEETS_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${encodedHeader}.${encodedPayload}`);
  const signature = signer.sign(privateKey);
  const encodedSignature = base64UrlEncode(signature);
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
};

const requestAccessToken = async () => {
  const assertion = createJwtAssertion();
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const response = await callFetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OAuth token request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('Google OAuth response did not include an access token.');
  }

  const expiresIn = Number(data.expires_in || 0) * 1000;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(0, expiresIn - TOKEN_SAFETY_MARGIN_MS),
  };

  return cachedToken.token;
};

const getAccessToken = async () => {
  if (cachedToken.token && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  return requestAccessToken();
};

const formatRange = () => {
  const range = process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:G';
  return encodeURIComponent(range);
};

export const appendSpreadsheetRow = async (values) => {
  if (!isSheetsConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const token = await getAccessToken();
    const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    const range = formatRange();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const response = await callFetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [values] }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Sheets append failed (${response.status}): ${text}`);
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to append row to Google Sheets:', message);
    return { ok: false, reason: 'request_failed', error: message };
  }
};

export const resetSheetsTokenCache = () => {
  cachedToken = { token: null, expiresAt: 0 };
};
