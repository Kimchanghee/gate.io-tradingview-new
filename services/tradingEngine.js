const gateio = require('../api/gateio');
const logger = require('../utils/logger');
const riskManager = require('./riskManager');
const notificationService = require('./notificationService');
const db = require('../utils/database');

class TradingEngine {
    constructor() {
        this.isActive = true;
        this.positions = new Map();
        this.orderQueue = [];
        this.processing = false;
    }

    async executeSignal(signal) {
        if (!this.isActive) {
            throw new Error('Trading engine is stopped');
        }

        try {
            logger.info('═══ Executing Trade Signal ═══');
            
            // 1. 리스크 체크
            const riskCheck = await riskManager.checkRisk(signal);
            if (!riskCheck.approved) {
                throw new Error(`Risk check failed: ${riskCheck.reason}`);
            }
            
            // 2. 심볼 포맷팅
            const symbol = this.formatSymbol(signal.symbol);
            logger.info(`Symbol: ${symbol}`);
            
            // 3. 시장 데이터 조회
            const marketData = await gateio.getMarketPrice(symbol);
            const currentPrice = parseFloat(marketData.last);
            logger.info(`Current market price: ${currentPrice}`);
            
            // 4. 주문 금액 계산
            const orderAmount = await this.calculateOrderAmount(signal, currentPrice);
            logger.info(`Order amount: ${orderAmount}`);
            
            // 5. 주문 실행
            let order;
            const action = signal.action.toLowerCase();
            
            switch(action) {
                case 'buy':
                case 'long':
                    order = await this.executeBuyOrder(symbol, orderAmount, signal.price || currentPrice);
                    break;
                    
                case 'sell':
                case 'short':
                    order = await this.executeSellOrder(symbol, orderAmount, signal.price || currentPrice);
                    break;
                    
                case 'close':
                case 'close_all':
                    order = await this.closePosition(symbol);
                    break;
                    
                default:
                    throw new Error(`Unknown action: ${signal.action}`);
            }
            
            // 6. Stop Loss / Take Profit 설정
            if (signal.stopLoss || signal.takeProfit) {
                await this.setStopLossTakeProfit(symbol, order, signal.stopLoss, signal.takeProfit);
            }
            
            // 7. 결과 저장
            await this.saveTradeRecord(signal, order);
            
            // 8. 포지션 업데이트
            this.updatePosition(symbol, signal, order);
            
            logger.info('✅ Trade executed successfully');
            logger.info('Order ID:', order.id);
            
            return {
                success: true,
                orderId: order.id,
                symbol: symbol,
                action: action,
                amount: orderAmount,
                price: order.price || currentPrice,
                status: order.status,
                executedAt: new Date().toISOString()
            };
            
        } catch (error) {
            logger.error('❌ Trade execution failed:', error.message);
            
            // 에러 알림
            await notificationService.sendAlert('Trade Execution Failed', error.message);
            
            throw error;
        }
    }

    formatSymbol(symbol) {
        if (!symbol) return 'BTC_USDT';
        
        if (symbol.includes('_')) {
            return symbol.toUpperCase();
        }
        
        // BTCUSDT -> BTC_USDT
        const pairs = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB'];
        for (const pair of pairs) {
            if (symbol.toUpperCase().endsWith(pair)) {
                const base = symbol.substring(0, symbol.length - pair.length);
                return `${base.toUpperCase()}_${pair}`;
            }
        }
        
        return symbol.toUpperCase();
    }

    async calculateOrderAmount(signal, currentPrice) {
        // 잔고 조회
        const balances = await gateio.getSpotBalances();
        
        // 거래 통화 찾기
        const symbol = this.formatSymbol(signal.symbol);
        const [base, quote] = symbol.split('_');
        
        const quoteBalance = balances.find(b => b.currency === quote);
        const availableBalance = parseFloat(quoteBalance?.available || 0);
        
        logger.info(`Available ${quote} balance: ${availableBalance}`);
        
        // 주문 금액 계산
        let orderAmount;
        
        if (signal.amount) {
            // 직접 지정된 금액 사용
            orderAmount = signal.amount;
        } else {
            // 리스크 비율로 계산
            const riskPercentage = parseFloat(process.env.RISK_PERCENTAGE || 2);
            const orderValue = availableBalance * (riskPercentage / 100);
            orderAmount = orderValue / currentPrice;
        }
        
        // 최대/최소 제한
        const maxPositionValue = parseFloat(process.env.MAX_POSITION_SIZE || 1000);
        const maxAmount = maxPositionValue / currentPrice;
        
        orderAmount = Math.min(orderAmount, maxAmount);
        
        // Gate.io 최소 주문 금액 확인 (보통 $1-5)
        const minOrderValue = 5; // USDT
        const minAmount = minOrderValue / currentPrice;
        
        if (orderAmount < minAmount) {
            throw new Error(`Order amount too small. Minimum: ${minAmount} (${minOrderValue} USDT)`);
        }
        
        // 소수점 정리 (Gate.io는 보통 8자리까지 허용)
        return parseFloat(orderAmount.toFixed(8));
    }

