import crypto from 'node:crypto';

const trimTrailingSlash = (value) => String(value).replace(/\/+$/, '');

const DEFAULT_MAINNET_BASE = trimTrailingSlash(process.env.GATE_MAINNET_API_BASE || 'https://api.gateio.ws');
const DEFAULT_TESTNET_BASE = trimTrailingSlash(
  process.env.GATE_TESTNET_API_BASE || 'https://fx-api-testnet.gateio.ws',
);

const API_PREFIX = '/api/v4';
const STABLE_COINS = new Set(['USDT', 'USD', 'USDG', 'USDC', 'USDTE']);

export class GateApiError extends Error {
  constructor(message, { status = null, body = null } = {}) {
    super(message);
    this.name = 'GateApiError';
    this.status = status;
    this.body = body;
  }
}

const GATE_AUTH_ERROR_PATTERNS = [
  'invalid key',
  'invalid api key',
  'invalid apikey',
  'invalid api-key',
  'invalid secret',
  'invalid signature',
  'signature mismatch',
  'invalid sign',
  'invalid credential',
  'invalid credentials',
  'invalid access key',
  'api key not found',
  'api key does not exist',
  'api key not exist',
  'api key not exists',
  'api_key not exist',
  'api_key not exists',
  'apikey not exist',
  'apikey not exists',
  'key not exist',
  'key not exists',
  'key not found',
  'access key not exist',
  'access key not exists',
  'access key not found',
  'key does not exist',
  'no such api key',
  'no such key',
  'account_not_exists',
  'account not exists',
  'account does not exist',
  'account not found',
  'subaccount not found',
  'sub-account not found',
  'user does not exist',
];

const includesCredentialPattern = (text) => {
  if (!text) {
    return false;
  }
  const normalised = text.toLowerCase();
  return GATE_AUTH_ERROR_PATTERNS.some((pattern) => normalised.includes(pattern));
};

export const isGateCredentialError = (error) => {
  if (!(error instanceof GateApiError)) {
    return false;
  }

  const status = typeof error.status === 'number' ? error.status : null;
  if (status === 401 || status === 403) {
    return true;
  }

  const message = String(error.message || '');
  const body = typeof error.body === 'string' ? error.body : '';
  if (includesCredentialPattern(`${message} ${body}`)) {
    return true;
  }

  if (status === 400 || status === 404) {
    return includesCredentialPattern(message) || includesCredentialPattern(body);
  }

  return false;
};

const safeNumber = (value) => {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const sanitized = value.trim();
    if (!sanitized) {
      return 0;
    }
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const parseRiskRatio = (value) => {
  if (value === null || value === undefined) {
    return 0;
  }
  let numeric;
  if (typeof value === 'string') {
    const cleaned = value.replace(/%/g, '').trim();
    numeric = safeNumber(cleaned);
    if (cleaned && Number.isFinite(numeric) && cleaned.includes('%')) {
      numeric /= 100;
    }
  } else {
    numeric = safeNumber(value);
  }
  if (numeric > 10) {
    return numeric / 100;
  }
  return numeric;
};

const normaliseCurrency = (value) => String(value || '').toUpperCase();

const getBaseUrl = (isTestnet) => (isTestnet ? DEFAULT_TESTNET_BASE : DEFAULT_MAINNET_BASE);

const resolveIsTestnet = (value) => {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (normalised === 'testnet' || normalised === 'true' || normalised === '1') {
      return true;
    }
    if (normalised === 'mainnet' || normalised === 'false' || normalised === '0') {
      return false;
    }
  }
  return false;
};

const normalisePath = (value) => {
  const stringValue = String(value || '');
  if (!stringValue) {
    return '/';
  }
  return stringValue.startsWith('/') ? stringValue : `/${stringValue}`;
};

const normaliseCredential = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

const ensureCredentials = (apiKey, apiSecret) => {
  const key = normaliseCredential(apiKey);
  const secret = normaliseCredential(apiSecret);
  if (!key || !secret) {
    throw new GateApiError('Gate.io API 키와 시크릿을 입력해주세요.', { status: 401 });
  }
  return { key, secret };
};

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';

const canonicaliseJson = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonicaliseJson);
  }
  if (isPlainObject(value)) {
    const sorted = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        const entry = value[key];
        if (entry === undefined) {
          return;
        }
        sorted[key] = canonicaliseJson(entry);
      });
    return sorted;
  }
  return value;
};

const buildTimestamp = () => Math.floor(Date.now() / 1000).toString();

