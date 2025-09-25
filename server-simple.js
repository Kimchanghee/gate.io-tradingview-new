require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const rateLimiter = require('./middleware/rateLimiter');
const generalLimiter = rateLimiter;
const webhookLimiter = rateLimiter.webhookLimiter;
const adminLimiter = rateLimiter.adminLimiter;
const errorHandler = require('./middleware/errorHandler');
const statusRouter = require('./routes/status');
const tradingRouter = require('./routes/trading');
const webhookRouter = require('./routes/webhook');

let logger;
try {
    logger = require('./utils/logger');
} catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Logger not initialised:', error.message);
    logger = null;
}

const app = express();
const PORT = process.env.PORT || 8080;

if (!process.env.ADMIN_TOKEN) {
    process.env.ADMIN_TOKEN = 'Ckdgml9788@';
}

const normaliseString = (value, fallback = null) => {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed || fallback;
};

const nowIsoString = () => new Date().toISOString();

const extractToken = (raw) => {
    const value = normaliseString(raw);
    if (!value) {
        return null;
    }
    if (value.toLowerCase().startsWith('bearer ')) {
        return value.slice(7).trim();
    }
    return value;
};

const dataStore = {
    logs: [],
    strategies: new Map(),
    users: new Map(),
    signals: [],
    webhook: {
        url: null,
        secret: null,
        createdAt: null,
        updatedAt: null,
        routes: []
    },
    webhookDeliveries: [],
    metrics: {
        totalVisits: 0,
        lastVisitAt: null,
        sessions: new Map(),
        lastSignal: null,
        signalRecipients: {
            active: 0,
            lastSignalAt: null,
            lastDeliveredCount: 0
        },
        visitors: {
            active: 0,
            totalSessions: 0,
            lastVisitAt: null
        }
    }
};

const ADMIN_TOKEN = normaliseString(
    process.env.ADMIN_TOKEN || process.env.ADMIN_SECRET || process.env.ADMIN_KEY,
    'Ckdgml9788@'
);

const generateAccessKey = () => {
    if (crypto.randomUUID) {
        return `access_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    }
    return `access_${Math.random().toString(16).slice(2, 14)}`;
};

const appendLog = (message, level = 'info') => {
    dataStore.logs.push({
        id: `log-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        timestamp: nowIsoString(),
        message,
        level
    });

    if (dataStore.logs.length > 500) {
        dataStore.logs.splice(0, dataStore.logs.length - 500);
    }
};

const mapStrategyIdsToNamedList = (ids = []) =>
    ids
        .filter((id) => typeof id === 'string' && id)
        .map((id) => ({
            id,
            name: dataStore.strategies.get(id)?.name || id
        }));

const countActiveVisitors = () => {
    const now = Date.now();
    const THRESHOLD = 1000 * 60 * 5; // 5 minutes
    let active = 0;
    dataStore.metrics.sessions.forEach((session) => {
        if (now - session.lastSeen <= THRESHOLD) {
            active += 1;
        }
    });
    return active;
};

const refreshMetricsSnapshot = () => {
    dataStore.metrics.visitors = {
        active: countActiveVisitors(),
        totalSessions: dataStore.metrics.sessions.size,
        lastVisitAt: dataStore.metrics.lastVisitAt
    };

    const approvedUsers = Array.from(dataStore.users.values()).filter((user) => user.status === 'approved');
    dataStore.metrics.signalRecipients.active = approvedUsers.length;
};

const serialiseStrategies = () =>
    Array.from(dataStore.strategies.values()).map((strategy) => ({
        id: strategy.id,
        name: strategy.name,
        description: strategy.description,
        active: strategy.active !== false,
        createdAt: strategy.createdAt,
        updatedAt: strategy.updatedAt
    }));

const serialiseUsersForAdmin = () =>
    Array.from(dataStore.users.values()).map((user) => ({
        uid: user.uid,
        status: user.status,
        requestedStrategies: user.requestedStrategies.slice(),
        approvedStrategies: user.approvedStrategies.slice(),
        accessKey: user.status === 'approved' ? user.accessKey : null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        approvedAt: user.approvedAt
    }));

