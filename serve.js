import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { appendSpreadsheetRow, isSheetsConfigured } from './services/googleSheets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? 8080);
const ADMIN_SECRETS = new Set(
  [process.env.ADMIN_SECRET, 'Ckdgml9788@']
    .filter((token) => typeof token === 'string' && token.trim().length > 0)
    .map((token) => token.trim()),
);

const MAX_LOGS = 200;
const MAX_SIGNAL_HISTORY = 100;
const VISITOR_TTL_MS = 5 * 60 * 1000;
const SIGNAL_RECIPIENT_TTL_MS = 3 * 60 * 1000;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const nowIso = () => new Date().toISOString();
const randomId = (prefix = 'id') => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

const normalizeIndicator = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const logs = [];
const strategies = new Map();
const adminSignals = new Map();
const users = new Map();
const userSignals = new Map();
const userPositions = new Map();
const userConnections = new Map();
const visitorSessions = new Map();
const signalRecipientActivity = new Map();

const metricsState = {
  lastVisitAt: null,
  lastWebhook: null,
  lastGoogleSheetsSync: null,
};

const webhook = {
  url: null,
  secret: null,
  createdAt: null,
  updatedAt: null,
  routes: new Set(),
};

const addLog = (level, message) => {
  const entry = { id: randomId('log'), timestamp: nowIso(), level, message };
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
};

const createStrategyRecord = (id, name, description, aliases = []) => {
  const createdAt = nowIso();
  const record = {
    id,
    name,
    description,
    active: true,
    createdAt,
    updatedAt: createdAt,
    aliases: new Set([name, id, ...aliases].map((alias) => normalizeIndicator(String(alias)))),
  };
  strategies.set(id, record);
  adminSignals.set(id, []);
  return record;
};

const cloneStrategyForClient = (strategy) => ({
  id: strategy.id,
  name: strategy.name,
  description: strategy.description,
  active: strategy.active,
  createdAt: strategy.createdAt,
  updatedAt: strategy.updatedAt,
});

const matchStrategyByIndicator = (indicator) => {
  if (!indicator) return null;
  const normalised = normalizeIndicator(String(indicator));
  for (const strategy of strategies.values()) {
    if (strategy.aliases.has(normalised)) {
      return strategy;
    }
  }
  return null;
};

const parseDirection = (value) => {
  const raw = String(value ?? '').toLowerCase();
  const action = raw.includes('close') || raw.includes('exit') ? 'close' : 'open';
  let side = 'long';
  if (raw.includes('short') || raw.includes('sell')) {
    side = 'short';
  } else if (raw.includes('long') || raw.includes('buy')) {
    side = 'long';
  }
  return { action, side };
};

const addAdminSignal = (strategyId, entry) => {
  const bucket = adminSignals.get(strategyId) ?? [];
  bucket.push(entry);
  if (bucket.length > MAX_SIGNAL_HISTORY) {
    bucket.splice(0, bucket.length - MAX_SIGNAL_HISTORY);
  }
  adminSignals.set(strategyId, bucket);
};

const addUserSignal = (uid, signal) => {
  const bucket = userSignals.get(uid) ?? [];
  bucket.push(signal);
  if (bucket.length > MAX_SIGNAL_HISTORY) {
    bucket.splice(0, bucket.length - MAX_SIGNAL_HISTORY);
  }
  userSignals.set(uid, bucket);
};

const deliverSignalToUsers = (strategy, signal) => {
  const recipients = [];
  for (const user of users.values()) {
    if (user.status !== 'approved') continue;
    if (!user.approvedStrategies.includes(strategy.id)) continue;

    const deliveredSignal = {
      ...signal,
      strategyId: strategy.id,
      indicator: signal.indicator ?? strategy.name,
      status: signal.status ?? 'delivered',
      autoTradingExecuted: Boolean(user.autoTradingEnabled),
    };
    addUserSignal(user.uid, deliveredSignal);
    recipients.push(user.uid);
  }
  return { delivered: recipients.length, recipients };
};

