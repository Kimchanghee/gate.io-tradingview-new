const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();

// Cloud Run이 설정하는 PORT 환경변수 사용
const PORT = process.env.PORT || 8080;

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
=======
// 정적 파일 경로 구성 (dist 우선, 없으면 public)
const staticDirectories = [
    path.join(__dirname, 'dist'),
    path.join(__dirname, 'public')
].filter(dir => fs.existsSync(dir));

staticDirectories.forEach(dir => {
    app.use(express.static(dir));
});

const resolveDashboardFile = () => {
    const candidates = [
        path.join(__dirname, 'dist', 'index.html'),
        path.join(__dirname, 'public', 'index.html')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
};

const shouldReturnJson = (req) => {
    if (req.query.format === 'json') {
        return true;
    }

    const acceptHeader = req.headers.accept || '';
    if (!acceptHeader) {
        // 기본적으로 브라우저는 text/html을 요청하므로, 명시적인 Accept가 없으면 HTML 반환
        return false;
    }

    const accepts = req.accepts(['html', 'json']);
    if (accepts === 'json') {
        return true;
    }

    if (acceptHeader.includes('application/json') && !acceptHeader.includes('text/html')) {
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

// 0.0.0.0에 바인딩하여 모든 네트워크 인터페이스에서 수신
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
    console.log(`Health check available at http://0.0.0.0:${PORT}/health`);
});
