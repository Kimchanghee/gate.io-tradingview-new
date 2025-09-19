import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 8080);
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin-secret';
const PUBLIC_URL = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.trim() : '';
const MAX_LOGS = 300;
const MAX_SIGNALS_PER_STRATEGY = 250;
const MAX_SIGNALS_PER_USER = 200;
const MAX_POSITIONS_PER_USER = 24;

console.log(`Starting server on port ${PORT}...`);

app.use(express.json({ limit: '1mb' }));

const nowIso = () => new Date().toISOString();
const randomId = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const maskKey = (value) => {
  if (!value) return null;
  if (value.length <= 6) {
    return `${value[0]}***${value[value.length - 1]}`;
  }
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
};

const clampList = (list, limit) => {
  if (list.length > limit) {
    list.length = limit;
  }
};

const store = {
  logs: [],
  strategies: new Map(),
  users: new Map(),
  adminSignals: new Map(),
  userSignals: new Map(),
  webhook: {
    secret: null,
    createdAt: null,
    updatedAt: null,
    routes: new Set(),
  },
};

const addLog = (level, message) => {
  const entry = { id: randomId('log'), timestamp: nowIso(), level, message };
  store.logs.unshift(entry);
  clampList(store.logs, MAX_LOGS);
  return entry;
};

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    console.error('Invalid JSON payload received', err.message);
    addLog('error', `[HTTP] Invalid JSON body for ${req.method} ${req.path}`);
    return res.status(400).json({ message: 'Invalid JSON payload.' });
  }
  return next(err);
});

const ensureWebhookSecret = () => {
  if (!store.webhook.secret) {
    const provided = process.env.ADMIN_WEBHOOK_SECRET?.trim();
    const secret = provided || crypto.randomUUID();
    const now = nowIso();
    store.webhook.secret = secret;
    store.webhook.createdAt = now;
    store.webhook.updatedAt = now;
    addLog('info', '[INIT] Generated webhook secret');
  }
};

const listStrategies = () =>
  Array.from(store.strategies.values()).sort((a, b) => a.name.localeCompare(b.name));

const sanitizeStrategyIds = (ids, { includeInactive = false } = {}) => {
  if (!Array.isArray(ids)) return [];
  const unique = new Set();
  ids.forEach((id) => {
    if (typeof id !== 'string') return;
    const trimmed = id.trim();
    if (!trimmed) return;
    const strategy = store.strategies.get(trimmed);
    if (!strategy) return;
    if (!includeInactive && strategy.active === false) return;
    unique.add(strategy.id);
  });
  return Array.from(unique);
};

const ensureUserRecord = (uid) => {
  const existing = store.users.get(uid);
  if (existing) return existing;
  const now = nowIso();
  const user = {
    uid,
    status: 'pending',
    requestedStrategies: [],
    approvedStrategies: [],
    accessKey: null,
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
    trading: {
      connected: false,
      apiKeyMasked: null,
      lastConnectedAt: null,
      autoTradingEnabled: false,
      positions: [],
    },
  };
  store.users.set(uid, user);
  return user;
};

const recordAdminSignal = (strategyId, payload) => {
  if (!strategyId) return;
  const list = store.adminSignals.get(strategyId) ?? [];
  list.unshift(payload);
  clampList(list, MAX_SIGNALS_PER_STRATEGY);
  store.adminSignals.set(strategyId, list);
};

const recordUserSignal = (uid, payload) => {
  if (!uid) return;
  const list = store.userSignals.get(uid) ?? [];
  list.unshift(payload);
  clampList(list, MAX_SIGNALS_PER_USER);
  store.userSignals.set(uid, list);
};

const basePrices = {
  BTC_USDT: 68000,
  ETH_USDT: 3500,
  SOL_USDT: 160,
};

const createSimulatedPosition = (symbol, side) => {
  const base = basePrices[symbol] ?? 100;
  const entryPrice = base * (1 + (Math.random() - 0.5) * 0.02);
  const leverage = 10;
  const margin = 100;
  const size = ((margin * leverage) / entryPrice) * (side === 'long' ? 1 : -1);
  const markPrice = entryPrice * (1 + (Math.random() - 0.5) * 0.015);
  const pnl = (markPrice - entryPrice) * size;
  return {
    contract: symbol,
    size,
    side,
    leverage,
    margin,
    pnl,
    pnlPercentage: (pnl / margin) * 100,
    entryPrice,
    markPrice,
  };
};

