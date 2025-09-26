const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const express = require('express');
const app = express();

// Cloud Run injects the PORT environment variable
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
            gateConnections: {},
            createdAt: nowIsoString(),
            updatedAt: nowIsoString(),
            approvedAt: null,
            signals: [],
            positions: []
        };
        dataStore.users.set(uid, newUser);
    }
    const user = dataStore.users.get(uid);
    if (user && !user.gateConnections) {
        user.gateConnections = {};
    }
    return user;
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

const normaliseNetworkKey = (value) => {
    const normalised = normaliseString(value, 'mainnet').toLowerCase();
    return normalised === 'testnet' ? 'testnet' : 'mainnet';
};

const toNumber = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return 0;
        }
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const ensureGateConnections = (user) => {
    if (user && !user.gateConnections) {
        user.gateConnections = {};
    }
    return user?.gateConnections || {};
};

class GateIoClient {
    constructor({ apiKey, apiSecret, network }) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.network = normaliseNetworkKey(network);
        const base = this.network === 'testnet' ? DEFAULT_TESTNET_API_BASE : DEFAULT_MAINNET_API_BASE;
        this.host = base.replace(/\/$/, '');
        this.pathPrefix = '/api/v4';
    }

    buildHeaders(method, path, queryString, payload) {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const hashedPayload = crypto
            .createHash('sha512')
            .update(payload || '')
            .digest('hex');

        const signatureBase = [
            method.toUpperCase(),
            path,
            queryString,
            hashedPayload,
            timestamp
        ].join('\n');

        const signature = crypto
            .createHmac('sha512', this.apiSecret)
            .update(signatureBase)
            .digest('hex');

        return {
            KEY: this.apiKey,
            SIGN: signature,
            Timestamp: timestamp
        };
    }

    buildQuery(params = {}) {
        const search = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') {
                return;
            }
            if (Array.isArray(value)) {
                value.forEach((item) => search.append(key, String(item)));
            } else {
                search.append(key, String(value));
            }
        });
        return search;
    }

    async request(method, endpoint, params = {}, data = null) {
        if (!this.apiKey || !this.apiSecret) {
            const error = new Error('Gate.io API credentials are missing');
            error.code = 'missing_credentials';
            throw error;
        }

        const path = endpoint.startsWith('/') ? `${this.pathPrefix}${endpoint}` : `${this.pathPrefix}/${endpoint}`;
        const query = this.buildQuery(params);
        const queryString = query.toString();
        const payload = data ? JSON.stringify(data) : '';
        const headers = this.buildHeaders(method, path, queryString, payload);
        const fullUrl = `${this.host}${path}${queryString ? `?${queryString}` : ''}`;

        const response = await axios({
            method,
            url: fullUrl,
            data: data ?? undefined,
            headers: {
                ...headers,
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            timeout: 10000,
            validateStatus: () => true
        });

        if (response.status >= 400) {
            const error = new Error(`Gate.io API responded with status ${response.status}`);
            error.response = response;
            throw error;
        }

        return response.data;
    }

    getFuturesAccount(settle = 'usdt') {
        return this.request('GET', `/futures/${settle}/accounts`);
    }

    getSpotAccounts() {
        return this.request('GET', '/spot/accounts');
    }

    getMarginAccounts() {
        return this.request('GET', '/margin/accounts');
    }

    getOptionsAccount() {
        return this.request('GET', '/options/accounts');
    }

    getTotalBalance(currency = 'USDT') {
        return this.request('GET', '/wallet/total_balance', { currency });
    }
}

const mapFuturesAccount = (raw) => {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const total = toNumber(raw.total ?? raw.balance);
    const available = toNumber(raw.available ?? raw.available_margin ?? raw.availableBalance);
    const positionMargin = toNumber(raw.position_margin ?? raw.positionMargin);
    const orderMargin = toNumber(raw.order_margin ?? raw.orderMargin);
    const unrealisedPnl = toNumber(raw.unrealised_pnl ?? raw.unrealized_pnl ?? raw.unrealizedPnl);
    const currency = normaliseString(raw.currency || raw.settle || '', 'USDT').toUpperCase();

    if ([total, available, positionMargin, orderMargin, unrealisedPnl].every((value) => value === 0)) {
        return null;
    }

    return {
        total,
        available,
        positionMargin,
        orderMargin,
        unrealisedPnl,
        currency
    };
};

