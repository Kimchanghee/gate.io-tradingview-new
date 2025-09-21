import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'Ckdgml9788@';
const PUBLIC_URL = process.env.PUBLIC_URL;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.text({ type: ['text/plain'], limit: '1mb' }));

const nowIso = () => new Date().toISOString();
const randomId = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const maskKey = (value) => {
  if (!value) return null;
  if (value.length <= 6) {
    return `${value[0]}***${value[value.length - 1]}`;
  }
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
};

const MAX_LOGS = 200;
const MAX_SIGNALS_PER_STRATEGY = 200;
const MAX_SIGNALS_PER_USER = 200;
const MAX_POSITIONS_PER_USER = 20;

const logs = [];
const strategies = new Map();
const users = new Map();
const adminSignals = new Map();
const userSignals = new Map();

const webhook = {
  secret: crypto.randomUUID(),
  createdAt: nowIso(),
  updatedAt: nowIso(),
  routes: new Set(),
};

const baseStrategies = [
  {
    id: 'momentum-hunter',
    name: 'Momentum Hunter',
    description: 'BTC momentum breakout indicator',
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 'mean-reversion',
    name: 'Mean Reversion Pro',
    description: 'RSI mean reversion strategy',
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 'eth-trend',
    name: 'ETH Trend Follower',
    description: 'Directional trend following for ETH',
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
];

baseStrategies.forEach((strategy) => {
  strategies.set(strategy.id, strategy);
});
webhook.routes = new Set([...strategies.keys()]);

const addLog = (level, message) => {
  logs.unshift({ id: randomId('log'), timestamp: nowIso(), message, level });
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
};

const sanitizeStrategyIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  const unique = new Set();
  ids.forEach((id) => {
    if (typeof id === 'string' && strategies.has(id)) {
      unique.add(id);
    }
  });
  return Array.from(unique);
};

const listStrategies = () => Array.from(strategies.values()).sort((a, b) => a.name.localeCompare(b.name));

const requireAdmin = (req, res, next) => {
  const token = req.get('x-admin-token');
  if (!token || token !== ADMIN_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  return next();
};

const matchStrategyByIndicator = (indicator) => {
  if (!indicator || typeof indicator !== 'string') return null;
  const normalized = indicator.trim().toLowerCase();
  for (const strategy of strategies.values()) {
    if (
      strategy.id.toLowerCase() === normalized ||
      strategy.name.trim().toLowerCase() === normalized
    ) {
      return strategy;
    }
  }
  return null;
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

const mapStrategiesWithName = (ids) => {
  return ids
    .map((id) => strategies.get(id))
    .filter(Boolean)
    .map((strategy) => ({ id: strategy.id, name: strategy.name }));
};

const ensureUserRecord = (uid) => {
  const existing = users.get(uid);
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
  users.set(uid, user);
  return user;
};

const addAdminSignal = (strategyId, signal) => {
  if (!strategyId) return;
  const list = adminSignals.get(strategyId) ?? [];
  list.unshift(signal);
  if (list.length > MAX_SIGNALS_PER_STRATEGY) {
    list.length = MAX_SIGNALS_PER_STRATEGY;
  }
  adminSignals.set(strategyId, list);
};

const addUserSignal = (uid, signal) => {
  const list = userSignals.get(uid) ?? [];
  list.unshift(signal);
  if (list.length > MAX_SIGNALS_PER_USER) {
    list.length = MAX_SIGNALS_PER_USER;
  }
  userSignals.set(uid, list);
};

const trimPositions = (positions) => {
  if (positions.length > MAX_POSITIONS_PER_USER) {
    positions.length = MAX_POSITIONS_PER_USER;
  }
};

const closePositions = (user, symbol) => {
  const before = user.trading.positions.length;
  user.trading.positions = user.trading.positions.filter((position) => position.contract !== symbol);
  return before - user.trading.positions.length;
};

const createSimulatedPosition = (symbol, side) => {
  const basePrices = {
    BTC_USDT: 68000,
    ETH_USDT: 3500,
    SOL_USDT: 160,
  };
  const base = basePrices[symbol] ?? 100;
  const entryPrice = base * (1 + (Math.random() - 0.5) * 0.02);
  const leverage = 10;
  const margin = 100;
  const size = ((margin * leverage) / entryPrice) * (side === 'long' ? 1 : -1);
  const markPrice = entryPrice * (1 + (Math.random() - 0.5) * 0.01);
  const pnl = (markPrice - entryPrice) * size;
  const pnlPercentage = margin === 0 ? 0 : (pnl / margin) * 100;
  return {
    contract: symbol,
    size,
    side,
    leverage,
    margin,
    pnl,
    pnlPercentage,
    entryPrice,
    markPrice,
  };
};

const applyAutoTrade = (user, signal) => {
  if (!user.trading.connected || !user.trading.autoTradingEnabled) {
    return { executed: false };
  }

  if (signal.action === 'exit') {
    const removed = closePositions(user, signal.symbol);
    if (removed > 0) {
      addLog('info', `[AUTO-TRADE] UID ${user.uid} closed ${removed} position(s) on ${signal.symbol}`);
      return { executed: true };
    }
    addLog('warning', `[AUTO-TRADE] UID ${user.uid} has no position to close for ${signal.symbol}`);
    return { executed: false };
  }

  if (signal.action === 'enter') {
    const position = createSimulatedPosition(signal.symbol, signal.side);
    user.trading.positions.unshift(position);
    trimPositions(user.trading.positions);
    addLog('success', `[AUTO-TRADE] UID ${user.uid} opened ${signal.side.toUpperCase()} position on ${signal.symbol}`);
    return { executed: true, position };
  }

  return { executed: false };
};

const deliverSignalToUsers = (strategy, signal) => {
  let delivered = 0;
  for (const user of users.values()) {
    if (user.status !== 'approved') continue;
    if (!user.approvedStrategies.includes(strategy.id)) continue;

    delivered += 1;
    const tradeResult = applyAutoTrade(user, signal);
    const payload = {
      id: signal.id,
      timestamp: signal.timestamp,
      action: signal.action,
      side: signal.side,
      symbol: signal.symbol,
      status: tradeResult.executed ? 'executed' : 'delivered',
      strategyId: strategy.id,
      indicator: signal.indicator,
      autoTradingExecuted: tradeResult.executed,
    };
    if (tradeResult.position) {
      payload.size = Number(Math.abs(tradeResult.position.size).toFixed(4));
      payload.leverage = tradeResult.position.leverage;
    }
    addUserSignal(user.uid, payload);
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
  return `${base.replace(/\/$/, '')}/webhook/${webhook.secret}`;
};

app.get('/api/strategies', (req, res) => {
  res.json({ strategies: listStrategies() });
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
  addLog('info', `[REGISTER] UID ${uid} requested strategies ${normalizedStrategies.join(', ')}`);
  return res.json({ status: user.status });
});

app.get('/api/user/status', (req, res) => {
  const { uid } = req.query;
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ message: 'UID is required.' });
  }
  const user = users.get(uid);
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
  if (!uid || !key || typeof uid !== 'string' || typeof key !== 'string') {
    return res.status(400).json({ message: 'Missing uid or access key.' });
  }
  const user = users.get(uid);
  if (!user || user.status !== 'approved' || user.accessKey !== key) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const signalsForUser = userSignals.get(uid) || [];
  return res.json({ signals: signalsForUser });
});