const cleanupVisitorSessions = (now = Date.now()) => {
  for (const [sessionId, session] of visitorSessions.entries()) {
    if (now - session.lastSeen > VISITOR_TTL_MS) {
      visitorSessions.delete(sessionId);
    }
  }
};

const cleanupSignalRecipientActivity = (now = Date.now()) => {
  for (const [uid, timestamp] of signalRecipientActivity.entries()) {
    if (now - timestamp > SIGNAL_RECIPIENT_TTL_MS) {
      signalRecipientActivity.delete(uid);
    }
  }
};

const getActiveVisitorCount = (now = Date.now()) => {
  cleanupVisitorSessions(now);
  return visitorSessions.size;
};

const getActiveSignalRecipientCount = (now = Date.now()) => {
  cleanupSignalRecipientActivity(now);
  return signalRecipientActivity.size;
};

const formatInTimeZone = (date, timeZone, options) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, ...options }).format(date);

const formatKstDate = (value) => formatInTimeZone(value, 'Asia/Seoul', { year: 'numeric', month: '2-digit', day: '2-digit' });

const formatKstTime = (value) =>
  formatInTimeZone(value, 'Asia/Seoul', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

const verifyAdminToken = (token) => token && ADMIN_SECRETS.has(token.trim());

const requireAdmin = (req, res, next) => {
  const token = req.get('x-admin-token') || '';
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ ok: false, message: 'Invalid administrator token.' });
  }
  return next();
};

const buildWebhookUrl = (req, secret) => {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto ? forwardedProto.split(',')[0] : req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${protocol}://${host}/webhook/${secret}`;
};


app.get('/api/strategies', (req, res) => {
  const list = Array.from(strategies.values()).map(cloneStrategyForClient);
  res.json({ strategies: list });
});

app.get('/api/logs', (req, res) => {
  res.json({ logs });
});

app.post('/api/register', (req, res) => {
  const { uid, strategies: requested } = req.body || {};
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ ok: false, message: 'UID is required.' });
  }
  const candidateStrategies = Array.isArray(requested)
    ? requested
        .map((id) => String(id))
        .filter((id) => strategies.has(id))
    : [];

  const existing = users.get(uid);
  if (existing) {
    existing.status = 'pending';
    existing.requestedStrategies = candidateStrategies;
    existing.updatedAt = nowIso();
    users.set(uid, existing);
    addLog('info', `[REGISTER] Updated registration request for UID ${uid}.`);
    return res.json({ ok: true, status: existing.status });
  }

  const createdAt = nowIso();
  const userRecord = {
    uid,
    status: 'pending',
    requestedStrategies: candidateStrategies,
    approvedStrategies: [],
    accessKey: null,
    autoTradingEnabled: false,
    createdAt,
    updatedAt: createdAt,
    approvedAt: null,
  };
  users.set(uid, userRecord);
  userSignals.set(uid, []);
  userPositions.set(uid, []);
  addLog('info', `[REGISTER] Received new registration from UID ${uid}.`);
  return res.json({ ok: true, status: userRecord.status });
});

const toNamedStrategies = (ids = []) =>
  ids.map((id) => ({ id, name: strategies.get(id)?.name ?? id }));

app.get('/api/user/status', (req, res) => {
  const uid = req.query.uid ? String(req.query.uid) : '';
  if (!uid) {
    return res.status(400).json({ status: 'not_registered' });
  }
  const record = users.get(uid);
  if (!record) {
    return res.json({ status: 'not_registered' });
  }
  return res.json({
    status: record.status,
    accessKey: record.accessKey,
    requestedStrategies: toNamedStrategies(record.requestedStrategies),
    approvedStrategies: toNamedStrategies(record.approvedStrategies),
    autoTradingEnabled: Boolean(record.autoTradingEnabled),
  });
});

