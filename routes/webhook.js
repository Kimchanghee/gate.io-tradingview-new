const express = require('express');
const router = express.Router();
const gateio = require('../api/gateio');
const logger = require('../utils/logger');
const { validateWebhook } = require('../middleware/webhookValidator');
const tradingEngine = require('../services/tradingEngine');
const adminService = require('../services/adminService');
const notificationService = require('../services/notificationService');

// TradingView 웹훅 메인 엔드포인트
router.post('/tradingview', validateWebhook, async (req, res) => {
    const startTime = Date.now();
    
    try {
        logger.info('═══ TradingView Webhook Received ═══');
        logger.info('Body:', JSON.stringify(req.body));
        
        // 신호 파싱
        const signal = parseSignal(req.body);
        logger.info('Parsed Signal:', signal);
        
        // 관리자 검증
        const adminApproval = await adminService.validateSignal(signal);
        if (!adminApproval.approved) {
            logger.warn('Signal rejected by admin:', adminApproval.reason);
            await notificationService.sendAlert('Signal Rejected', adminApproval.reason);
            
            return res.json({ 
                status: 'rejected', 
                reason: adminApproval.reason,
                signal: signal
            });
        }
        
        // 트레이딩 엔진 실행
        logger.info('Executing signal through trading engine...');
        const result = await tradingEngine.executeSignal(signal);
        
        // 실시간 알림
        if (global.io) {
            global.io.to('trading').emit('signal', {
                signal: signal,
                result: result,
                timestamp: new Date().toISOString()
            });
        }
        
        // 알림 전송
        await notificationService.sendTradeNotification(signal, result);
        
        const executionTime = Date.now() - startTime;
        logger.info(`✅ Signal processed successfully in ${executionTime}ms`);
        
        res.json({ 
            status: 'success', 
            signal: signal,
            result: result,
            executionTime: `${executionTime}ms`
        });
        
    } catch (error) {
        logger.error('❌ Webhook processing error:', error);
        
        await notificationService.sendAlert('Webhook Error', error.message);
        
        res.status(500).json({ 
            status: 'error', 
            message: error.message,
            signal: req.body
        });
    }
});

// 신호 파싱 함수
function parseSignal(body) {
    let parsed = {};
    
    // 문자열인 경우 JSON 파싱 시도
    if (typeof body === 'string') {
        try {
            parsed = JSON.parse(body);
        } catch (e) {
            // JSON이 아닌 경우 줄 단위 파싱
            const lines = body.split('\n');
            lines.forEach(line => {
                const [key, value] = line.split(':').map(s => s.trim());
                if (key && value) {
                    parsed[key.toLowerCase()] = value;
                }
            });
        }
    } else {
        parsed = body;
    }
    
    // TradingView 표준 필드 매핑
    return {
        action: parsed.action || parsed.side || parsed.order || 'buy',
        symbol: formatSymbol(parsed.symbol || parsed.ticker || parsed.pair),
        price: parseFloat(parsed.price || parsed.close) || null,
        amount: parseFloat(parsed.amount || parsed.contracts || parsed.size) || null,
        leverage: parseFloat(parsed.leverage) || 1,
        stopLoss: parseFloat(parsed.stop_loss || parsed.sl) || null,
        takeProfit: parseFloat(parsed.take_profit || parsed.tp) || null,
        comment: parsed.comment || parsed.message || '',
        exchange: parsed.exchange || 'spot',
        strategy: parsed.strategy || 'manual',
        timestamp: new Date().toISOString()
    };
}

// 심볼 포맷팅
function formatSymbol(symbol) {
    if (!symbol) return 'BTC_USDT';
    
    // 이미 Gate.io 포맷인 경우
    if (symbol.includes('_')) {
        return symbol.toUpperCase();
    }
    
    // BTCUSDT -> BTC_USDT 변환
    const pairs = ['USDT', 'BTC', 'ETH', 'USDC', 'BNB'];
    for (const pair of pairs) {
        if (symbol.toUpperCase().endsWith(pair)) {
            const base = symbol.substring(0, symbol.length - pair.length);
            return `${base.toUpperCase()}_${pair}`;
        }
    }
    
    return symbol.toUpperCase();
}

// 테스트 엔드포인트
router.post('/test', async (req, res) => {
    try {
        const testSignal = {
            action: req.body.action || 'buy',
            symbol: req.body.symbol || 'BTC_USDT',
            amount: req.body.amount || 0.0001,
            price: req.body.price || null,
            comment: 'Test signal'
        };
        
        logger.info('Test signal:', testSignal);
        
        const result = await tradingEngine.executeSignal(testSignal);
        
        res.json({ 
            status: 'success', 
            signal: testSignal,
            result: result
        });
    } catch (error) {
        logger.error('Test endpoint error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 상태 확인 엔드포인트
router.get('/status', (req, res) => {
    res.json({
        status: 'active',
        webhook_url: `${req.protocol}://${req.get('host')}/webhook/tradingview`,
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