const closePositionsFor = (user, symbol) => {
  const before = user.trading.positions.length;
  user.trading.positions = user.trading.positions.filter((pos) => pos.contract !== symbol);
  return before - user.trading.positions.length;
};

const applyAutoTrading = (user, signal) => {
  if (!user.trading.connected) {
    return { executed: false, reason: 'api disconnected' };
  }
  if (!user.trading.autoTradingEnabled) {
    return { executed: false, reason: 'auto trading disabled' };
  }
  if (signal.action === 'exit') {
    const removed = closePositionsFor(user, signal.symbol);
    if (removed > 0) {
      addLog('info', `[AUTO-TRADE] UID ${user.uid} closed ${removed} position(s) on ${signal.symbol}`);
      return { executed: true };
    }
    return { executed: false, reason: 'no open position' };
  }
  if (signal.action === 'enter') {
    const position = createSimulatedPosition(signal.symbol, signal.side);
    user.trading.positions.unshift(position);
    clampList(user.trading.positions, MAX_POSITIONS_PER_USER);
    addLog('success', `[AUTO-TRADE] UID ${user.uid} opened ${signal.side.toUpperCase()} on ${signal.symbol}`);
    return { executed: true, position };
  }
  return { executed: false, reason: 'informational signal' };
};

const parseDirection = (direction) => {
  const normalized = (direction || '').toString().trim().toLowerCase();
  if (['long', 'buy', 'bull', 'up'].includes(normalized)) {
    return { action: 'enter', side: 'long' };
  }
  if (['short', 'sell', 'bear', 'down'].includes(normalized)) {
    return { action: 'enter', side: 'short' };
  }
  if (['exit', 'close', 'flat', 'square', 'neutral', 'out'].includes(normalized)) {
    return { action: 'exit', side: 'flat' };
  }
  return { action: 'signal', side: normalized || 'unknown' };
};

const matchStrategyByIndicator = (indicator) => {
  if (!indicator || typeof indicator !== 'string') return null;
  const normalized = indicator.trim().toLowerCase();
  for (const strategy of store.strategies.values()) {
    if (strategy.active === false) continue;
    if (strategy.id.toLowerCase() === normalized || strategy.name.trim().toLowerCase() === normalized) {
      return strategy;
    }
  }
  return null;
};

const deliverSignalToUsers = (strategy, signal) => {
  let delivered = 0;
  for (const user of store.users.values()) {
    if (user.status !== 'approved') continue;
    if (!user.approvedStrategies.includes(strategy.id)) continue;
    delivered += 1;
    const trade = applyAutoTrading(user, signal);
    const payload = {
      id: signal.id,
      timestamp: signal.timestamp,
      action: signal.action,
      side: signal.side,
      symbol: signal.symbol,
      indicator: signal.indicator,
      strategyId: strategy.id,
      autoTradingExecuted: trade.executed,
      status: trade.executed ? 'executed' : trade.reason || 'delivered',
    };
    if (trade.position) {
      payload.size = Number(Math.abs(trade.position.size).toFixed(4));
      payload.leverage = trade.position.leverage;
    }
    recordUserSignal(user.uid, payload);
  }
  return delivered;
};

const buildAccountSnapshot = (user) => {
  const positions = user.trading.positions;
  const positionMargin = positions.reduce((sum, pos) => sum + (pos.margin || 0), 0);
  const unrealisedPnl = positions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
  const baseBalance = 5000;
  const available = Math.max(0, baseBalance - positionMargin);
  const futures = {
    total: Number((available + positionMargin + unrealisedPnl).toFixed(2)),
    available: Number(available.toFixed(2)),
    positionMargin: Number(positionMargin.toFixed(2)),
    orderMargin: 0,
    unrealisedPnl: Number(unrealisedPnl.toFixed(2)),
    currency: 'USDT',
  };
  return {
    futures,
    spot: [],
    margin: [],
    options: null,
    totalEstimatedValue: futures.total,
  };
};