const verifyUserAccess = (uid, key) => {
  if (!uid || !key) return null;
  const record = users.get(uid);
  if (!record || record.status !== 'approved') return null;
  if (record.accessKey !== key) return null;
  return record;
};

app.get('/api/user/signals', (req, res) => {
  const uid = req.query.uid ? String(req.query.uid) : '';
  const key = req.query.key ? String(req.query.key) : '';
  const user = verifyUserAccess(uid, key);
  if (!user) {
    return res.status(403).json({ ok: false, message: 'Invalid credentials.' });
  }
  const signalsForUser = userSignals.get(uid) ?? [];
  const payload = signalsForUser.slice();
  userSignals.set(uid, []);
  return res.json({ signals: payload });
});

app.get('/api/positions', (req, res) => {
  const uid = req.query.uid ? String(req.query.uid) : '';
  const key = req.query.key ? String(req.query.key) : '';
  const user = verifyUserAccess(uid, key);
  if (!user) {
    return res.status(403).json({ ok: false, message: 'Invalid credentials.' });
  }
  const positions = userPositions.get(uid) ?? [];
  return res.json({ positions });
});

const sampleAccounts = {
  futures: {
    total: 18750.32,
    available: 12200.12,
    positionMargin: 4200.54,
    orderMargin: 850.12,
    unrealisedPnl: 420.83,
    currency: 'USDT',
  },
  spot: [
    { currency: 'USDT', available: 6200, locked: 0, total: 6200 },
    { currency: 'BTC', available: 0.42, locked: 0.02, total: 0.44 },
  ],
  margin: [
    {
      currencyPair: 'BTC/USDT',
      base: { currency: 'BTC', available: 0.12, locked: 0, borrowed: 0, interest: 0 },
      quote: { currency: 'USDT', available: 3100, locked: 0, borrowed: 0, interest: 0 },
      risk: 12.4,
    },
  ],
  options: {
    total: 2400,
    available: 1800,
    positionValue: 450,
    orderMargin: 120,
    unrealisedPnl: 80,
  },
  totalEstimatedValue: 27350.15,
};

app.post('/api/connect', (req, res) => {
  const { uid, accessKey, apiKey, apiSecret } = req.body || {};
  if (!uid || !accessKey || !apiKey || !apiSecret) {
    return res.status(400).json({ ok: false, message: 'Missing credentials.' });
  }
  const user = verifyUserAccess(String(uid), String(accessKey));
  if (!user) {
    return res.status(403).json({ ok: false, message: 'UID is not approved yet.' });
  }
  userConnections.set(uid, {
    connected: true,
    lastConnectedAt: nowIso(),
    accounts: sampleAccounts,
  });
  addLog('info', `[API] Connected user ${uid} with provided API key.`);
  return res.json({
    ok: true,
    connected: true,
    accounts: sampleAccounts,
    positions: userPositions.get(uid) ?? [],
    autoTradingEnabled: Boolean(user.autoTradingEnabled),
  });
});

app.post('/api/disconnect', (req, res) => {
  const { uid } = req.body || {};
  if (uid && userConnections.has(uid)) {
    userConnections.set(uid, { ...userConnections.get(uid), connected: false });
    addLog('info', `[API] Disconnected user ${uid}.`);
  }
  res.json({ ok: true });
});

app.get('/api/accounts/all', (req, res) => {
  const uid = req.query.uid ? String(req.query.uid) : '';
  const key = req.query.key ? String(req.query.key) : '';
  const user = verifyUserAccess(uid, key);
  if (!user) {
    return res.status(403).json({ ok: false, message: 'Invalid credentials.' });
  }
  res.json(sampleAccounts);
});