const mapSpotBalances = (rows) => {
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows
        .map((row) => {
            const currency = normaliseString(row.currency, '').toUpperCase();
            const available = toNumber(row.available);
            const locked = toNumber(row.locked);
            const total = toNumber(row.total);
            const computedTotal = total || available + locked;
            return {
                currency,
                available,
                locked,
                total: computedTotal
            };
        })
        .filter((item) => item.total > 0 || item.available > 0 || item.locked > 0);
};

const mapMarginAccounts = (rows) => {
    let source = [];
    if (Array.isArray(rows)) {
        source = rows;
    } else if (rows && typeof rows === 'object') {
        source = Object.values(rows);
    } else {
        return [];
    }

    return source
        .map((row) => {
            const base = row.base || {};
            const quote = row.quote || {};
            return {
                currencyPair: normaliseString(row.currency_pair || row.currencyPair),
                base: {
                    currency: normaliseString(base.currency),
                    available: toNumber(base.available),
                    locked: toNumber(base.locked),
                    borrowed: toNumber(base.loan ?? base.borrowed),
                    interest: toNumber(base.interest)
                },
                quote: {
                    currency: normaliseString(quote.currency),
                    available: toNumber(quote.available),
                    locked: toNumber(quote.locked),
                    borrowed: toNumber(quote.loan ?? quote.borrowed),
                    interest: toNumber(quote.interest)
                },
                risk: toNumber(row.risk)
            };
        })
        .filter((entry) => {
            const baseTotals = entry.base.available + entry.base.locked + entry.base.borrowed;
            const quoteTotals = entry.quote.available + entry.quote.locked + entry.quote.borrowed;
            return baseTotals > 0 || quoteTotals > 0;
        });
};

const mapOptionsAccount = (raw) => {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const total = toNumber(raw.total);
    const available = toNumber(raw.available);
    const positionValue = toNumber(raw.position_value ?? raw.position_margin ?? raw.positionMargin);
    const orderMargin = toNumber(raw.order_margin ?? raw.orderMargin);
    const unrealisedPnl = toNumber(raw.unrealised_pnl ?? raw.unrealized_pnl ?? raw.unrealizedPnl);

    if ([total, available, positionValue, orderMargin, unrealisedPnl].every((value) => value === 0)) {
        return null;
    }

    return {
        total,
        available,
        positionValue,
        orderMargin,
        unrealisedPnl
    };
};

const computeTotalEstimatedValue = (accounts, totalBalancePayload) => {
    const totalFromPayload = totalBalancePayload
        ? toNumber(totalBalancePayload.total ?? totalBalancePayload.amount ?? totalBalancePayload.balance)
        : 0;

    if (totalFromPayload > 0) {
        return totalFromPayload;
    }

    let derivedTotal = 0;
    if (accounts.futures) {
        derivedTotal += toNumber(accounts.futures.total);
    }
    if (accounts.options) {
        derivedTotal += toNumber(accounts.options.total);
    }
    derivedTotal += accounts.spot
        .filter((balance) => balance.currency === 'USDT')
        .reduce((acc, balance) => acc + toNumber(balance.total), 0);

    return derivedTotal;
};