const buildWebhookUrl = (req) => {
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/webhook/${store.webhook.secret}`;
};

const parseEnvArray = (envVar, description) => {
  const raw = process.env[envVar];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('value is not an array');
    }
    return parsed;
  } catch (error) {
    addLog('error', `[INIT] Failed to parse ${description}: ${error.message}`);
    return [];
  }
};

const bootstrapPreseedStrategies = () => {
  const seeds = parseEnvArray('ADMIN_PRESEED_STRATEGIES', 'ADMIN_PRESEED_STRATEGIES');
  if (!seeds.length) return;
  let added = 0;
  seeds.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      addLog('warning', `[INIT] Ignored preseed strategy at index ${index}`);
      return;
    }
    const providedId = typeof entry.id === 'string' ? entry.id.trim() : '';
    const providedName = typeof entry.name === 'string' ? entry.name.trim() : '';
    const baseId = providedId || slugify(providedName);
    if (!baseId) {
      addLog('warning', `[INIT] Preseed strategy at index ${index} missing name/id`);
      return;
    }
    let uniqueId = baseId;
    while (store.strategies.has(uniqueId)) {
      uniqueId = `${baseId}-${Math.floor(Math.random() * 1000)}`;
    }
    const now = nowIso();
    const strategy = {
      id: uniqueId,
      name: providedName || uniqueId,
      description: typeof entry.description === 'string' ? entry.description : '',
      active: entry.active !== false,
      createdAt: now,
      updatedAt: now,
    };
    store.strategies.set(uniqueId, strategy);
    if (strategy.active) {
      store.webhook.routes.add(uniqueId);
    }
    added += 1;
  });
  if (added) {
    addLog('info', `[INIT] Loaded ${added} strategies from ADMIN_PRESEED_STRATEGIES`);
  }
};

const bootstrapPreseedUsers = () => {
  const seeds = parseEnvArray('ADMIN_PRESEED_USERS', 'ADMIN_PRESEED_USERS');
  if (!seeds.length) return;
  let added = 0;
  seeds.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      addLog('warning', `[INIT] Ignored preseed user at index ${index}`);
      return;
    }
    const uid = typeof entry.uid === 'string' ? entry.uid.trim() : '';
    if (!uid) {
      addLog('warning', `[INIT] Preseed user at index ${index} missing uid`);
      return;
    }
    const user = ensureUserRecord(uid);
    const status = typeof entry.status === 'string' ? entry.status.trim().toLowerCase() : 'approved';
    user.status = ['approved', 'denied', 'pending'].includes(status) ? status : 'approved';
    const approved = sanitizeStrategyIds(entry.approvedStrategies, { includeInactive: true });
    if (approved.length) {
      user.approvedStrategies = approved;
      user.requestedStrategies = approved.slice();
    }
    user.accessKey = typeof entry.accessKey === 'string' && entry.accessKey.trim()
      ? entry.accessKey.trim()
      : crypto.randomUUID().replace(/-/g, '');
    user.trading.autoTradingEnabled = Boolean(entry.autoTradingEnabled);
    user.updatedAt = nowIso();
    if (user.status === 'approved') {
      user.approvedAt = user.updatedAt;
    }
    added += 1;
  });
  if (added) {
    addLog('info', `[INIT] Loaded ${added} users from ADMIN_PRESEED_USERS`);
  }
};

const bootstrapWebhookRoutes = () => {
  const routes = parseEnvArray('ADMIN_WEBHOOK_ROUTES', 'ADMIN_WEBHOOK_ROUTES');
  if (routes.length) {
    const valid = sanitizeStrategyIds(routes);
    store.webhook.routes = new Set(valid);
    store.webhook.updatedAt = nowIso();
    addLog('info', `[INIT] Loaded webhook routing filter: ${valid.join(', ') || 'none'}`);
  } else if (!store.webhook.routes.size) {
    listStrategies()
      .filter((strategy) => strategy.active !== false)
      .forEach((strategy) => store.webhook.routes.add(strategy.id));
  }
};

ensureWebhookSecret();
bootstrapPreseedStrategies();
bootstrapPreseedUsers();
bootstrapWebhookRoutes();

const mapStrategiesWithName = (ids) =>
  ids
    .map((id) => store.strategies.get(id))
    .filter(Boolean)
    .map((strategy) => ({ id: strategy.id, name: strategy.name }));

const requireAdmin = (req, res, next) => {
  const token = req.get('x-admin-token');
  if (!token || token !== ADMIN_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  return next();
};

const requireApprovedUser = (req, res) => {
  const { uid, key } = req.query;
  if (!uid || typeof uid !== 'string' || !key || typeof key !== 'string') {
    res.status(400).json({ message: 'Missing uid or access key.' });
    return null;
  }
  const user = store.users.get(uid);
  if (!user || user.status !== 'approved' || user.accessKey !== key) {
    res.status(403).json({ message: 'Forbidden' });
    return null;
  }
  return user;
};

app.get('/api/strategies', (req, res) => {
  const activeStrategies = listStrategies().filter((strategy) => strategy.active !== false);
  res.json({ strategies: activeStrategies });
});

app.post('/api/register', (req, res) => {
  const { uid, strategies: requested } = req.body || {};
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ message: 'UID is required.' });
  }
  const normalizedStrategies = sanitizeStrategyIds(requested);
  if (!normalizedStrategies.length) {
    return res.status(400).json({ message: 'At least one strategy must be selected.' });
  }
  const user = ensureUserRecord(uid.trim());
  user.requestedStrategies = normalizedStrategies.slice();
  user.status = 'pending';
  user.updatedAt = nowIso();
  addLog('info', `[REGISTER] UID ${uid} requested ${normalizedStrategies.join(', ')}`);
  return res.json({ status: user.status });
});

app.get('/api/user/status', (req, res) => {
  const { uid } = req.query;
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ message: 'UID is required.' });
  }
  const user = store.users.get(uid);
  if (!user) {
    return res.json({ status: 'not_registered' });
  }
  return res.json({
    status: user.status,
    requestedStrategies: mapStrategiesWithName(user.requestedStrategies),
    approvedStrategies: mapStrategiesWithName(user.approvedStrategies),
    accessKey: user.accessKey,
    autoTradingEnabled: user.trading.autoTradingEnabled,
  });
});

app.get('/api/user/signals', (req, res) => {
  const { uid, key } = req.query;
  if (!uid || typeof uid !== 'string' || !key || typeof key !== 'string') {
    return res.status(400).json({ message: 'Missing uid or access key.' });
  }
  const user = store.users.get(uid);
  if (!user || user.status !== 'approved' || user.accessKey !== key) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const signalsForUser = store.userSignals.get(uid) || [];
  return res.json({ signals: signalsForUser });
});

app.get('/api/logs', (req, res) => {
  res.json({ logs: store.logs });
});

app.post('/api/connect', (req, res) => {
  const { uid, accessKey, apiKey, apiSecret, isTestnet } = req.body || {};
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ message: 'UID is required.' });
  }
  const user = store.users.get(uid);
  if (!user || user.status !== 'approved') {
    return res.status(403).json({ message: 'UID is not approved.' });
  }
  if (user.accessKey && user.accessKey !== accessKey) {
    return res.status(403).json({ message: 'Invalid access key.' });
  }
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ message: 'API credentials are required.' });
  }
  user.trading.connected = true;
  user.trading.lastConnectedAt = nowIso();
  user.trading.apiKeyMasked = maskKey(apiKey);
  addLog('success', `[CONNECT] UID ${uid} connected to ${isTestnet ? 'testnet' : 'mainnet'} API`);
  const accounts = buildAccountSnapshot(user);
  const positions = user.trading.positions.map((pos) => ({ ...pos }));
  return res.json({ ok: true, accounts, positions, autoTradingEnabled: user.trading.autoTradingEnabled });
});

app.post('/api/disconnect', (req, res) => {
  const { uid, accessKey } = req.body || {};
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ message: 'UID is required.' });
  }
  const user = store.users.get(uid);
  if (!user || user.status !== 'approved') {
    return res.status(404).json({ message: 'User not found.' });
  }
  if (user.accessKey && user.accessKey !== accessKey) {
    return res.status(403).json({ message: 'Invalid access key.' });
  }
  user.trading.connected = false;
  user.trading.lastConnectedAt = nowIso();
  addLog('info', `[DISCONNECT] UID ${uid} disconnected API session.`);
  return res.json({ ok: true });
});

app.get('/api/accounts/all', (req, res) => {
  const user = requireApprovedUser(req, res);
  if (!user) return;
  const accounts = buildAccountSnapshot(user);
  res.json(accounts);
});

app.get('/api/positions', (req, res) => {
  const user = requireApprovedUser(req, res);
  if (!user) return;
  res.json({ positions: user.trading.positions.map((pos) => ({ ...pos })) });
});

app.post('/api/positions/close', (req, res) => {
  const { uid, accessKey, contract } = req.body || {};
  if (!uid || typeof uid !== 'string' || !contract || typeof contract !== 'string') {
    return res.status(400).json({ message: 'UID and contract are required.' });
  }
  const user = store.users.get(uid);
  if (!user || user.status !== 'approved' || (user.accessKey && user.accessKey !== accessKey)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const removed = closePositionsFor(user, contract);
  if (removed === 0) {
    return res.status(404).json({ message: 'No matching position.' });
  }
  addLog('info', `[MANUAL CLOSE] UID ${uid} closed ${removed} position(s) on ${contract}`);
  return res.json({ ok: true, removed });
});

app.post('/api/trading/auto', (req, res) => {
  const { uid, accessKey, enabled } = req.body || {};
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ message: 'UID is required.' });
  }
  const user = store.users.get(uid);
  if (!user || user.status !== 'approved' || (user.accessKey && user.accessKey !== accessKey)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  user.trading.autoTradingEnabled = Boolean(enabled);
  addLog('info', `[AUTO-TRADING] UID ${uid} ${user.trading.autoTradingEnabled ? 'enabled' : 'disabled'} auto trading`);
  return res.json({ ok: true, autoTradingEnabled: user.trading.autoTradingEnabled });
});

app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const userList = Array.from(store.users.values()).map((user) => ({
    uid: user.uid,
    status: user.status,
    requestedStrategies: user.requestedStrategies.slice(),
    approvedStrategies: user.approvedStrategies.slice(),
    accessKey: user.accessKey,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    approvedAt: user.approvedAt,
    autoTradingEnabled: user.trading.autoTradingEnabled,
  }));
  const stats = {
    totalUsers: userList.length,
    pending: userList.filter((u) => u.status === 'pending').length,
    approved: userList.filter((u) => u.status === 'approved').length,
  };
  res.json({ users: userList, strategies: listStrategies(), stats });
});

app.get('/api/admin/signals', requireAdmin, (req, res) => {
  const { strategy } = req.query;
  if (!strategy || typeof strategy !== 'string') {
    return res.status(400).json({ message: 'Strategy id is required.' });
  }
  const signalsForStrategy = store.adminSignals.get(strategy) || [];
  res.json({ signals: signalsForStrategy });
});

app.get('/api/admin/webhook', requireAdmin, (req, res) => {
  ensureWebhookSecret();
  res.json({
    url: buildWebhookUrl(req),
    secret: store.webhook.secret,
    createdAt: store.webhook.createdAt,
    updatedAt: store.webhook.updatedAt,
    routes: Array.from(store.webhook.routes),
  });
});

app.post('/api/admin/webhook', requireAdmin, (req, res) => {
  store.webhook.secret = crypto.randomUUID();
  store.webhook.updatedAt = nowIso();
  if (!store.webhook.createdAt) {
    store.webhook.createdAt = store.webhook.updatedAt;
  }
  addLog('info', '[WEBHOOK] Administrator generated a new webhook secret');
  res.json({
    url: buildWebhookUrl(req),
    secret: store.webhook.secret,
    createdAt: store.webhook.createdAt,
    updatedAt: store.webhook.updatedAt,
    routes: Array.from(store.webhook.routes),
  });
});

app.put('/api/admin/webhook/routes', requireAdmin, (req, res) => {
  const { strategies: nextRoutes } = req.body || {};
  const valid = sanitizeStrategyIds(nextRoutes);
  store.webhook.routes = new Set(valid);
  store.webhook.updatedAt = nowIso();
  addLog('info', `[WEBHOOK] Updated delivery routes: ${valid.join(', ') || 'none'}`);
  res.json({ ok: true, routes: valid });
});

app.post('/api/admin/users/approve', requireAdmin, (req, res) => {
  const { uid, strategies: approved } = req.body || {};
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ message: 'UID is required.' });
  }
  const strategyIds = sanitizeStrategyIds(approved);
  if (!strategyIds.length) {
    return res.status(400).json({ message: 'At least one strategy must be selected.' });
  }
  const user = ensureUserRecord(uid);
  user.status = 'approved';
  user.approvedStrategies = strategyIds.slice();
  user.requestedStrategies = strategyIds.slice();
  user.updatedAt = nowIso();
  user.approvedAt = user.updatedAt;
  if (!user.accessKey) {
    user.accessKey = crypto.randomUUID().replace(/-/g, '');
  }
  addLog('success', `[ADMIN] Approved UID ${uid} for strategies ${strategyIds.join(', ')}`);
  res.json({ ok: true });
});

app.post('/api/admin/users/deny', requireAdmin, (req, res) => {
  const { uid } = req.body || {};
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ message: 'UID is required.' });
  }
  const user = store.users.get(uid);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }
  user.status = 'denied';
  user.approvedStrategies = [];
  user.accessKey = null;
  user.trading.autoTradingEnabled = false;
  user.trading.positions = [];
  user.updatedAt = nowIso();
  addLog('warning', `[ADMIN] Denied UID ${uid}`);
  res.json({ ok: true });
});

app.patch('/api/admin/users/:uid/strategies', requireAdmin, (req, res) => {
  const { uid } = req.params;
  const { strategies: updatedStrategies } = req.body || {};
  if (!uid) {
    return res.status(400).json({ message: 'UID is required.' });
  }
  const strategyIds = sanitizeStrategyIds(updatedStrategies);
  if (!strategyIds.length) {
    return res.status(400).json({ message: 'At least one strategy must be selected.' });
  }
  const user = store.users.get(uid);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }
  user.approvedStrategies = strategyIds.slice();
  user.updatedAt = nowIso();
  addLog('info', `[ADMIN] Updated strategies for UID ${uid}: ${strategyIds.join(', ')}`);
  res.json({ ok: true });
});

app.post('/api/admin/strategies', requireAdmin, (req, res) => {
  const { name, description } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Strategy name is required.' });
  }
  const baseId = slugify(name);
  let id = baseId;
  while (store.strategies.has(id)) {
    id = `${baseId}-${Math.floor(Math.random() * 1000)}`;
  }
  const now = nowIso();
  const strategy = {
    id,
    name,
    description: typeof description === 'string' ? description : '',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  store.strategies.set(id, strategy);
  store.webhook.routes.add(id);
  addLog('info', `[ADMIN] Added new strategy ${name} (${id})`);
  res.json({ ok: true, strategy });
});

const verifyWebhookSecret = (req) => {
  const headerSecret = req.get('x-webhook-secret');
  const querySecret = req.params.secret || req.query.secret || req.body?.secret;
  if (!store.webhook.secret) return false;
  return headerSecret === store.webhook.secret || querySecret === store.webhook.secret;
};

app.post(['/webhook', '/webhook/:secret'], (req, res) => {
  ensureWebhookSecret();
  if (store.webhook.secret && !verifyWebhookSecret(req)) {
    addLog('error', '[WEBHOOK] Received payload with invalid secret');
    return res.status(403).json({ ok: false, message: 'Invalid webhook secret.' });
  }
  const { indicator, strategy: strategyName, name, symbol, ticker, direction, side, action } = req.body || {};
  const resolvedIndicator = indicator || strategyName || name;
  const resolvedSymbol = symbol || ticker;
  const resolvedDirection = direction || side || action;
  if (!resolvedIndicator || !resolvedSymbol || !resolvedDirection) {
    addLog('error', '[WEBHOOK] Missing indicator, symbol or direction in payload');
    return res.status(400).json({ ok: false, message: 'Indicator, symbol, and direction are required.' });
  }
  let strategy = matchStrategyByIndicator(resolvedIndicator);
  if (!strategy && store.webhook.routes.size === 1) {
    const [onlyStrategy] = Array.from(store.webhook.routes);
    if (onlyStrategy) {
      strategy = store.strategies.get(onlyStrategy) || null;
    }
  }
  if (!strategy) {
    addLog('warning', `[WEBHOOK] Unknown indicator '${resolvedIndicator}'.`);
    return res.status(202).json({ ok: false, message: 'No strategy matched the incoming indicator.' });
  }
  if (store.webhook.routes.size && !store.webhook.routes.has(strategy.id)) {
    addLog('warning', `[WEBHOOK] Strategy ${strategy.id} is not currently targeted for delivery.`);
    recordAdminSignal(strategy.id, {
      id: randomId('sig'),
      timestamp: nowIso(),
      action: 'ignored',
      side: 'blocked',
      symbol: resolvedSymbol,
      indicator: resolvedIndicator,
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
    strategyId: strategy.id,
  };
  const delivered = deliverSignalToUsers(strategy, signal);
  const adminRecord = {
    id: signal.id,
    timestamp: signal.timestamp,
    action: signal.action,
    side: signal.side,
    symbol: signal.symbol,
    strategyId: strategy.id,
    indicator: resolvedIndicator,
    status: delivered > 0 ? `delivered to ${delivered} user${delivered === 1 ? '' : 's'}` : 'no approved recipients',
  };
  recordAdminSignal(strategy.id, adminRecord);
  addLog('info', `[WEBHOOK] ${strategy.name} → ${resolvedSymbol} (${signal.side.toUpperCase()}) delivered to ${delivered} user(s)`);
  res.json({ ok: true, delivered });
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