app.post('/api/trading/auto', (req, res) => {
  const { uid, accessKey, enabled } = req.body || {};
  const user = verifyUserAccess(String(uid), String(accessKey));
  if (!user) {
    return res.status(403).json({ ok: false, message: 'Invalid credentials.' });
  }
  user.autoTradingEnabled = Boolean(enabled);
  user.updatedAt = nowIso();
  users.set(user.uid, user);
  addLog('info', `[AUTO] ${user.uid} set auto-trading ${user.autoTradingEnabled ? 'enabled' : 'disabled'}.`);
  return res.json({ ok: true, autoTradingEnabled: user.autoTradingEnabled });
});

app.post('/api/metrics/visit', async (req, res) => {
  const now = Date.now();
  const isoNow = new Date(now).toISOString();
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === 'string'
    ? forwardedFor.split(',')[0].trim()
    : req.ip;

  let { sessionId, path: visitedPath, referrer } = req.body || {};
  let normalizedSession = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!normalizedSession) {
    normalizedSession = randomId('visit');
  }
  if (normalizedSession.length > 80) {
    normalizedSession = normalizedSession.slice(0, 80);
  }

  const existing = visitorSessions.get(normalizedSession);
  const record = {
    firstSeen: existing?.firstSeen ?? now,
    lastSeen: now,
    path: typeof visitedPath === 'string' ? visitedPath.slice(0, 200) : '/',
    referrer: typeof referrer === 'string' ? referrer.slice(0, 200) : '',
    userAgent: req.get('user-agent') || existing?.userAgent || '',
    ip: clientIp || existing?.ip || '',
    lastLoggedAt: existing?.lastLoggedAt ?? 0,
  };

  visitorSessions.set(normalizedSession, record);
  metricsState.lastVisitAt = isoNow;
  cleanupVisitorSessions(now);

  let sheetResult = { ok: false, reason: 'skipped' };
  const shouldLogToSheets = !existing || now - (existing.lastLoggedAt ?? 0) >= 10 * 60 * 1000;
  if (shouldLogToSheets) {
    const eventDate = new Date(now);
    const kstDate = formatKstDate(eventDate);
    const kstTime = formatKstTime(eventDate);
    if (isSheetsConfigured()) {
      sheetResult = await appendSpreadsheetRow([
        kstDate,
        kstTime,
        normalizedSession,
        record.path,
        record.referrer || '',
        record.userAgent,
        record.ip,
      ]);
      metricsState.lastGoogleSheetsSync = {
        timestamp: isoNow,
        status: sheetResult.ok ? 'success' : 'error',
        error: sheetResult.ok ? null : sheetResult.error || sheetResult.reason || 'unknown error',
      };
    } else {
      metricsState.lastGoogleSheetsSync = {
        timestamp: isoNow,
        status: 'disabled',
        error: null,
      };
    }
    record.lastLoggedAt = now;
    visitorSessions.set(normalizedSession, record);
  } else if (!metricsState.lastGoogleSheetsSync) {
    metricsState.lastGoogleSheetsSync = {
      timestamp: isoNow,
      status: isSheetsConfigured() ? 'pending' : 'disabled',
      error: null,
    };
  }

  if (!existing) {
    addLog('info', `[VISIT] Recorded new visitor session ${normalizedSession} (${record.path})`);
  }

  res.json({
    ok: true,
    sessionId: normalizedSession,
    activeVisitors: getActiveVisitorCount(now),
    sheets: metricsState.lastGoogleSheetsSync,
  });
});

app.post('/api/positions/close', (req, res) => {
  const { uid, accessKey, contract } = req.body || {};
  const user = verifyUserAccess(String(uid), String(accessKey));
  if (!user) {
    return res.status(403).json({ ok: false, message: 'Invalid credentials.' });
  }
  if (!contract) {
    return res.status(400).json({ ok: false, message: 'Contract is required.' });
  }
  const positions = userPositions.get(user.uid) ?? [];
  const nextPositions = positions.filter((position) => position.contract !== contract);
  userPositions.set(user.uid, nextPositions);
  addLog('info', `[POSITION] Closed ${contract} for UID ${user.uid}.`);
  return res.json({ ok: true });
});