const serialiseBody = (body) => {
  if (body === undefined || body === null) {
    return { payload: '', contentType: null };
  }
  if (typeof body === 'string') {
    const trimmed = body.trim();
    const contentType = trimmed.startsWith('{') || trimmed.startsWith('[') ? 'application/json' : null;
    return { payload: body, contentType };
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
    return { payload: body.toString('utf8'), contentType: null };
  }
  if (body instanceof URLSearchParams) {
    return {
      payload: body.toString(),
      contentType: 'application/x-www-form-urlencoded;charset=UTF-8',
    };
  }

  let serialised;
  let contentType = 'application/json';
  const target = isPlainObject(body) || Array.isArray(body) ? canonicaliseJson(body) : body;

  try {
    serialised = JSON.stringify(target);
  } catch {
    return { payload: '', contentType: null };
  }

  if (serialised === undefined) {
    return { payload: '', contentType: null };
  }

  return { payload: serialised, contentType };
};

const buildSignature = (secret, payload) => crypto.createHmac('sha512', secret).update(payload).digest('hex');

const buildQueryString = (query) => {
  if (!query || typeof query !== 'object') {
    return '';
  }
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, val]) => {
    if (val === undefined || val === null) {
      return;
    }
    if (Array.isArray(val)) {
      val.forEach((entry) => {
        if (entry !== undefined && entry !== null) {
          params.append(key, String(entry));
        }
      });
    } else {
      params.append(key, String(val));
    }
  });
  params.sort();
  return params.toString();
};

const requestGateApi = async ({ apiKey, apiSecret, method, path, query, body, isTestnet }) => {
  const { key, secret } = ensureCredentials(apiKey, apiSecret);
  const baseUrl = getBaseUrl(resolveIsTestnet(isTestnet));
  const requestPath = `${API_PREFIX}${normalisePath(path)}`;
  const queryString = buildQueryString(query);
  const { payload, contentType } = serialiseBody(body);
  const normalisedMethod = typeof method === 'string' && method.trim() ? method.trim().toUpperCase() : 'GET';
  const timestamp = buildTimestamp();
  const normalisedQuery = queryString || '';
  const normalisedPayload = payload ?? '';
  const signaturePayload = [
    normalisedMethod,
    requestPath,
    normalisedQuery,
    normalisedPayload,
    timestamp,
  ].join('\n');
  const signature = buildSignature(secret, signaturePayload);
  const url = `${baseUrl}${requestPath}${queryString ? `?${queryString}` : ''}`;

  const headers = {
    KEY: key,
    Timestamp: timestamp,
    SIGN: signature,
    Accept: 'application/json',
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  let response;
  try {
    const requestInit = {
      method: normalisedMethod,
      headers,
    };
    if (payload && payload.length > 0) {
      requestInit.body = payload;
    } else if (typeof body === 'string' && body.length === 0) {
      requestInit.body = '';
    }
    response = await fetch(url, requestInit);
  } catch (networkError) {
    throw new GateApiError(networkError.message || 'Failed to reach Gate.io API.', { status: null });
  }

  const text = await response.text();

  if (!response.ok) {
    let message = text || `HTTP ${response.status}`;
    try {
      const parsed = text ? JSON.parse(text) : null;
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.message === 'string') {
          message = parsed.message;
        } else if (typeof parsed.label === 'string') {
          message = parsed.label;
        }
      }
    } catch {
      // Ignore JSON parse errors for error responses
    }
    throw new GateApiError(message, { status: response.status, body: text });
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (parseError) {
    throw new GateApiError('Failed to parse Gate.io API response.', {
      status: response.status,
      body: text,
    });
  }
};

const mapFuturesAccount = (data) => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const currency = normaliseCurrency(data.currency || 'USDT');
  const total = safeNumber(data.total ?? data.equity ?? data.balance ?? data.total_avail_balance);
  const available = safeNumber(data.available ?? data.available_balance ?? data.available_margin);
  const positionMargin = safeNumber(data.position_margin ?? data.positionMargin ?? data.position_margin_value);
  const orderMargin = safeNumber(data.order_margin ?? data.orderMargin ?? data.order_margin_value);
  const unrealisedPnl = safeNumber(
    data.unrealised_pnl ?? data.unrealized_pnl ?? data.unrealisedPnl ?? data.unrealizedPnl,
  );
  return {
    total,
    available,
    positionMargin,
    orderMargin,
    unrealisedPnl,
    currency,
  };
};

