const logger = require('../utils/logger');
const gateio = require('../api/gateio');

class RiskManager {
    constructor() {
        this.maxPositionSize = parseFloat(process.env.MAX_POSITION_SIZE || 1000);
        this.maxDrawdown = 10; // 10% 최대 손실
        this.riskPerTrade = 2; // 거래당 2% 리스크
        this.correlationLimit = 0.7;
        this.openPositions = new Map();
    }

    async checkRisk(signal) {
        try {
            logger.info('Performing risk check...');
            
            // 1. 계정 잔고 확인
            const balanceCheck = await this.checkBalance(signal);
            if (!balanceCheck.approved) {
                return balanceCheck;
            }
            
            // 2. 포지션 크기 확인
            const positionCheck = await this.checkPositionSize(signal);
            if (!positionCheck.approved) {
                return positionCheck;
            }
            
            // 3. 일일 손실 한도 확인
            const drawdownCheck = await this.checkDrawdown();
            if (!drawdownCheck.approved) {
                return drawdownCheck;
            }
            
            // 4. 상관관계 확인 (동일 방향 포지션 제한)
            const correlationCheck = await this.checkCorrelation(signal);
            if (!correlationCheck.approved) {
                return correlationCheck;
            }
            
            // 5. 변동성 체크
            const volatilityCheck = await this.checkVolatility(signal);
            if (!volatilityCheck.approved) {
                return volatilityCheck;
            }
            
            logger.info('✅ Risk check passed');
            return {
                approved: true,
                reason: 'All risk checks passed'
            };
            
        } catch (error) {
            logger.error('Risk check error:', error);
            return {
                approved: false,
                reason: `Risk check error: ${error.message}`
            };
        }
    }

    async checkBalance(signal) {
        try {
            const balances = await gateio.getSpotBalances();
            const symbol = signal.symbol;
            const [base, quote] = symbol.split('_');
            
            const quoteBalance = balances.find(b => b.currency === quote);
            const available = parseFloat(quoteBalance?.available || 0);
            
            if (available < 10) { // 최소 10 USDT
                return {
                    approved: false,
                    reason: `Insufficient ${quote} balance: ${available}`
                };
            }
            
            return { approved: true };
            
        } catch (error) {
            return {
                approved: false,
                reason: `Balance check failed: ${error.message}`
            };
        }
    }

    async checkPositionSize(signal) {
        try {
            if (!signal.amount) {
                return { approved: true };
            }
            
            // 현재 가격 조회
            const ticker = await gateio.getMarketPrice(signal.symbol);
            const price = parseFloat(ticker.last);
            
            const positionValue = signal.amount * price;
            
            if (positionValue > this.maxPositionSize) {
                return {
                    approved: false,
                    reason: `Position size ${positionValue} exceeds limit ${this.maxPositionSize}`
                };
            }
            
            return { approved: true };
            
        } catch (error) {
            return {
                approved: false,
                reason: `Position size check failed: ${error.message}`
            };
        }
    }

    async checkDrawdown() {
        try {
            // 일일 손익 계산 (데이터베이스에서 조회)
            // 임시로 통과
            return { approved: true };
            
        } catch (error) {
            return {
                approved: false,
                reason: `Drawdown check failed: ${error.message}`
            };
        }
    }

    async checkCorrelation(signal) {
        try {
            // 동일 방향의 포지션이 너무 많은지 확인
            let longCount = 0
let longCount = 0;
            let shortCount = 0;
            
            this.openPositions.forEach((position, symbol) => {
                if (position.side === 'long') longCount++;
                if (position.side === 'short') shortCount++;
            });
            
            // 한 방향으로 5개 이상 포지션 제한
            if (signal.action === 'buy' && longCount >= 5) {
                return {
                    approved: false,
                    reason: 'Too many long positions open'
                };
            }
            
            if (signal.action === 'sell' && shortCount >= 5) {
                return {
                    approved: false,
                    reason: 'Too many short positions open'
                };
            }
            
            return { approved: true };
            
        } catch (error) {
            return {
                approved: false,
                reason: `Correlation check failed: ${error.message}`
            };
        }
    }

    async checkVolatility(signal) {
        try {
            // 24시간 변동률 확인
            const stats = await gateio.get24hStats(signal.symbol);
            const changePercent = parseFloat(stats.change_percentage);
            
            // 변동성이 20% 이상이면 경고
            if (Math.abs(changePercent) > 20) {
                logger.warn(`High volatility detected: ${changePercent}%`);
                // 경고만 하고 통과는 시킴
            }
            
            return { approved: true };
            
        } catch (error) {
            // 변동성 체크 실패해도 통과
            return { approved: true };
        }
    }

    updatePosition(symbol, side, amount) {
        if (amount === 0) {
            this.openPositions.delete(symbol);
        } else {
            this.openPositions.set(symbol, { side, amount });
        }
    }

    calculatePositionSize(accountBalance, riskPercentage, stopLossDistance) {
        const riskAmount = accountBalance * (riskPercentage / 100);
        const positionSize = riskAmount / stopLossDistance;
        return positionSize;
    }

    calculateStopLoss(entryPrice, side, percentage) {
        if (side === 'buy' || side === 'long') {
            return entryPrice * (1 - percentage / 100);
        } else {
            return entryPrice * (1 + percentage / 100);
        }
    }

    calculateTakeProfit(entryPrice, side, percentage) {
        if (side === 'buy' || side === 'long') {
            return entryPrice * (1 + percentage / 100);
        } else {
            return entryPrice * (1 - percentage / 100);
        }
    }
}

module.exports = new RiskManager();