const adminRouter = express.Router();
adminRouter.use(requireAdmin);

adminRouter.get('/overview', (req, res) => {
  const userList = Array.from(users.values()).map((user) => ({
    uid: user.uid,
    status: user.status,
    requestedStrategies: user.requestedStrategies.slice(),
    approvedStrategies: user.approvedStrategies.slice(),
    accessKey: user.accessKey,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    approvedAt: user.approvedAt,
  }));
  const strategyList = Array.from(strategies.values()).map(cloneStrategyForClient);
  const stats = {
    totalUsers: userList.length,
    pending: userList.filter((item) => item.status === 'pending').length,
    approved: userList.filter((item) => item.status === 'approved').length,
  };
  res.json({ users: userList, strategies: strategyList, stats });
});

adminRouter.get('/signals', (req, res) => {
  const strategyId = req.query.strategy ? String(req.query.strategy) : '';
  if (!strategyId) {
    return res.status(400).json({ ok: false, message: 'Strategy id is required.' });
  }
  const signalsForStrategy = adminSignals.get(strategyId) ?? [];
  res.json({ signals: signalsForStrategy.slice().reverse() });
});

adminRouter.get('/metrics', (req, res) => {
  const now = Date.now();
  const webhookReady = Boolean(webhook.secret && webhook.url && webhook.routes.size);
  const issues = [];
  if (!webhook.secret) {
    issues.push('웹훅 비밀 키가 생성되지 않았습니다.');
  }
  if (!webhook.url) {
    issues.push('웹훅 URL이 생성되지 않았습니다.');
  }
  if (!webhook.routes.size) {
    issues.push('전달 대상 전략이 비어 있습니다.');
  }

  const lastSheets = metricsState.lastGoogleSheetsSync;

  res.json({
    visitors: {
      active: getActiveVisitorCount(now),
      totalSessions: visitorSessions.size,
      lastVisitAt: metricsState.lastVisitAt,
    },
    signalRecipients: {
      active: getActiveSignalRecipientCount(now),
      lastSignalAt: metricsState.lastWebhook?.timestamp ?? null,
      lastDeliveredCount: metricsState.lastWebhook?.delivered ?? 0,
    },
    webhook: {
      ready: webhookReady,
      issues,
      routes: Array.from(webhook.routes),
      lastSignal: metricsState.lastWebhook,
    },
    googleSheets: {
      configured: isSheetsConfigured(),
      lastStatus: lastSheets?.status ?? (isSheetsConfigured() ? 'pending' : 'disabled'),
      lastSyncAt: lastSheets?.timestamp ?? null,
      lastError: lastSheets?.error ?? null,
    },
  });
});

adminRouter.get('/webhook', (req, res) => {
  if (!webhook.url || !webhook.secret) {
    return res.status(404).json({ ok: false, message: 'Webhook not configured.' });
  }
  res.json({
    url: webhook.url,
    secret: webhook.secret,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
    routes: Array.from(webhook.routes),
  });
});

adminRouter.post('/webhook', (req, res) => {
  const secret = randomId('wh');
  webhook.secret = secret;
  webhook.url = buildWebhookUrl(req, secret);
  webhook.createdAt = webhook.createdAt ?? nowIso();
  webhook.updatedAt = nowIso();
  if (!webhook.routes.size) {
    webhook.routes = new Set(Array.from(strategies.keys()));
  }
  addLog('info', '[WEBHOOK] Generated new webhook credentials.');
  res.json({
    url: webhook.url,
    secret: webhook.secret,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
    routes: Array.from(webhook.routes),
  });
});

adminRouter.put('/webhook/routes', (req, res) => {
  const { strategies: selected } = req.body || {};
  if (!Array.isArray(selected)) {
    return res.status(400).json({ ok: false, message: 'Invalid strategy list.' });
  }
  webhook.routes = new Set(selected.filter((id) => strategies.has(String(id))).map(String));
  webhook.updatedAt = nowIso();
  addLog('info', `[WEBHOOK] Updated delivery routes: ${Array.from(webhook.routes).join(', ') || 'none'}.`);
  res.json({ ok: true, routes: Array.from(webhook.routes) });
});