app.get('/api/logs', (req, res) => {
  res.json({ logs });
});

app.post('/api/connect', (req, res) => {
  const { uid, accessKey, apiKey, apiSecret, isTestnet } = req.body || {};
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ message: 'UID is required.' });
  }
  const user = users.get(uid);
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
  const user = users.get(uid);
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

const requireApprovedUser = (req, res) => {
  const { uid, key } = req.query;
  if (!uid || !key || typeof uid !== 'string' || typeof key !== 'string') {
    res.status(400).json({ message: 'Missing uid or access key.' });
    return null;
  }
  const user = users.get(uid);
  if (!user || user.status !== 'approved' || user.accessKey !== key) {
    res.status(403).json({ message: 'Forbidden' });
    return null;
  }
  return user;
};

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
  const user = users.get(uid);
  if (!user || user.status !== 'approved' || (user.accessKey && user.accessKey !== accessKey)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const removed = closePositions(user, contract);
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
  const user = users.get(uid);
  if (!user || user.status !== 'approved' || (user.accessKey && user.accessKey !== accessKey)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  user.trading.autoTradingEnabled = Boolean(enabled);
  addLog(
    'info',
    `[AUTO-TRADING] UID ${uid} ${user.trading.autoTradingEnabled ? 'enabled' : 'disabled'} auto trading`,
  );
  return res.json({ ok: true, autoTradingEnabled: user.trading.autoTradingEnabled });
});

app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const userList = Array.from(users.values()).map((user) => ({
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
  const signalsForStrategy = adminSignals.get(strategy) || [];
  res.json({ signals: signalsForStrategy });
});

app.get('/api/admin/webhook', requireAdmin, (req, res) => {
  if (!webhook.secret) {
    return res.status(404).json({ message: 'Webhook is not configured.' });
  }
  res.json({
    url: buildWebhookUrl(req),
    secret: webhook.secret,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
    routes: Array.from(webhook.routes),
  });
});

app.post('/api/admin/webhook', requireAdmin, (req, res) => {
  webhook.secret = crypto.randomUUID();
  webhook.updatedAt = nowIso();
  if (!webhook.createdAt) {
    webhook.createdAt = webhook.updatedAt;
  }
  addLog('info', '[WEBHOOK] Administrator generated a new webhook secret');
  res.json({
    url: buildWebhookUrl(req),
    secret: webhook.secret,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
    routes: Array.from(webhook.routes),
  });
});

app.put('/api/admin/webhook/routes', requireAdmin, (req, res) => {
  const { strategies: nextRoutes } = req.body || {};
  const valid = sanitizeStrategyIds(nextRoutes);
  webhook.routes = new Set(valid);
  webhook.updatedAt = nowIso();
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
  const user = users.get(uid);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }
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
  const user = users.get(uid);
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
  const user = users.get(uid);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }
  user.approvedStrategies = strategyIds.slice();
  user.updatedAt = nowIso();
  addLog('info', `[ADMIN] Updated strategies for UID ${uid}: ${strategyIds.join(', ')}`);
  res.json({ ok: true });
});

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

