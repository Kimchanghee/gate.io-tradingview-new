const fs = require('fs');
const path = require('path');
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

// 0.0.0.0에 바인딩하여 모든 네트워크 인터페이스에서 수신
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
    console.log(`Health check available at http://0.0.0.0:${PORT}/health`);
});