const ensureUserExists = (uid) => {
    const key = normaliseString(uid);
    if (!key) {
        return null;
    }

    if (!dataStore.users.has(key)) {
        const createdAt = nowIsoString();
        dataStore.users.set(key, {
            uid: key,
            status: 'not_registered',
            requestedStrategies: [],
            approvedStrategies: [],
            accessKey: null,
            autoTradingEnabled: false,
            createdAt,
            updatedAt: createdAt,
            approvedAt: null,
            signals: [],
            positions: []
        });
    }

    return dataStore.users.get(key);
};

const buildUserStatusPayload = (user) => ({
    status: user.status,
    requestedStrategies: mapStrategyIdsToNamedList(user.requestedStrategies),
    approvedStrategies: mapStrategyIdsToNamedList(user.approvedStrategies),
    accessKey: user.accessKey,
    autoTradingEnabled: Boolean(user.autoTradingEnabled)
});

const resolveUserForCredentialCheck = (uid, key) => {
    const normalisedUid = normaliseString(uid);
    const normalisedKey = normaliseString(key);

    if (!normalisedUid || !normalisedKey) {
        return { error: 'missing_credentials', status: 403 };
    }

    const user = dataStore.users.get(normalisedUid);
    if (!user) {
        return { error: 'uid_not_found', status: 403 };
    }

    if (user.accessKey !== normalisedKey) {
        return { error: 'uid_credentials_mismatch', status: 403 };
    }

    if (user.status !== 'approved') {
        return { error: 'uid_not_approved', status: 403 };
    }

    return { user };
};

const buildEmptyAccounts = () => ({
    futures: null,
    spot: [],
    margin: [],
    options: null,
    totalEstimatedValue: 0
});

const resolveNetwork = (value) => {
    const normalised = normaliseString(value, 'mainnet');
    return normalised === 'testnet' ? 'testnet' : 'mainnet';
};

const resolveApiBaseUrl = (network) =>
    network === 'testnet'
        ? 'https://fx-api-testnet.gateio.ws/api/v4'
        : 'https://api.gateio.ws/api/v4';

const respondWithAuthError = (res, error, status, defaultMessage) =>
    res.status(status).json({
        ok: false,
        code: error,
        message: defaultMessage
    });

app.disable('x-powered-by');

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : true;

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(generalLimiter);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: nowIsoString() });
});

app.use('/api/status', statusRouter);
app.use('/api/trading', tradingRouter);
app.use('/webhook', webhookLimiter, webhookRouter);

app.get(['/api/logs', '/logs'], (req, res) => {
    res.json({ logs: dataStore.logs.slice().reverse() });
});

app.post(['/api/metrics/visit', '/metrics/visit'], (req, res) => {
    const providedSessionId = normaliseString(req.body?.sessionId);
    const sessionId =
        providedSessionId || (crypto.randomUUID ? crypto.randomUUID() : `session_${Math.random().toString(16).slice(2, 10)}`);
    const pathVisited = normaliseString(req.body?.path, '/');
    const referrer = normaliseString(req.body?.referrer);

    dataStore.metrics.sessions.set(sessionId, {
        id: sessionId,
        path: pathVisited,
        referrer,
        lastSeen: Date.now()
    });

    dataStore.metrics.totalVisits += 1;
    dataStore.metrics.lastVisitAt = nowIsoString();
    refreshMetricsSnapshot();

    res.json({ ok: true, sessionId });
});

app.get(['/api/user/status', '/status'], (req, res) => {
    const uid = normaliseString(req.query.uid);
    if (!uid) {
        return res.status(400).json({
            ok: false,
            code: 'missing_uid',
            message: 'UID가 필요합니다.'
        });
    }

    const user = ensureUserExists(uid);
    return res.json(buildUserStatusPayload(user));
});

app.post(['/api/register', '/register'], (req, res) => {
    const uid = normaliseString(req.body?.uid);
    if (!uid) {
        return res.status(400).json({
            ok: false,
            code: 'missing_uid',
            message: 'UID를 입력해주세요.'
        });
    }

    const user = ensureUserExists(uid);

    if (user.status === 'approved') {
        return res.json({
            ok: true,
            status: user.status,
            message: '이미 승인된 사용자입니다.',
            accessKey: user.accessKey
        });
    }

    user.status = 'pending';
    user.updatedAt = nowIsoString();
    appendLog(`[USER] UID ${uid} registration requested.`);

    return res.json({
        ok: true,
        status: user.status,
        message: '등록 요청이 접수되었습니다.'
    });
});