const mapSpotBalances = (payload) => {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .map((entry) => {
      const currency = normaliseCurrency(entry.currency);
      const available = safeNumber(entry.available ?? entry.available_balance);
      const locked = safeNumber(entry.locked ?? entry.freeze ?? entry.frozen);
      const total = available + locked;
      return {
        currency,
        available,
        locked,
        total,
      };
    })
    .filter((entry) => entry.total > 0);
};

const mapMarginAccounts = (payload) => {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.map((entry) => {
    const currencyPair = String(entry.currency_pair || entry.currencyPair || '');
    const [baseCurrency = '', quoteCurrency = ''] = currencyPair.split('_');

    const base = entry.base || entry.base_currency || {};
    const quote = entry.quote || entry.quote_currency || {};

    const baseCurrencyCode = normaliseCurrency(base.currency || baseCurrency);
    const quoteCurrencyCode = normaliseCurrency(quote.currency || quoteCurrency);

    return {
      currencyPair: currencyPair || `${baseCurrencyCode}/${quoteCurrencyCode}`,
      base: {
        currency: baseCurrencyCode,
        available: safeNumber(base.available ?? base.available_balance),
        locked: safeNumber(base.locked ?? base.freeze ?? base.frozen),
        borrowed: safeNumber(base.borrowed ?? base.borrowed_amount),
        interest: safeNumber(base.interest ?? base.interest_unpaid ?? base.accrued_interest),
      },
      quote: {
        currency: quoteCurrencyCode,
        available: safeNumber(quote.available ?? quote.available_balance),
        locked: safeNumber(quote.locked ?? quote.freeze ?? quote.frozen),
        borrowed: safeNumber(quote.borrowed ?? quote.borrowed_amount),
        interest: safeNumber(quote.interest ?? quote.interest_unpaid ?? quote.accrued_interest),
      },
      risk: parseRiskRatio(entry.risk ?? entry.risk_rate ?? entry.margin_ratio ?? entry.liability_rate),
    };
  });
};

const mapOptionsAccount = (data) => {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const total = safeNumber(data.total ?? data.total_value ?? data.value);
  const available = safeNumber(data.available ?? data.available_balance);
  const positionValue = safeNumber(data.position_value ?? data.positionValue);
  const orderMargin = safeNumber(data.order_margin ?? data.orderMargin);
  const unrealisedPnl = safeNumber(
    data.unrealised_pnl ?? data.unrealized_pnl ?? data.unrealisedPnl ?? data.unrealizedPnl,
  );
  return {
    total,
    available,
    positionValue,
    orderMargin,
    unrealisedPnl,
  };
};

const mapFuturesPosition = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const contract = String(entry.contract || entry.symbol || entry.name || '');
  const sizeRaw = safeNumber(entry.size ?? entry.size_value ?? entry.quantity);
  if (!contract || sizeRaw === 0) {
    return null;
  }
  const entryPrice = safeNumber(entry.entry_price ?? entry.entryPrice);
  const markPrice = safeNumber(entry.mark_price ?? entry.markPrice ?? entry.last_price);
  const margin = safeNumber(entry.margin ?? entry.position_margin ?? entry.initial_margin);
  const unrealisedPnl = safeNumber(
    entry.unrealised_pnl ?? entry.unrealized_pnl ?? entry.unrealisedPnl ?? entry.unrealizedPnl,
  );
  const leverage = safeNumber(entry.leverage ?? entry.leverage_ratio ?? entry.leverage_number);
  const side = sizeRaw >= 0 ? 'long' : 'short';
  const absSize = Math.abs(sizeRaw);
  const value = absSize && markPrice ? absSize * markPrice : 0;
  const pnlPercentage = margin ? (unrealisedPnl / margin) * 100 : 0;

  return {
    contract,
    size: sizeRaw,
    side,
    leverage,
    margin,
    pnl: unrealisedPnl,
    pnlPercentage,
    entryPrice,
    markPrice,
    value,
  };
};

const aggregateTotalValue = (accounts) => {
  let total = 0;
  if (accounts.futures) {
    total += accounts.futures.total || 0;
  }
  accounts.spot.forEach((balance) => {
    if (STABLE_COINS.has(balance.currency)) {
      total += balance.total;
    }
  });
  accounts.margin.forEach((margin) => {
    if (STABLE_COINS.has(margin.quote.currency)) {
      const available = margin.quote.available + margin.quote.locked;
      const liabilities = margin.quote.borrowed + margin.quote.interest;
      total += available - liabilities;
    }
  });
  if (accounts.options) {
    total += accounts.options.total || 0;
  }
  return total;
};

