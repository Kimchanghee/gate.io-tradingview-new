const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const app = express();

// Cloud Run이 설정하는 PORT 환경변수 사용
const PORT = process.env.PORT || 8080;

const DEFAULT_MAINNET_API_BASE = 'https://api.gateio.ws';
const DEFAULT_TESTNET_API_BASE = 'https://fx-api-testnet.gateio.ws';

const normaliseString = (value, fallback = '') => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || fallback;
    }
    if (value === null || value === undefined) {
        return fallback;
    }
    return String(value);
};

const resolveNetwork = (isTestnet) => {
    if (typeof isTestnet === 'string') {
        const lowered = isTestnet.trim().toLowerCase();
        if (['true', '1', 'testnet'].includes(lowered)) {
            return 'testnet';
        }
        if (['false', '0', 'mainnet'].includes(lowered)) {
            return 'mainnet';
        }
    }
    if (isTestnet) {
        return 'testnet';
    }
    return 'mainnet';
};

const buildEmptyAccounts = () => ({
    futures: null,
    spot: [],
    margin: [],
    options: null,
    totalEstimatedValue: 0
});

const nowIsoString = () => new Date().toISOString();

const generateLogEntry = (message, level = 'info') => ({
    id: `log-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: nowIsoString(),
    message,
    level
});

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

const appendLog = (message, level = 'info') => {
    dataStore.logs.push(generateLogEntry(message, level));
    if (dataStore.logs.length > 500) {
        dataStore.logs.splice(0, dataStore.logs.length - 500);
    }
};

const generateAccessKey = () => {
    if (crypto.randomUUID) {
        return `access_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    }
    return `access_${Math.random().toString(16).slice(2, 14)}`;
};

const mapStrategyIdsToNamedList = (ids = []) => {
    return ids
        .filter((id) => typeof id === 'string' && id)
        .map((id) => {
            const strategy = dataStore.strategies.get(id);
            return {
                id,
                name: strategy?.name || id
            };
        });
};

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

const buildUserStatusPayload = (user) => ({
    status: user.status,
    requestedStrategies: mapStrategyIdsToNamedList(user.requestedStrategies),
    approvedStrategies: mapStrategyIdsToNamedList(user.approvedStrategies),
    accessKey: user.accessKey,
    autoTradingEnabled: Boolean(user.autoTradingEnabled)
});

const ensureUserExists = (uid) => {
    if (!uid) {
        return null;
    }
    if (!dataStore.users.has(uid)) {
        const newUser = {
            uid,
            status: 'not_registered',
            requestedStrategies: [],
            approvedStrategies: [],
            accessKey: null,
            autoTradingEnabled: false,
            createdAt: nowIsoString(),
            updatedAt: nowIsoString(),
            approvedAt: null,
            signals: [],
            positions: []
        };
        dataStore.users.set(uid, newUser);
    }
    return dataStore.users.get(uid);
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

const serialiseLogs = () => dataStore.logs.slice().reverse();

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

const handleUserStatus = (req, res) => {
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
};

const handleRegister = (req, res) => {
    const uid = normaliseString(req.body && req.body.uid);
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
    if (!user.requestedStrategies.length) {
        user.requestedStrategies = serialiseStrategies()
            .filter((strategy) => strategy.active)
            .map((strategy) => strategy.id);
    }

    appendLog(`[USER] UID ${uid}가 등록을 요청했습니다.`);

    return res.json({
        ok: true,
        status: user.status,
        message: '등록 요청이 접수되었습니다.'
    });
};

const handleUserSignals = (req, res) => {
    const { user, error, status } = resolveUserForCredentialCheck(req.query.uid, req.query.key);
    if (error) {
        return res.status(status).json({
            ok: false,
            code: error,
            message: '신호를 가져오지 못했습니다.'
        });
    }

    const signals = Array.isArray(user.signals) ? user.signals.slice() : [];
    if (signals.length) {
        dataStore.metrics.lastSignal = signals[signals.length - 1];
        dataStore.metrics.signalRecipients.lastSignalAt = dataStore.metrics.lastSignal.timestamp;
        dataStore.metrics.signalRecipients.lastDeliveredCount = signals.length;
    }

    return res.json({
        ok: true,
        signals
    });
};

const handlePositions = (req, res) => {
    const { user, error, status } = resolveUserForCredentialCheck(req.query.uid, req.query.key);
    if (error) {
        if (error === 'missing_credentials') {
            return res.status(status).json({
                code: error,
                message: 'UID와 액세스 키가 필요합니다.',
                positions: []
            });
        }
        return res.status(status).json({
            code: error,
            message: '포지션을 가져오지 못했습니다.',
            positions: []
        });
    }

    const positions = Array.isArray(user.positions) ? user.positions.slice() : [];
    return res.json({
        ok: true,
        positions
    });
};

const adminAuthMiddleware = (req, res, next) => {
    const token = normaliseString(req.headers['x-admin-token']);
    if (!token || token !== ADMIN_TOKEN) {
        return res.status(401).json({
            ok: false,
            message: '관리자 인증에 실패했습니다.'
        });
    }
    return next();
};

const adminRouter = express.Router();
adminRouter.use(adminAuthMiddleware);

adminRouter.get('/overview', (req, res) => {
    const users = serialiseUsersForAdmin();
    const strategies = serialiseStrategies();
    const stats = {
        totalUsers: users.length,
        pending: users.filter((user) => user.status === 'pending').length,
        approved: users.filter((user) => user.status === 'approved').length
    };

    res.json({
        users,
        strategies,
        stats
    });
});

adminRouter.get('/signals', (req, res) => {
    const strategyId = normaliseString(req.query.strategy);
    const filtered = dataStore.signals.filter((signal) => {
        if (!strategyId) return true;
        return signal.strategyId === strategyId;
    });

    res.json({
        ok: true,
        signals: filtered.slice().reverse()
    });
});

adminRouter.get('/metrics', (req, res) => {
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
        },
        googleSheets: {
            configured: false,
            lastStatus: 'disabled',
            lastSyncAt: null,
            lastError: null
        }
    });
});

