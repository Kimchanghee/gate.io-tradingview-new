require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const rateLimiter = require('./middleware/rateLimiter');
const generalLimiter = rateLimiter;
const webhookLimiter = rateLimiter.webhookLimiter;
const adminLimiter = rateLimiter.adminLimiter;
const errorHandler = require('./middleware/errorHandler');
const statusRouter = require('./routes/status');
const tradingRouter = require('./routes/trading');
const adminRouter = require('./routes/admin');
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

app.disable('x-powered-by');

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : true;

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(generalLimiter);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/status', statusRouter);
app.use('/api/trading', tradingRouter);
app.use('/api/admin', adminLimiter, adminRouter);
app.use('/webhook', webhookLimiter, webhookRouter);

const distDir = path.join(__dirname, 'dist');
const publicDir = path.join(__dirname, 'public');
const serviceWorkerPath = path.join(__dirname, 'service-worker.js');
const distIndexPath = path.join(distDir, 'index.html');
const publicIndexPath = path.join(publicDir, 'index.html');

if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false }));
}

if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir, { index: false }));
}

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
