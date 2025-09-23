const express = require('express');
const router = express.Router();
const gateio = require('../api/gateio');
const logger = require('../utils/logger');

// 시장 데이터
router.get('/market/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const [ticker, orderBook, stats] = await Promise.all([
            gateio.getMarketPrice(symbol),
            gateio.getOrderBook(symbol, 5),
            gateio.get24hStats(symbol)
        ]);
        
        res.json({
            symbol: symbol,
            price: ticker.last,
            orderBook: orderBook,
            stats24h: stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Market data error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 차트 데이터
router.get('/candles/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { interval = '1h', limit = 100 } = req.query;
        
        const candles = await gateio.getCandlesticks(symbol, interval, limit);
        res.json(candles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 포지션 조회
router.get('/positions', async (req, res) => {
    try {
        const balances = await gateio.getSpotBalances();
        const positions = balances.filter(b => 
            parseFloat(b.available) > 0 || parseFloat(b.locked) > 0
        );
        
        res.json(positions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 주문 내역
router.get('/orders', async (req, res) => {
    try {
        const { symbol, status = 'open' } = req.query;
        
        let orders;
        if (status === 'open') {
            orders = await gateio.getOpenOrders(symbol);
        } else {
            orders = await gateio.getOrderHistory(symbol);
        }
        
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