const fetchGateAccounts = async (client) => {
    const accounts = buildEmptyAccounts();

    const [futuresResult, spotResult, marginResult, optionsResult, totalResult] = await Promise.allSettled([
        client.getFuturesAccount('usdt'),
        client.getSpotAccounts(),
        client.getMarginAccounts(),
        client.getOptionsAccount(),
        client.getTotalBalance('USDT')
    ]);

    const authFailure = [futuresResult, spotResult, marginResult, optionsResult, totalResult].find(
        (result) =>
            result.status === 'rejected' &&
            result.reason &&
            result.reason.response &&
            result.reason.response.status === 401
    );

    if (authFailure) {
        const error = new Error('Gate.io rejected credentials');
        error.code = 'invalid_credentials';
        error.status = authFailure.reason.response.status;
        error.response = authFailure.reason.response;
        throw error;
    }

    if (futuresResult.status === 'fulfilled') {
        const futuresAccount = mapFuturesAccount(futuresResult.value);
        if (futuresAccount) {
            accounts.futures = futuresAccount;
        }
    } else if (futuresResult.status === 'rejected') {
        console.warn('Failed to load Gate.io futures account:', futuresResult.reason?.response?.data || futuresResult.reason?.message || futuresResult.reason);
    }

    if (!accounts.futures) {
        try {
            const btcFutures = await client.getFuturesAccount('btc');
            const mapped = mapFuturesAccount(btcFutures);
            if (mapped) {
                accounts.futures = mapped;
            }
        } catch (btcError) {
            const status = btcError.response?.status;
            if (status && status !== 404) {
                console.warn('Failed to load Gate.io BTC-settled futures account:', btcError.response?.data || btcError.message || btcError);
            }
        }
    }

    if (spotResult.status === 'fulfilled') {
        accounts.spot = mapSpotBalances(spotResult.value);
    } else if (spotResult.status === 'rejected') {
        console.warn('Failed to load Gate.io spot balances:', spotResult.reason?.response?.data || spotResult.reason?.message || spotResult.reason);
    }

    if (marginResult.status === 'fulfilled') {
        accounts.margin = mapMarginAccounts(marginResult.value);
    } else if (marginResult.status === 'rejected') {
        const status = marginResult.reason?.response?.status;
        if (status !== 404) {
            console.warn('Failed to load Gate.io margin balances:', marginResult.reason?.response?.data || marginResult.reason?.message || marginResult.reason);
        }
    }

    if (optionsResult.status === 'fulfilled') {
        const rawOptions = optionsResult.value;
        const optionEntries = Array.isArray(rawOptions) ? rawOptions : [rawOptions];
        for (const entry of optionEntries) {
            const optionsAccount = mapOptionsAccount(entry);
            if (optionsAccount) {
                accounts.options = optionsAccount;
                break;
            }
        }
    } else if (optionsResult.status === 'rejected') {
        const status = optionsResult.reason?.response?.status;
        if (status !== 404) {
            console.warn('Failed to load Gate.io options account:', optionsResult.reason?.response?.data || optionsResult.reason?.message || optionsResult.reason);
        }
    }

    const totalPayload = totalResult.status === 'fulfilled' ? totalResult.value : null;
    if (totalResult.status === 'rejected') {
        console.warn('Failed to load Gate.io total balance:', totalResult.reason?.response?.data || totalResult.reason?.message || totalResult.reason);
    }

    accounts.totalEstimatedValue = computeTotalEstimatedValue(accounts, totalPayload);

    return accounts;
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
            message: 'UID가 ??????'
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
            message: 'UID???????'
        });
    }

    const user = ensureUserExists(uid);

    if (user.status === 'approved') {
        return res.json({
            ok: true,
            status: user.status,
            message: '?? ???????????',
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

    appendLog(`[USER] UID ${uid}가 ?????????`);

    return res.json({
        ok: true,
        status: user.status,
        message: '?????????????'
    });
};

const handleUserSignals = (req, res) => {
    const { user, error, status } = resolveUserForCredentialCheck(req.query.uid, req.query.key);
    if (error) {
        return res.status(status).json({
            ok: false,
            code: error,
            message: '???가??? 못했????'
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
                message: 'UID? ?????? ??????',
                positions: []
            });
        }
        return res.status(status).json({
            code: error,
            message: '?????가??? 못했????',
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
            message: '관리자 ??????????'
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
            issues: dataStore.webhook.url ? [] : ['???URL?????? ??????'],
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

    appendLog('[WEBHOOK] ?????URL??????????');

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

    appendLog('[WEBHOOK] ????????????????????');

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
        return res.status(400).json({ ok: false, message: 'UID가 ??????' });
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

    appendLog(`[ADMIN] UID ${uid}가 ????????`);

    res.json({ ok: true, status: user.status, accessKey: user.accessKey });
});

adminRouter.post('/users/deny', (req, res) => {
    const uid = normaliseString(req.body?.uid);
    if (!uid) {
        return res.status(400).json({ ok: false, message: 'UID가 ??????' });
    }

    const user = ensureUserExists(uid);
    user.status = 'denied';
    user.approvedStrategies = [];
    user.accessKey = null;
    user.autoTradingEnabled = false;
    user.updatedAt = nowIsoString();

    appendLog(`[ADMIN] UID ${uid}가 거절??????`, 'warn');

    res.json({ ok: true, status: user.status });
});

adminRouter.delete('/users/:uid', (req, res) => {
    const uid = normaliseString(req.params.uid);
    if (!uid || !dataStore.users.has(uid)) {
        return res.status(404).json({ ok: false, message: '???? 찾을 ???????' });
    }

    dataStore.users.delete(uid);
    appendLog(`[ADMIN] UID ${uid}가 ????????`, 'warn');
    res.json({ ok: true });
});

adminRouter.post('/strategies', (req, res) => {
    const name = normaliseString(req.body?.name);
    if (!name) {
        return res.status(400).json({ ok: false, message: '????????????' });
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
    appendLog(`[ADMIN] ?????${name}??가) ???????`);
    res.json({ ok: true, strategy });
});

adminRouter.patch('/strategies/:id', (req, res) => {
    const id = normaliseString(req.params.id);
    const strategy = id ? dataStore.strategies.get(id) : null;
    if (!strategy) {
        return res.status(404).json({ ok: false, message: '????찾을 ???????' });
    }

    const nextActive = req.body?.active !== undefined ? Boolean(req.body.active) : !strategy.active;
    strategy.active = nextActive;
    strategy.updatedAt = nowIsoString();

    appendLog(`[ADMIN] ???${strategy.name}????? ??????????`);

    res.json({ ok: true, strategy });
});

// 미들???
app.use(express.json());

const distDir = path.join(__dirname, 'dist');
const publicDir = path.join(__dirname, 'public');
const distIndexPath = path.join(distDir, 'index.html');
const publicIndexPath = path.join(publicDir, 'index.html');
const serviceWorkerPath = path.join(__dirname, 'service-worker.js');

// ??????경로 구성 (index.html? 직접 ??
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

const resolveDashboardFile = () => {
    if (fs.existsSync(distIndexPath)) {
        return distIndexPath;
    }
    if (fs.existsSync(publicIndexPath)) {
        return publicIndexPath;
    }
    return null;
};

const serveDashboard = (req, res) => {
    const dashboardFile = resolveDashboardFile();

    if (!dashboardFile) {
        return res
            .status(500)
            .type('text/plain; charset=utf-8')
            .send('Dashboard bundle is missing. Please run `npm run build` before starting the server.');
    }

    return res.sendFile(dashboardFile);
};

// Health check endpoint - Cloud Run probes rely on this
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root endpoint serves SPA dashboard
app.get('/', serveDashboard);

// Admin/FE routes resolve to the same dashboard bundle
app.get(['/admin', '/admin/*'], serveDashboard);

app.get(['/api/logs', '/logs'], (req, res) => {
    res.json({ logs: serialiseLogs() });
});

app.post(['/api/metrics/visit', '/metrics/visit'], (req, res) => {
    const providedSessionId = normaliseString(req.body?.sessionId);
    const sessionId = providedSessionId || (crypto.randomUUID ? crypto.randomUUID() : 'session_' + Math.random().toString(16).slice(2, 10));
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

app.post('/api/connect', async (req, res) => {
    try {
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
                message: 'Gate.io API key and secret are required.'
            });
        }

        const { user, error, status } = resolveUserForCredentialCheck(uid, accessKey);
        if (error) {
            return res.status(status).json({
                ok: false,
                code: error,
                message: 'User authorization failed. Please reauthenticate.'
            });
        }

        const network = resolveNetwork(isTestnet);
        const apiBaseUrl = network === 'testnet' ? DEFAULT_TESTNET_API_BASE : DEFAULT_MAINNET_API_BASE;
        const client = new GateIoClient({
            apiKey: normalisedKey,
            apiSecret: normalisedSecret,
            network
        });

        let accounts;
        try {
            accounts = await fetchGateAccounts(client);
        } catch (apiError) {
            const statusCode = apiError.status || apiError.response?.status;
            if (apiError.code === 'invalid_credentials' || statusCode === 401 || statusCode === 403) {
                return res.status(401).json({
                    ok: false,
                    code: 'invalid_credentials',
                    message: 'Gate.io rejected the API credentials. Please verify the key, secret, and enabled permissions.'
                });
            }

            console.error('Failed to verify Gate.io credentials:', apiError.response?.data || apiError.message || apiError);
            return res.status(502).json({
                ok: false,
                message: 'Unable to verify Gate.io API credentials at the moment. Please try again.'
            });
        }

        const userConnections = ensureGateConnections(user);
        userConnections[network] = {
            apiKey: normalisedKey,
            apiSecret: normalisedSecret,
            apiBaseUrl,
            connectedAt: nowIsoString(),
            lastUsedAt: nowIsoString(),
            lastAccounts: accounts
        };

        appendLog(`[CONNECT] UID ${normaliseString(uid) || 'unknown'} connected to ${network} network.`);

        return res.json({
            ok: true,
            message: 'Gate.io API connection established.',
            network,
            apiBaseUrl,
            accounts,
            autoTradingEnabled: Boolean(user.autoTradingEnabled)
        });
    } catch (error) {
        console.error('Unexpected error handling /api/connect:', error.response?.data || error.message || error);
        return res.status(500).json({
            ok: false,
            message: 'Failed to connect to Gate.io API.'
        });
    }
});

app.post('/api/disconnect', (req, res) => {
    console.log('Received disconnect request', {
        hasUid: !!(req.body && req.body.uid),
        network: resolveNetwork(req.body && req.body.network)
    });
    res.json({ ok: true });
});

app.get('/api/accounts/all', async (req, res) => {
    try {
        const uid = req.query?.uid;
        const key = req.query?.key;
        const requestedNetwork = normaliseNetworkKey(req.query?.network);
        const { user, error, status } = resolveUserForCredentialCheck(uid, key);
        if (error) {
            return res.status(status).json({
                ok: false,
                code: error,
                message: 'Unable to verify UID credentials.'
            });
        }

        const connections = ensureGateConnections(user);
        const storedConnection = connections[requestedNetwork];

        if (!storedConnection) {
            return res.status(400).json({
                ok: false,
                code: 'api_not_connected',
                message: 'API credentials for this network are not configured. Please connect first.'
            });
        }

        const client = new GateIoClient({
            apiKey: storedConnection.apiKey,
            apiSecret: storedConnection.apiSecret,
            network: requestedNetwork
        });

        let accounts;
        try {
            accounts = await fetchGateAccounts(client);
        } catch (apiError) {
            const statusCode = apiError.status || apiError.response?.status;
            if (apiError.code === 'invalid_credentials' || statusCode === 401 || statusCode === 403) {
                return res.status(401).json({
                    ok: false,
                    code: 'invalid_credentials',
                    message: 'Gate.io rejected the stored credentials. Please reconnect with updated API keys.'
                });
            }

            console.error('Failed to refresh Gate.io accounts:', apiError.response?.data || apiError.message || apiError);
            return res.status(502).json({
                ok: false,
                message: 'Unable to fetch Gate.io account balances right now. Please retry later.'
            });
        }

        storedConnection.lastUsedAt = nowIsoString();
        storedConnection.lastAccounts = accounts;

        return res.json(accounts);
    } catch (error) {
        console.error('Unexpected error in /api/accounts/all:', error.response?.data || error.message || error);
        return res.status(500).json({
            ok: false,
            message: 'Failed to refresh Gate.io accounts.'
        });
    }
});

app.post('/api/trading/auto', (req, res) => {
    const enabled = !!(req.body && req.body.enabled);
    res.json({ ok: true, autoTradingEnabled: enabled });
});

app.use('/api/admin', adminRouter);

// Bind to 0.0.0.0 so Cloud Run accepts traffic from any interface
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
    console.log(`Health check available at http://0.0.0.0:${PORT}/health`);
});