app.post('/api/admin/strategies', requireAdmin, (req, res) => {
  const { name, description } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ message: 'Strategy name is required.' });
  }
  const baseId = slugify(name);
  const id = strategies.has(baseId) ? `${baseId}-${Math.floor(Math.random() * 1000)}` : baseId;
  const now = nowIso();
  const strategy = {
    id,
    name,
    description: typeof description === 'string' ? description : '',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  strategies.set(id, strategy);
  webhook.routes.add(id);
  addLog('info', `[ADMIN] Added new strategy ${name} (${id})`);
  res.json({ ok: true, strategy });
});

const isPlainObject = (value) => typeof value === 'object' && value !== null;

const parseWebhookBody = (rawBody) => {
  if (rawBody == null) {
    return {};
  }

  if (typeof rawBody === 'string') {
    const trimmed = rawBody.trim();
    if (!trimmed) {
      return {};
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (isPlainObject(parsed)) {
        return parsed;
      }
    } catch (jsonError) {
      if (!trimmed.includes('=')) {
        throw jsonError;
      }

      const params = new URLSearchParams(trimmed);
      const result = {};
      for (const [key, value] of params.entries()) {
        if (key) {
          result[key] = value;
        }
      }

      if (typeof result.payload === 'string') {
        try {
          const nested = JSON.parse(result.payload);
          if (isPlainObject(nested)) {
            Object.assign(result, nested);
          }
        } catch (_) {
          /* ignore nested parse errors */
        }
      }

      if (Object.keys(result).length > 0) {
        return result;
      }

      throw jsonError;
    }

    return {};
  }

  if (isPlainObject(rawBody)) {
    return rawBody;
  }

  return {};
};

const verifyWebhookSecret = (req, payload) => {
  const headerSecret = req.get('x-webhook-secret');
  const querySecretRaw = req.params.secret ?? req.query.secret;
  const querySecret = Array.isArray(querySecretRaw) ? querySecretRaw[0] : querySecretRaw;
  const bodySecret = isPlainObject(payload) && typeof payload.secret === 'string' ? payload.secret : undefined;
  if (!webhook.secret) return false;
  return [headerSecret, querySecret, bodySecret].some((value) => value && value === webhook.secret);
};

app.post(['/webhook', '/webhook/:secret'], (req, res) => {
  let payload;
  try {
    payload = parseWebhookBody(req.body);
  } catch (error) {
    addLog('error', `[WEBHOOK] Failed to parse payload: ${error.message}`);
    return res.status(400).json({ ok: false, message: 'Invalid webhook payload.' });
  }

  if (webhook.secret && !verifyWebhookSecret(req, payload)) {
    addLog('error', '[WEBHOOK] Received payload with invalid secret');
    return res.status(403).json({ ok: false, message: 'Invalid webhook secret.' });
  }

  const { indicator, strategy: strategyName, name, symbol, ticker, direction, side, action } = payload;
  const resolvedIndicator = indicator || strategyName || name;
  const resolvedSymbol = symbol || ticker;
  const resolvedDirection = direction || side || action;

  if (!resolvedIndicator || !resolvedSymbol || !resolvedDirection) {
    addLog('error', '[WEBHOOK] Missing indicator, symbol or direction in payload');
    return res.status(400).json({ ok: false, message: 'Indicator, symbol, and direction are required.' });
  }

  let strategy = matchStrategyByIndicator(resolvedIndicator);
  if (!strategy) {
    if (webhook.routes.size === 1) {
      const [onlyStrategy] = webhook.routes;
      strategy = strategies.get(onlyStrategy) || null;
    }
  }

  if (!strategy) {
    addLog('warning', `[WEBHOOK] Unknown indicator '${resolvedIndicator}'.`);
    return res.status(202).json({ ok: false, message: 'No strategy matched the incoming indicator.' });
  }

  if (webhook.routes.size && !webhook.routes.has(strategy.id)) {
    addLog('warning', `[WEBHOOK] Strategy ${strategy.id} is not currently targeted for delivery.`);
    addAdminSignal(strategy.id, {
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
  addAdminSignal(strategy.id, adminRecord);
  addLog(
    'info',
    `[WEBHOOK] ${strategy.name} → ${resolvedSymbol} (${signal.side.toUpperCase()}) delivered to ${delivered} user(s)`,
  );

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