    async executeBuyOrder(symbol, amount, price) {
        logger.info(`📈 BUY ${amount} ${symbol} @ ${price}`);
        
        const orderType = price ? 'limit' : 'market';
        
        const order = await gateio.createSpotOrder(
            symbol,
            'buy',
            amount,
            price,
            orderType
        );
        
        logger.info(`Buy order created: ${order.id}`);
        return order;
    }

    async executeSellOrder(symbol, amount, price) {
        logger.info(`📉 SELL ${amount} ${symbol} @ ${price}`);
        
        // 현재 포지션 확인
        const position = this.positions.get(symbol);
        if (!position || position.amount <= 0) {
            // 실제 잔고에서 확인
            const [base] = symbol.split('_');
            const balance = await gateio.getBalance(base);
            
            if (!balance || parseFloat(balance.available) <= 0) {
                throw new Error(`No ${base} balance to sell`);
            }
            
            amount = amount || parseFloat(balance.available);
        }
        
        const sellAmount = amount || position?.amount;
        const orderType = price ? 'limit' : 'market';
        
        const order = await gateio.createSpotOrder(
            symbol,
            'sell',
            sellAmount,
            price,
            orderType
        );
        
        logger.info(`Sell order created: ${order.id}`);
        return order;
    }

    async closePosition(symbol) {
        logger.info(`Closing position for ${symbol}`);
        
        const [base] = symbol.split('_');
        const balance = await gateio.getBalance(base);
        
        if (!balance || parseFloat(balance.available) <= 0) {
            throw new Error(`No ${base} position to close`);
        }
        
        return await this.executeSellOrder(symbol, parseFloat(balance.available), null);
    }

    async setStopLossTakeProfit(symbol, order, stopLoss, takeProfit) {
        // Gate.io는 OCO 주문을 지원하지 않으므로
        // 별도로 stop-loss와 take-profit 주문을 생성해야 함
        logger.info('Setting SL/TP orders...');
        
        // 구현 예정
        // 이 부분은 Gate.io API의 조건부 주문 기능을 사용하거나
        // 자체 모니터링 시스템을 구현해야 함
    }

    updatePosition(symbol, signal, order) {
        const current = this.positions.get(symbol) || { 
            amount: 0, 
            avgPrice: 0,
            totalCost: 0
        };
        
        const orderAmount = parseFloat(order.amount || 0);
        const orderPrice = parseFloat(order.price || order.create_time_ms);
        
        if (signal.action === 'buy') {
            const newAmount = current.amount + orderAmount;
            const newTotalCost = current.totalCost + (orderAmount * orderPrice);
            const newAvgPrice = newTotalCost / newAmount;
            
            this.positions.set(symbol, {
                amount: newAmount,
                avgPrice: newAvgPrice,
                totalCost: newTotalCost,
                lastUpdate: new Date().toISOString()
            });
            
        } else if (signal.action === 'sell' || signal.action === 'close') {
            const newAmount = Math.max(0, current.amount - orderAmount);
            
            if (newAmount === 0) {
                this.positions.delete(symbol);
            } else {
                const soldRatio = orderAmount / current.amount;
                const newTotalCost = current.totalCost * (1 - soldRatio);
                
                this.positions.set(symbol, {
                    amount: newAmount,
                    avgPrice: current.avgPrice,
                    totalCost: newTotalCost,
                    lastUpdate: new Date().toISOString()
                });
            }
        }
        
        logger.info('Position updated:', this.positions.get(symbol));
    }

    async saveTradeRecord(signal, order) {
        const record = {
            signal: signal,
            order: order,
            timestamp: new Date().toISOString()
        };
        
        await db.saveTrade(record);
        return record;
    }

    stop() {
        this.isActive = false;
        logger.warn('⏸️ Trading engine stopped');
    }

    start() {
        this.isActive = true;
        logger.info('▶️ Trading engine started');
    }

    getStatus() {
        return {
            active: this.isActive,
            positions: Array.from(this.positions.entries()),
            queueLength: this.orderQueue.length,
            processing: this.processing
        };
    }
}

module.exports = new TradingEngine();