app.get(['/api/user/signals', '/signals'], (req, res) => {
    const { user, error, status } = resolveUserForCredentialCheck(req.query.uid, req.query.key);
    if (error) {
        return respondWithAuthError(res, error, status, '신호를 가져오지 못했습니다.');
    }

    const signals = Array.isArray(user.signals) ? user.signals.slice() : [];
    if (signals.length) {
        dataStore.metrics.lastSignal = signals[signals.length - 1];
        dataStore.metrics.signalRecipients.lastSignalAt = dataStore.metrics.lastSignal.timestamp;
        dataStore.metrics.signalRecipients.lastDeliveredCount = signals.length;
    }

    res.json({ ok: true, signals });
});

app.get(['/api/positions', '/positions'], (req, res) => {
    const { user, error, status } = resolveUserForCredentialCheck(req.query.uid, req.query.key);
    if (error) {
        const message = error === 'missing_credentials' ? 'UID와 액세스 키가 필요합니다.' : '포지션을 가져오지 못했습니다.';
        return respondWithAuthError(res, error, status, message);
    }

    const positions = Array.isArray(user.positions) ? user.positions.slice() : [];
    res.json({ ok: true, positions });
});

app.post('/api/connect', (req, res) => {
    const { uid, accessKey, apiKey, apiSecret, network } = req.body || {};
    const { user, error, status } = resolveUserForCredentialCheck(uid, accessKey);
    if (error) {
        return respondWithAuthError(res, error, status, 'API 연결 정보를 확인할 수 없습니다.');
    }

    const trimmedKey = normaliseString(apiKey);
    const trimmedSecret = normaliseString(apiSecret);
    if (!trimmedKey || !trimmedSecret) {
        return res.status(400).json({
            ok: false,
            code: 'missing_credentials',
            message: 'API Key와 Secret을 입력해주세요.'
        });
    }

    const resolvedNetwork = resolveNetwork(network);
    user.apiConnectedAt = nowIsoString();
    user.network = resolvedNetwork;
    appendLog(`[API] UID ${user.uid} connected to ${resolvedNetwork}.`);

    res.json({
        ok: true,
        message: 'Gate.io API 연결이 설정되었습니다.',
        network: resolvedNetwork,
        apiBaseUrl: resolveApiBaseUrl(resolvedNetwork),
        accounts: buildEmptyAccounts(),
        autoTradingEnabled: Boolean(user.autoTradingEnabled)
    });
});

app.post('/api/disconnect', (req, res) => {
    const { uid, accessKey } = req.body || {};
    const { user, error, status } = resolveUserForCredentialCheck(uid, accessKey);
    if (error) {
        return respondWithAuthError(res, error, status, '연결을 해제하지 못했습니다.');
    }

    user.apiConnectedAt = null;
    user.autoTradingEnabled = false;
    appendLog(`[API] UID ${user.uid} disconnected.`);

    res.json({ ok: true });
});

app.get('/api/accounts/all', (req, res) => {
    const { error, status } = resolveUserForCredentialCheck(req.query.uid, req.query.key);
    if (error) {
        const message = error === 'missing_credentials' ? 'UID와 액세스 키가 필요합니다.' : '계정 정보를 가져오지 못했습니다.';
        return respondWithAuthError(res, error, status, message);
    }

    res.json(buildEmptyAccounts());
});

app.post('/api/trading/auto', (req, res) => {
    const { uid, accessKey, enabled } = req.body || {};
    const { user, error, status } = resolveUserForCredentialCheck(uid, accessKey);
    if (error) {
        return respondWithAuthError(res, error, status, '자동 거래 설정을 변경하지 못했습니다.');
    }

    user.autoTradingEnabled = Boolean(enabled);
    user.updatedAt = nowIsoString();

    appendLog(`[USER] UID ${user.uid} auto-trading ${user.autoTradingEnabled ? 'enabled' : 'disabled'}.`);

    res.json({ ok: true, autoTradingEnabled: user.autoTradingEnabled });
});

const adminAuthMiddleware = (req, res, next) => {
    const token = extractToken(req.headers['x-admin-token'])
        || extractToken(req.headers.authorization)
        || extractToken(req.query.token);

    if (!token || token !== ADMIN_TOKEN) {
        return res.status(401).json({
            ok: false,
            message: '관리자 인증에 실패했습니다.'
        });
    }

    return next();
};

const adminApi = express.Router();
adminApi.use(adminAuthMiddleware);

