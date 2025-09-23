const express = require('express');
const router = express.Router();
const os = require('os');
const gateio = require('../api/gateio');
const tradingEngine = require('../services/tradingEngine');

// 시스템 상태
router.get('/system', (req, res) => {
    res.json({
        status: 'online',
        uptime: process.uptime(),
        memory: {
            used: process.memoryUsage().heapUsed / 1024 / 1024,
            total: process.memoryUsage().heapTotal / 1024 / 1024,
            system: os.totalmem() / 1024 / 1024 / 1024
        },
        cpu: os.loadavg(),
        timestamp: new Date().toISOString()
    });
});

// API 연결 상태
router.get('/api', async (req, res) => {
    try {
        await gateio.getAccountInfo();
        res.json({ 
            gateio: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({ 
            gateio: 'disconnected',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 트레이딩 엔진 상태
router.get('/engine', (req, res) => {
    res.json({
        active: tradingEngine.isActive,
        positions: tradingEngine.positions.size,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
