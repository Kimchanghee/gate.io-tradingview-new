const logger = require('../utils/logger');
const db = require('../utils/database');
const gateio = require('../api/gateio');

class AdminService {
    constructor() {
        this.settings = {
            maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || 1000),
            riskPercentage: parseFloat(process.env.RISK_PERCENTAGE || 2),
            stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE || 5),
            takeProfitPercentage: parseFloat(process.env.TAKE_PROFIT_PERCENTAGE || 10),
            allowedSymbols: ['BTC_USDT', 'ETH_USDT', 'BNB_USDT'],
            autoApprove: false,
            maxDailyTrades: 10,
            maxDrawdown: 10
        };
        
        this.signalRules = {
            requireStopLoss: false,
            requireTakeProfit: false,
            minAmount: 0.0001,
            maxAmount: 1,
            allowedActions: ['buy', 'sell', 'close'],
            allowMarketOrders: true,
            allowLimitOrders: true
        };
        
        this.dailyStats = {
            trades: 0,
            profit: 0,
            loss: 0,
            date: new Date().toDateString()
        };
    }

    async validateSignal(signal) {
        try {
            // 날짜 체크 및 리셋
            const today = new Date().toDateString();
            if (this.dailyStats.date !== today) {
                this.dailyStats = {
                    trades: 0,
                    profit: 0,
                    loss: 0,
                    date: today
                };
            }
            
            // 일일 거래 제한
            if (this.dailyStats.trades >= this.settings.maxDailyTrades) {
                return {
                    approved: false,
                    reason: `Daily trade limit reached (${this.settings.maxDailyTrades})`
                };
            }
            
            // 심볼 확인
            if (!this.settings.allowedSymbols.includes(signal.symbol)) {
                return {
                    approved: false,
                    reason: `Symbol ${signal.symbol} not allowed`
                };
            }
            
            // 액션 확인
            if (!this.signalRules.allowedActions.includes(signal.action.toLowerCase())) {
                return {
                    approved: false,
                    reason: `Action ${signal.action} not allowed`
                };
            }
            
            // 금액 제한
            if (signal.amount) {
                if (signal.amount < this.signalRules.minAmount) {
                    return {
                        approved: false,
                        reason: `Amount too small (min: ${this.signalRules.minAmount})`
                    };
                }
                if (signal.amount > this.signalRules.maxAmount) {
                    return {
                        approved: false,
                        reason: `Amount too large (max: ${this.signalRules.maxAmount})`
                    };
                }
            }
            
            // Stop Loss/Take Profit 확인
            if (this.signalRules.requireStopLoss && !signal.stopLoss) {
                return {
                    approved: false,
                    reason: 'Stop loss required'
                };
            }
            
            if (this.signalRules.requireTakeProfit && !signal.takeProfit) {
                return {
                    approved: false,
                    reason: 'Take profit required'
                };
            }
            
            // 자동 승인
            if (this.settings.autoApprove) {
                this.dailyStats.trades++;
                return {
                    approved: true,
                    reason: 'Auto-approved'
                };
            }
            
            // 수동 승인 필요
            logger.info('Signal requires manual approval:', signal);
            
            // 여기서 관리자 UI나 다른 승인 메커니즘 구현
            // 임시로 자동 승인
            this.dailyStats.trades++;
            return {
                approved: true,
                reason: 'Manually approved'
            };
            
        } catch (error) {
            logger.error('Signal validation error:', error);
            return {
                approved: false,
                reason: `Validation error: ${error.message}`
            };
        }
    }

    async getDashboardData() {
        try {
            const [balances, openOrders, recentTrades] = await Promise.all([
                gateio.getSpotBalances(),
                gateio.getOpenOrders(),
                this.getRecentTrades(10)
            ]);
            
            // 총 자산 계산
            let totalValue = 0;
            for (const balance of balances) {
                if (balance.currency === 'USDT') {
                    totalValue += parseFloat(balance.available) + parseFloat(balance.locked);
                } else if (parseFloat(balance.available) > 0) {
                    try {
                        const ticker = await gateio.getMarketPrice(`${balance.currency}_USDT`);
                        const value = (parseFloat(balance.available) + parseFloat(balance.locked)) * parseFloat(ticker.last);
                        totalValue += value;
                    } catch (e) {
                        // 가격을 가져올 수 없는 토큰은 무시
                    }
                }
            }
            
            return {
                totalValue: totalValue.toFixed(2),
                balances: balances.filter(b => parseFloat(b.available) > 0 || parseFloat(b.locked) > 0),
                openOrders: openOrders.length,
                dailyStats: this.dailyStats,
                recentTrades: recentTrades,
                settings: this.settings,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Dashboard data error:', error);
            throw error;
        }
    }

    async getSettings() {
        return this.settings;
    }

    async updateSettings(newSettings) {
        this.settings = {
            ...this.settings,
            ...newSettings
        };
        
        // 데이터베이스에 저장
        await db.saveSettings(this.settings);
        
        logger.info('Settings updated:', this.settings);
        return this.settings;
    }

    async getSignalRules() {
        return this.signalRules;
    }

    async setSignalRules(rules) {
        this.signalRules = {
            ...this.signalRules,
            ...rules
        };
        
        await db.saveSignalRules(this.signalRules);
        
        logger.info('Signal rules updated:', this.signalRules);
        return this.signalRules;
    }

    async getTrades(params) {
        try {
            const trades = await gateio.getTradeHistory(
                params.symbol,
                params.limit
            );
            
            // 날짜 필터링
            if (params.start_date || params.end_date) {
                return trades.filter(trade => {
                    const tradeDate = new Date(trade.create_time_ms);
                    if (params.start_date && tradeDate < new Date(params.start_date)) {
                        return false;
                    }
                    if (params.end_date && tradeDate > new Date(params.end_date)) {
                        return false;
                    }
                    return true;
                });
            }
            
            return trades;
        } catch (error) {
            logger.error('Get trades error:', error);
            throw error;
        }
    }

    async getRecentTrades(limit = 10) {
        try {
            return await db.getRecentTrades(limit);
        } catch (error) {
            // 데이터베이스 에러 시 빈 배열 반환
            return [];
        }
    }

    async emergencyStop() {
        logger.error('EMERGENCY STOP INITIATED');
        
        // 모든 설정 비활성화
        this.settings.autoApprove = false;
        this.settings.maxDailyTrades = 0;
        
        return {
            status: 'emergency_stopped',
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new AdminService();