adminApi.get('/overview', (req, res) => {
    const users = serialiseUsersForAdmin();
    const strategies = serialiseStrategies();
    const stats = {
        totalUsers: users.length,
        pending: users.filter((user) => user.status === 'pending').length,
        approved: users.filter((user) => user.status === 'approved').length
    };

    res.json({ users, strategies, stats });
});

adminApi.get('/signals', (req, res) => {
    const strategyId = normaliseString(req.query.strategy);
    const filtered = dataStore.signals.filter((signal) => {
        if (!strategyId) {
            return true;
        }
        return signal.strategyId === strategyId;
    });

    res.json({ ok: true, signals: filtered.slice().reverse() });
});

adminApi.get('/metrics', (req, res) => {
    refreshMetricsSnapshot();
    res.json({
        visitors: {
            active: dataStore.metrics.visitors.active || 0,
            totalSessions: dataStore.metrics.visitors.totalSessions || 0,
            lastVisitAt: dataStore.metrics.visitors.lastVisitAt
        },
        signalRecipients: {
            active: dataStore.metrics.signalRecipients.active,
            lastSignalAt: dataStore.metrics.signalRecipients.lastSignalAt,
            lastDeliveredCount: dataStore.metrics.signalRecipients.lastDeliveredCount
        },
        webhook: {
            ready: Boolean(dataStore.webhook.url),
            issues: dataStore.webhook.url ? [] : ['웹훅 URL이 설정되지 않았습니다.'],
            routes: dataStore.webhook.routes,
            lastSignal: dataStore.metrics.lastSignal || null
        }
    });
});

adminApi.get('/webhook', (req, res) => {
    if (!dataStore.webhook.url) {
        return res.status(404).json({ ok: false, message: 'Webhook not configured' });
    }

    res.json({
        url: dataStore.webhook.url,
        secret: dataStore.webhook.secret,
        createdAt: dataStore.webhook.createdAt,
        updatedAt: dataStore.webhook.updatedAt,
        alreadyExists: true
    });
});

adminApi.post('/webhook', (req, res) => {
    if (dataStore.webhook.url) {
        return res.json({
            url: dataStore.webhook.url,
            secret: dataStore.webhook.secret,
            createdAt: dataStore.webhook.createdAt,
            updatedAt: dataStore.webhook.updatedAt,
            alreadyExists: true
        });
    }

    const identifier = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 12);
    const webhookUrl = `https://hooks.example.com/tradingview/${identifier}`;
    const webhookSecret = `whsec_${Math.random().toString(16).slice(2, 10)}`;

    dataStore.webhook.url = webhookUrl;
    dataStore.webhook.secret = webhookSecret;
    dataStore.webhook.createdAt = nowIsoString();
    dataStore.webhook.updatedAt = dataStore.webhook.createdAt;
    dataStore.webhook.routes = serialiseStrategies()
        .filter((strategy) => strategy.active)
        .map((strategy) => strategy.id);

    appendLog('[WEBHOOK] 새 웹훅 URL이 생성되었습니다.');

    res.json({
        url: webhookUrl,
        secret: webhookSecret,
        createdAt: dataStore.webhook.createdAt,
        updatedAt: dataStore.webhook.updatedAt,
        alreadyExists: false
    });
});

adminApi.put('/webhook/routes', (req, res) => {
    const strategies = Array.isArray(req.body?.strategies) ? req.body.strategies : [];
    dataStore.webhook.routes = strategies
        .map((id) => normaliseString(id))
        .filter((id) => id && dataStore.strategies.has(id));
    dataStore.webhook.updatedAt = nowIsoString();

    appendLog('[WEBHOOK] 전달 대상 전략이 업데이트되었습니다.');

    res.json({ ok: true, routes: dataStore.webhook.routes });
});

adminApi.get('/webhook/deliveries', (req, res) => {
    res.json({ deliveries: dataStore.webhookDeliveries.slice().reverse() });
});

adminApi.post('/users/approve', (req, res) => {
    const uid = normaliseString(req.body?.uid);
    if (!uid) {
        return res.status(400).json({ ok: false, message: 'UID가 필요합니다.' });
    }

    const user = ensureUserExists(uid);
    user.status = 'approved';
    user.updatedAt = nowIsoString();
    user.approvedAt = nowIsoString();
    if (!user.accessKey) {
        user.accessKey = generateAccessKey();
    }
    if (!user.approvedStrategies.length) {
        user.approvedStrategies = user.requestedStrategies.length
            ? user.requestedStrategies.slice()
            : serialiseStrategies()
                  .filter((strategy) => strategy.active)
                  .map((strategy) => strategy.id);
    }

    refreshMetricsSnapshot();
    appendLog(`[ADMIN] UID ${uid}가 승인되었습니다.`);

    res.json({ ok: true, status: user.status, accessKey: user.accessKey });
});