adminRouter.post('/users/approve', (req, res) => {
  const { uid, strategies: selected } = req.body || {};
  if (!uid || !Array.isArray(selected) || selected.length === 0) {
    return res.status(400).json({ ok: false, message: 'UID and at least one strategy are required.' });
  }
  const user = users.get(uid);
  if (!user) {
    return res.status(404).json({ ok: false, message: 'User not found.' });
  }
  const approved = Array.from(new Set(selected.map(String).filter((id) => strategies.has(id))));
  if (!approved.length) {
    return res.status(400).json({ ok: false, message: 'No valid strategies selected.' });
  }
  user.status = 'approved';
  user.requestedStrategies = approved.slice();
  user.approvedStrategies = approved;
  user.accessKey = user.accessKey || randomId('access');
  user.autoTradingEnabled = user.autoTradingEnabled ?? false;
  user.updatedAt = nowIso();
  user.approvedAt = nowIso();
  users.set(uid, user);
  addLog('info', `[ADMIN] Approved UID ${uid} with strategies: ${approved.join(', ')}.`);
  res.json({ ok: true });
});

adminRouter.post('/users/deny', (req, res) => {
  const { uid } = req.body || {};
  if (!uid) {
    return res.status(400).json({ ok: false, message: 'UID is required.' });
  }
  const user = users.get(uid);
  if (!user) {
    return res.status(404).json({ ok: false, message: 'User not found.' });
  }
  user.status = 'denied';
  user.approvedStrategies = [];
  user.accessKey = null;
  user.autoTradingEnabled = false;
  user.updatedAt = nowIso();
  users.set(uid, user);
  addLog('info', `[ADMIN] Denied UID ${uid}.`);
  res.json({ ok: true });
});

adminRouter.patch('/users/:uid/strategies', (req, res) => {
  const { uid } = req.params;
  const { strategies: selected } = req.body || {};
  if (!Array.isArray(selected) || !selected.length) {
    return res.status(400).json({ ok: false, message: 'At least one strategy must be selected.' });
  }
  const user = users.get(uid);
  if (!user) {
    return res.status(404).json({ ok: false, message: 'User not found.' });
  }
  const approved = Array.from(new Set(selected.map(String).filter((id) => strategies.has(id))));
  user.approvedStrategies = approved;
  user.updatedAt = nowIso();
  users.set(uid, user);
  addLog('info', `[ADMIN] Updated strategies for UID ${uid}: ${approved.join(', ')}.`);
  res.json({ ok: true });
});

adminRouter.patch('/strategies/:id', (req, res) => {
  const { id } = req.params;
  const strategy = strategies.get(id);
  if (!strategy) {
    return res.status(404).json({ ok: false, message: 'Strategy not found.' });
  }
  if (typeof req.body?.active === 'boolean') {
    strategy.active = req.body.active;
    strategy.updatedAt = nowIso();
    strategies.set(id, strategy);
    addLog('info', `[ADMIN] Strategy ${id} set to ${strategy.active ? 'active' : 'inactive'}.`);
  }
  res.json({ ok: true });
});

adminRouter.post('/strategies', (req, res) => {
  const { name, description } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ ok: false, message: 'Strategy name is required.' });
  }
  const id = randomId('strategy');
  const record = createStrategyRecord(id, name.trim(), description ? String(description) : undefined, [name]);
  addLog('info', `[ADMIN] Added strategy ${record.name} (${record.id}).`);
  res.json({ ok: true, strategy: cloneStrategyForClient(record) });
});

app.use('/api/admin', adminRouter);

