const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/auth');
const adminService = require('../services/adminService');
const tradingEngine = require('../services/tradingEngine');
const gateio = require('../api/gateio');
const logger = require('../utils/logger');

// 모든 admin 라우트에 인증 적용
router.use(authenticateAdmin);

// 관리자 대시보드
router.get('/dashboard', async (req, res) => {
    try {
        const data = await adminService.getDashboardData();
        res.json(data);
    } catch (error) {
        logger.error('Dashboard error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 계정 정보
router.get('/account', async (req, res) => {
    try {
        const [balances, openOrders] = await Promise.all([
            gateio.getSpotBalances(),
            gateio.getOpenOrders()
        ]);
        
        res.json({
            balances: balances.filter(b => parseFloat(b.available) > 0 || parseFloat(b.locked) > 0),
            openOrders: openOrders,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Account info error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 트레이딩 설정 조회
router.get('/settings', async (req, res) => {
    try {
        const settings = await adminService.getSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 트레이딩 설정 업데이트
router.put('/settings', async (req, res) => {
    try {
        const result = await adminService.updateSettings(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 신호 규칙 설정
router.get('/signal-rules', async (req, res) => {
    try {
        const rules = await adminService.getSignalRules();
        res.json(rules);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/signal-rules', async (req, res) => {
    try {
        const result = await adminService.setSignalRules(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 거래 내역
router.get('/trades', async (req, res) => {
    try {
        const { symbol, limit = 100, start_date, end_date } = req.query;
        const trades = await adminService.getTrades({
            symbol,
            limit: parseInt(limit),
            start_date,
            end_date
        });
        res.json(trades);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 수동 주문
router.post('/manual-order', async (req, res) => {
    try {
        const { symbol, side, amount, price, type = 'limit' } = req.body;
        
        if (!symbol || !side || !amount) {
            return res.status(400).json({ 
                error: 'Missing required fields: symbol, side, amount' 
            });
        }
        
        const order = await gateio.createSpotOrder(
            symbol,
            side,
            amount,
            price,
            type
        );
        
        logger.info('Manual order created:', order);
        res.json(order);
    } catch (error) {
        logger.error('Manual order error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 주문 취소
router.delete('/orders/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { symbol } = req.query;
        
        const result = await gateio.cancelOrder(orderId, symbol);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 모든 주문 취소
router.delete('/orders', async (req, res) => {
    try {
        const { symbol } = req.query;
        const result = await gateio.cancelAllOrders(symbol);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 트레이딩 엔진 제어
router.post('/engine/start', async (req, res) => {
    try {
        tradingEngine.start();
        logger.info('Trading engine started by admin');
        res.json({ status: 'started' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/engine/stop', async (req, res) => {
    try {
        tradingEngine.stop();
        logger.warn('Trading engine stopped by admin');
        res.json({ status: 'stopped' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/engine/status', (req, res) => {
    res.json({
        active: tradingEngine.isActive,
        positions: Array.from(tradingEngine.positions.entries()),
        timestamp: new Date().toISOString()
    });
});

// 긴급 정지
router.post('/emergency-stop', async (req, res) => {
    try {
        // 트레이딩 엔진 정지
        tradingEngine.stop();
        
        // 모든 열린 주문 취소
        const cancelResult = await gateio.cancelAllOrders();
        
        logger.error('EMERGENCY STOP activated by admin');
        
        res.json({ 
            status: 'emergency_stopped',
            orders_cancelled: cancelResult,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Emergency stop error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