export const fetchGateAccounts = async ({ apiKey, apiSecret, isTestnet }) => {
  const accounts = {
    futures: null,
    spot: [],
    margin: [],
    options: null,
    totalEstimatedValue: 0,
  };

  let successfulRequests = 0;
  let authenticationFailure = false;

  const handleError = (label, error) => {
    if (isGateCredentialError(error)) {
      authenticationFailure = true;
    }
    console.error(`[Gate.io] Failed to load ${label}:`, error?.message || error);
  };

  try {
    const futuresRaw = await requestGateApi({
      apiKey,
      apiSecret,
      isTestnet,
      method: 'GET',
      path: '/futures/usdt/accounts',
    });
    successfulRequests += 1;
    const futuresAccount = mapFuturesAccount(futuresRaw);
    if (futuresAccount) {
      accounts.futures = futuresAccount;
    }
  } catch (error) {
    handleError('futures account', error);
  }

  try {
    const spotRaw = await requestGateApi({
      apiKey,
      apiSecret,
      isTestnet,
      method: 'GET',
      path: '/spot/accounts',
    });
    successfulRequests += 1;
    accounts.spot = mapSpotBalances(spotRaw);
  } catch (error) {
    handleError('spot balances', error);
  }

  try {
    const marginRaw = await requestGateApi({
      apiKey,
      apiSecret,
      isTestnet,
      method: 'GET',
      path: '/margin/accounts',
    });
    successfulRequests += 1;
    accounts.margin = mapMarginAccounts(marginRaw);
  } catch (error) {
    handleError('margin accounts', error);
  }

  try {
    const optionsRaw = await requestGateApi({
      apiKey,
      apiSecret,
      isTestnet,
      method: 'GET',
      path: '/options/accounts',
    });
    successfulRequests += 1;
    const mappedOptions = Array.isArray(optionsRaw)
      ? optionsRaw.map(mapOptionsAccount).filter(Boolean)
      : [mapOptionsAccount(optionsRaw)].filter(Boolean);
    if (mappedOptions.length) {
      accounts.options = mappedOptions[0];
    }
  } catch (error) {
    handleError('options accounts', error);
  }

  accounts.totalEstimatedValue = aggregateTotalValue(accounts);

  if (!successfulRequests && authenticationFailure) {
    throw new GateApiError('Gate.io API 인증에 실패했습니다. API 키 권한을 확인해주세요.', {
      status: 403,
    });
  }

  if (!successfulRequests && !authenticationFailure) {
    throw new GateApiError('Gate.io 계정 정보를 불러오지 못했습니다.', {
      status: 502,
    });
  }

  return accounts;
};

export const fetchGatePositions = async ({ apiKey, apiSecret, isTestnet }) => {
  const settleCurrencies = ['usdt', 'usd', 'btc'];
  const positions = [];
  let successfulResponses = 0;
  let authenticationFailure = false;

  for (const settle of settleCurrencies) {
    try {
      const response = await requestGateApi({
        apiKey,
        apiSecret,
        isTestnet,
        method: 'GET',
        path: `/futures/${settle}/positions`,
      });
      successfulResponses += 1;
      if (Array.isArray(response)) {
        const mapped = response
          .map(mapFuturesPosition)
          .filter((position) => position && position.size !== 0);
        if (mapped.length) {
          positions.push(...mapped);
        }
      }
    } catch (error) {
      if (error instanceof GateApiError && error.status === 404) {
        continue;
      }
      if (isGateCredentialError(error)) {
        authenticationFailure = true;
      }
      console.error(`[Gate.io] Failed to load ${settle.toUpperCase()} futures positions:`, error?.message || error);
    }
  }

  if (!successfulResponses && authenticationFailure) {
    throw new GateApiError('선물 포지션 정보를 불러올 권한이 없습니다.', { status: 403 });
  }

  return positions;
};

export const fetchGateSnapshot = async ({ apiKey, apiSecret, isTestnet }) => {
  const targetIsTestnet = resolveIsTestnet(isTestnet);
  const network = targetIsTestnet ? 'testnet' : 'mainnet';
  const baseUrl = getBaseUrl(targetIsTestnet);
  const accounts = await fetchGateAccounts({ apiKey, apiSecret, isTestnet: targetIsTestnet });
  let positions = [];
  try {
    positions = await fetchGatePositions({ apiKey, apiSecret, isTestnet: targetIsTestnet });
  } catch (error) {
    console.error('[Gate.io] Failed to fetch futures positions snapshot:', error?.message || error);
  }
  return { accounts, positions, network, baseUrl };
};