const verifyWebhookSecret = (req) => {
  const headerSecret = req.get('x-webhook-secret');
  const querySecret = req.params.secret || req.query.secret || req.body?.secret;
  if (!webhook.secret) return false;
  return headerSecret === webhook.secret || querySecret === webhook.secret;
};

app.post(['/webhook', '/webhook/:secret'], (req, res) => {
  if (webhook.secret && !verifyWebhookSecret(req)) {
    addLog('error', '[WEBHOOK] Received payload with invalid secret');
    return res.status(403).json({ ok: false, message: 'Invalid webhook secret.' });
  }

  const { indicator, strategy: strategyName, name, symbol, ticker, direction, side, action, size, leverage } = req.body || {};
  const resolvedIndicator = indicator || strategyName || name;
  const resolvedSymbol = symbol || ticker;
  const resolvedDirection = direction || side || action;

  if (!resolvedIndicator || !resolvedSymbol || !resolvedDirection) {
    addLog('error', '[WEBHOOK] Missing indicator, symbol or direction in payload');
    return res
      .status(400)
      .json({ ok: false, message: 'Indicator, symbol, and direction are required.' });
  }

  let strategy = matchStrategyByIndicator(resolvedIndicator);
  if (!strategy && webhook.routes.size === 1) {
    const [onlyStrategy] = webhook.routes;
    strategy = strategies.get(onlyStrategy) || null;
  }

  if (!strategy) {
    addLog('warning', `[WEBHOOK] Unknown indicator '${resolvedIndicator}'.`);
    return res
      .status(202)
      .json({ ok: false, message: 'No strategy matched the incoming indicator.' });
  }

  if (webhook.routes.size && !webhook.routes.has(strategy.id)) {
    addLog('warning', `[WEBHOOK] Strategy ${strategy.id} is not currently targeted for delivery.`);
    addAdminSignal(strategy.id, {
      id: randomId('sig'),
      timestamp: nowIso(),
      action: 'ignored',
      side: 'blocked',
      symbol: resolvedSymbol,
      strategyId: strategy.id,
      status: 'blocked by admin routing',
    });
    return res.json({ ok: true, delivered: 0, message: 'Strategy not targeted.' });
  }

  const parsed = parseDirection(resolvedDirection);
  const signal = {
    id: randomId('sig'),
    timestamp: nowIso(),
    indicator: resolvedIndicator,
    symbol: resolvedSymbol,
    action: parsed.action,
    side: parsed.side,
    size: size === undefined ? undefined : Number(size),
    leverage: leverage === undefined ? undefined : Number(leverage),
  };

  const delivery = deliverSignalToUsers(strategy, signal);

  const adminRecord = {
    id: signal.id,
    timestamp: signal.timestamp,
    action: signal.action,
    side: signal.side,
    symbol: signal.symbol,
    strategyId: strategy.id,
    indicator: resolvedIndicator,
    status:
      delivery.delivered > 0
        ? `delivered to ${delivery.delivered} user${delivery.delivered === 1 ? '' : 's'}`
        : 'no approved recipients',
  };
  addAdminSignal(strategy.id, adminRecord);
  addLog(
    'info',
    `[WEBHOOK] ${resolvedIndicator} | ${resolvedSymbol} | ${signal.action.toUpperCase()} ${signal.side.toUpperCase()} → ${delivery.delivered} user(s)`,
  );

  if (delivery.recipients.length) {
    const now = Date.now();
    delivery.recipients.forEach((uid) => signalRecipientActivity.set(uid, now));
    cleanupSignalRecipientActivity(now);
  }
  metricsState.lastWebhook = {
    timestamp: signal.timestamp,
    indicator: resolvedIndicator,
    symbol: resolvedSymbol,
    action: signal.action,
    side: signal.side,
    delivered: delivery.delivered,
    strategyId: strategy.id,
    strategyName: strategy.name,
  };

  res.json({ ok: true, delivered: delivery.delivered });
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  addLog('info', `Server successfully started on http://0.0.0.0:${PORT}`);
  console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