adminRouter.get('/webhook', (req, res) => {
    if (!dataStore.webhook.url) {
        return res.status(404).json({ ok: false, message: 'Webhook not configured' });
    }
    return res.json({
        url: dataStore.webhook.url,
        secret: dataStore.webhook.secret,
        createdAt: dataStore.webhook.createdAt,
        updatedAt: dataStore.webhook.updatedAt,
        alreadyExists: true
    });
});

adminRouter.post('/webhook', (req, res) => {
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

adminRouter.put('/webhook/routes', (req, res) => {
    const strategies = Array.isArray(req.body?.strategies) ? req.body.strategies : [];
    dataStore.webhook.routes = strategies
        .map((id) => normaliseString(id))
        .filter((id) => id && dataStore.strategies.has(id));
    dataStore.webhook.updatedAt = nowIsoString();

    appendLog('[WEBHOOK] 전달 대상 전략이 업데이트되었습니다.');

    res.json({ ok: true, routes: dataStore.webhook.routes });
});

adminRouter.get('/webhook/deliveries', (req, res) => {
    res.json({
        deliveries: dataStore.webhookDeliveries.slice().reverse()
    });
});

adminRouter.post('/users/approve', (req, res) => {
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

    dataStore.metrics.signalRecipients.active = Array.from(dataStore.users.values()).filter((item) => item.status === 'approved').length;

    appendLog(`[ADMIN] UID ${uid}가 승인되었습니다.`);

    res.json({ ok: true, status: user.status, accessKey: user.accessKey });
});

adminRouter.post('/users/deny', (req, res) => {
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

    appendLog(`[ADMIN] UID ${uid}가 거절되었습니다.`, 'warn');

    res.json({ ok: true, status: user.status });
});

adminRouter.delete('/users/:uid', (req, res) => {
    const uid = normaliseString(req.params.uid);
    if (!uid || !dataStore.users.has(uid)) {
        return res.status(404).json({ ok: false, message: '사용자를 찾을 수 없습니다.' });
    }

    dataStore.users.delete(uid);
    appendLog(`[ADMIN] UID ${uid}가 삭제되었습니다.`, 'warn');
    res.json({ ok: true });
});

adminRouter.post('/strategies', (req, res) => {
    const name = normaliseString(req.body?.name);
    if (!name) {
        return res.status(400).json({ ok: false, message: '전략 이름이 필요합니다.' });
    }

    const idBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'strategy';
    let id = idBase;
    let counter = 1;
    while (dataStore.strategies.has(id)) {
        id = `${idBase}-${counter}`;
        counter += 1;
    }

    const strategy = {
        id,
        name,
        description: normaliseString(req.body?.description),
        active: true,
        createdAt: nowIsoString(),
        updatedAt: nowIsoString()
    };

    dataStore.strategies.set(id, strategy);
    appendLog(`[ADMIN] 새 전략 ${name}이(가) 추가되었습니다.`);
    res.json({ ok: true, strategy });
});

adminRouter.patch('/strategies/:id', (req, res) => {
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

// 미들웨어
app.use(express.json());

const distDir = path.join(__dirname, 'dist');
const publicDir = path.join(__dirname, 'public');
const distIndexPath = path.join(distDir, 'index.html');
const publicIndexPath = path.join(publicDir, 'index.html');
const serviceWorkerPath = path.join(__dirname, 'service-worker.js');

// 정적 파일 경로 구성 (index.html은 직접 서빙)
[
    distDir,
    publicDir
]
    .filter((dir) => fs.existsSync(dir))
    .forEach((dir) => {
        app.use(express.static(dir, { index: false }));
    });

if (fs.existsSync(serviceWorkerPath)) {
    app.get('/service-worker.js', (req, res) => {
        res.type('application/javascript').sendFile(serviceWorkerPath);
    });
}

const fileExists = (filePath) => {
    try {
        const stats = fs.statSync(filePath);
        return stats.isFile();
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`Failed to stat ${filePath}`, err);
        }
        return false;
    }
};

let loggedMissingBundle = false;
let lastResolvedDashboard = null;

const resolveDashboardFile = () => {
    if (fileExists(distIndexPath)) {
        if (lastResolvedDashboard !== distIndexPath) {
            console.log(`Serving dashboard from ${distIndexPath}`);
            lastResolvedDashboard = distIndexPath;
        }
        return distIndexPath;
    }

    if (!loggedMissingBundle) {
        loggedMissingBundle = true;
        console.error(
            'Dashboard bundle not found at dist/index.html. Run `npm run build` before deploying the simple server.',
        );
    }

    if (process.env.ALLOW_PUBLIC_PLACEHOLDER === 'true' && fileExists(publicIndexPath)) {
        if (lastResolvedDashboard !== publicIndexPath) {
            console.warn('Falling back to public/index.html placeholder because built assets are missing.');
            lastResolvedDashboard = publicIndexPath;
        }
        return publicIndexPath;
    }

    return null;
};

const shouldReturnJson = (req) => {
    if ((req.query.format || '').toLowerCase() === 'json') {
        return true;
    }

    const acceptHeader = req.headers.accept || '';
    if (!acceptHeader) {
        // 기본적으로 브라우저는 text/html을 요청하므로, 명시적인 Accept가 없으면 HTML 반환
        return false;
    }

    // HTML을 받아들일 수 있다면 항상 UI를 우선적으로 반환한다.
    if (req.accepts('html')) {
        return false;
    }

    // HTML을 명시하지 않고 JSON만 허용할 때만 상태 JSON을 반환한다.
    if (req.accepts('json')) {
        return true;
    }

    return false;
};

const respondWithStatusJson = (res) => {
    res.json({
        message: 'Gate.io Trading Bot is running',
        port: PORT,
        timestamp: new Date().toISOString()
    });
};

const serveDashboard = (req, res) => {
    if (shouldReturnJson(req)) {
        return respondWithStatusJson(res);
    }

    const dashboardFile = resolveDashboardFile();

    if (!dashboardFile) {
        return res
            .status(500)
            .type('text/plain; charset=utf-8')
            .send('Dashboard bundle is missing. Please run `npm run build` before starting the server.');
    }

    return res.sendFile(dashboardFile);
};

// Health check endpoint - Cloud Run이 확인하는 엔드포인트
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root endpoint (대시보드 또는 JSON 상태 정보 제공)
app.get('/', serveDashboard);

// 관리자/프론트엔드 라우트는 모두 동일한 대시보드를 서빙
app.get(['/admin', '/admin/*'], serveDashboard);

app.get(['/api/logs', '/logs'], (req, res) => {
    res.json({ logs: serialiseLogs() });
});

app.post(['/api/metrics/visit', '/metrics/visit'], (req, res) => {
    const providedSessionId = normaliseString(req.body?.sessionId);
    const sessionId = providedSessionId || (crypto.randomUUID ? crypto.randomUUID() : `session_${Math.random().toString(16).slice(2, 10)}`);
    const pathVisited = normaliseString(req.body?.path) || '/';
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

app.get(['/api/user/status', '/status'], handleUserStatus);
app.post(['/api/register', '/register'], handleRegister);
app.get(['/api/user/signals', '/signals'], handleUserSignals);
app.get(['/api/positions', '/positions'], handlePositions);

// Webhook endpoint
app.post('/webhook', (req, res) => {
    console.log('Webhook received:', req.body);
    res.json({
        status: 'received',
        body: req.body
    });
});

app.post('/api/connect', (req, res) => {
    const {
        uid,
        accessKey,
        apiKey,
        apiSecret,
        isTestnet
    } = req.body || {};

    const normalisedKey = normaliseString(apiKey);
    const normalisedSecret = normaliseString(apiSecret);

    if (!normalisedKey || !normalisedSecret) {
        return res.status(400).json({
            ok: false,
            code: 'missing_credentials',
            message: 'API Key와 Secret을 모두 입력해주세요.'
        });
    }

    const network = resolveNetwork(isTestnet);
    const apiBaseUrl = network === 'testnet' ? DEFAULT_TESTNET_API_BASE : DEFAULT_MAINNET_API_BASE;

    console.log('Received connect request', {
        hasUid: !!uid,
        hasAccessKey: !!accessKey,
        network
    });

    return res.json({
        ok: true,
        message: 'Gate.io API 연결이 설정되었습니다.',
        network,
        apiBaseUrl,
        accounts: buildEmptyAccounts(),
        autoTradingEnabled: false
    });
});

app.post('/api/disconnect', (req, res) => {
    console.log('Received disconnect request', {
        hasUid: !!(req.body && req.body.uid),
        network: resolveNetwork(req.body && req.body.network)
    });
    res.json({ ok: true });
});

app.get('/api/accounts/all', (req, res) => {
    res.json(buildEmptyAccounts());
});

app.post('/api/trading/auto', (req, res) => {
    const enabled = !!(req.body && req.body.enabled);
    res.json({ ok: true, autoTradingEnabled: enabled });
});

app.use('/api/admin', adminRouter);

// 0.0.0.0에 바인딩하여 모든 네트워크 인터페이스에서 수신
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
    console.log(`Health check available at http://0.0.0.0:${PORT}/health`);
});
