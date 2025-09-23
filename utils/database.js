const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class Database {
    constructor() {
        this.dataDir = './data';
        this.tradesFile = path.join(this.dataDir, 'trades.json');
        this.settingsFile = path.join(this.dataDir, 'settings.json');
        this.stateFile = path.join(this.dataDir, 'state.json');
        
        this.initializeDatabase();
    }

    async initializeDatabase() {
        try {
            // 데이터 디렉토리 생성
            await fs.mkdir(this.dataDir, { recursive: true });
            
            // 파일 초기화
            await this.initFile(this.tradesFile, []);
            await this.initFile(this.settingsFile, {});
            await this.initFile(this.stateFile, {});
            
            logger.info('Database initialized');
        } catch (error) {
            logger.error('Database initialization error:', error);
        }
    }

    async initFile(filepath, defaultData) {
        try {
            await fs.access(filepath);
        } catch {
            await fs.writeFile(filepath, JSON.stringify(defaultData, null, 2));
        }
    }

    // 거래 저장
    async saveTrade(trade) {
        try {
            const trades = await this.getTrades();
            trades.push({
                ...trade,
                id: Date.now().toString(),
                timestamp: new Date().toISOString()
            });
            
            // 최근 1000개만 유지
            if (trades.length > 1000) {
                trades.splice(0, trades.length - 1000);
            }
            
            await fs.writeFile(this.tradesFile, JSON.stringify(trades, null, 2));
            logger.info('Trade saved to database');
            
            return trade;
        } catch (error) {
            logger.error('Save trade error:', error);
            throw error;
        }
    }

    // 거래 조회
    async getTrades() {
        try {
            const data = await fs.readFile(this.tradesFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.error('Get trades error:', error);
            return [];
        }
    }

    // 최근 거래 조회
    async getRecentTrades(limit = 10) {
        try {
            const trades = await this.getTrades();
            return trades.slice(-limit).reverse();
        } catch (error) {
            return [];
        }
    }

    // 설정 저장
    async saveSettings(settings) {
        try {
            await fs.writeFile(this.settingsFile, JSON.stringify(settings, null, 2));
            logger.info('Settings saved to database');
        } catch (error) {
            logger.error('Save settings error:', error);
            throw error;
        }
    }

    // 설정 조회
    async getSettings() {
        try {
            const data = await fs.readFile(this.settingsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.error('Get settings error:', error);
            return {};
        }
    }

    // 신호 규칙 저장
    async saveSignalRules(rules) {
        try {
            const settings = await this.getSettings();
            settings.signalRules = rules;
            await this.saveSettings(settings);
        } catch (error) {
            logger.error('Save signal rules error:', error);
            throw error;
        }
    }

    // 상태 저장
    async saveState(state) {
        try {
            await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2));
        } catch (error) {
            logger.error('Save state error:', error);
            throw error;
        }
    }

    // 상태 조회
    async getState() {
        try {
            const data = await fs.readFile(this.stateFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {};
        }
    }

    // 통계 조회
    async getStatistics(startDate, endDate) {
        try {
            const trades = await this.getTrades();
            
            const filtered = trades.filter(trade => {
                const tradeDate = new Date(trade.timestamp);
                if (startDate && tradeDate < new Date(startDate)) return false;
                if (endDate && tradeDate > new Date(endDate)) return false;
                return true;
            });
            
            const stats = {
                totalTrades: filtered.length,
                successfulTrades: filtered.filter(t => t.result?.success).length,
                failedTrades: filtered.filter(t => !t.result?.success).length,
                buyOrders: filtered.filter(t => t.signal?.action === 'buy').length,
                sellOrders: filtered.filter(t => t.signal?.action === 'sell').length
            };
            
            stats.winRate = stats.totalTrades > 0 
                ? (stats.successfulTrades / stats.totalTrades * 100).toFixed(2) 
                : 0;
            
            return stats;
        } catch (error) {
            logger.error('Get statistics error:', error);
            return {};
        }
    }
}

module.exports = new Database();