adminApi.post('/users/deny', (req, res) => {
    const uid = normaliseString(req.body?.uid);
    if (!uid) {
        return res.status(400).json({ ok: false, message: 'UID가 필요합니다.' });
    }

    const user = ensureUserExists(uid);
    user.status = 'denied';
    user.approvedStrategies = [];
    user.accessKey = null;
    user.autoTradingEnabled = false;
    user.updatedAt = nowIsoString();

    refreshMetricsSnapshot();
    appendLog(`[ADMIN] UID ${uid}가 거절되었습니다.`, 'warn');

    res.json({ ok: true, status: user.status });
});

adminApi.delete('/users/:uid', (req, res) => {
    const uid = normaliseString(req.params.uid);
    if (!uid || !dataStore.users.has(uid)) {
        return res.status(404).json({ ok: false, message: '사용자를 찾을 수 없습니다.' });
    }

    dataStore.users.delete(uid);
    refreshMetricsSnapshot();
    appendLog(`[ADMIN] UID ${uid}가 삭제되었습니다.`, 'warn');

    res.json({ ok: true });
});

adminApi.post('/strategies', (req, res) => {
    const name = normaliseString(req.body?.name);
    if (!name) {
        return res.status(400).json({ ok: false, message: '전략 이름이 필요합니다.' });
    }

    const description = normaliseString(req.body?.description);
    const idBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'strategy';
    let id = idBase;
    let counter = 1;
    while (dataStore.strategies.has(id)) {
        id = `${idBase}-${counter}`;
        counter += 1;
    }

    const timestamp = nowIsoString();
    const strategy = {
        id,
        name,
        description,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp
    };

    dataStore.strategies.set(id, strategy);
    appendLog(`[ADMIN] 새 전략 ${name}이(가) 추가되었습니다.`);

    res.json({ ok: true, strategy });
});

adminApi.patch('/strategies/:id', (req, res) => {
    const id = normaliseString(req.params.id);
    const strategy = id ? dataStore.strategies.get(id) : null;
    if (!strategy) {
        return res.status(404).json({ ok: false, message: '전략을 찾을 수 없습니다.' });
    }

    const nextActive = req.body?.active !== undefined ? Boolean(req.body.active) : !strategy.active;
    strategy.active = nextActive;
    strategy.updatedAt = nowIsoString();

    appendLog(`[ADMIN] 전략 ${strategy.name}의 상태가 업데이트되었습니다.`);

    res.json({ ok: true, strategy });
});

app.use('/api/admin', adminLimiter, adminApi);

const distDir = path.join(__dirname, 'dist');
const publicDir = path.join(__dirname, 'public');
const distIndexPath = path.join(distDir, 'index.html');
const publicIndexPath = path.join(publicDir, 'index.html');
const serviceWorkerPath = path.join(__dirname, 'service-worker.js');

[distDir, publicDir]
    .filter((dir) => fs.existsSync(dir))
    .forEach((dir) => {
        app.use(express.static(dir, { index: false }));
    });

if (fs.existsSync(serviceWorkerPath)) {
    app.get('/service-worker.js', (req, res) => {
        res.type('application/javascript').sendFile(serviceWorkerPath);
    });
}

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhook')) {
        return res.status(404).json({ error: 'Not Found' });
    }

    if (fs.existsSync(distIndexPath)) {
        return res.sendFile(distIndexPath);
    }

    if (fs.existsSync(publicIndexPath)) {
        return res.sendFile(publicIndexPath);
    }

    return res.status(200).send('Service online');
});

app.use(errorHandler);

global.io = global.io || null;

const server = app.listen(PORT, '0.0.0.0', () => {
    if (logger && typeof logger.info === 'function') {
        logger.info(`Server listening on http://0.0.0.0:${PORT}`);
    } else {
        // eslint-disable-next-line no-console
        console.log(`Server listening on http://0.0.0.0:${PORT}`);
    }
});

module.exports = server;
