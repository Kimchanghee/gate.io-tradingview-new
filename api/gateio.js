const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');

class GateioAPI {
    constructor() {
        this.apiKey = process.env.GATE_API_KEY;
        this.apiSecret = process.env.GATE_API_SECRET;
        this.baseURL = process.env.GATE_API_URL || 'https://api.gateio.ws/api/v4';
        
        if (!this.apiKey || !this.apiSecret) {
            throw new Error('Gate.io API credentials not configured');
        }
        
        this.axiosInstance = axios.create({
            baseURL: this.baseURL,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // 요청 인터셉터
        this.axiosInstance.interceptors.request.use(
            config => {
                logger.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            error => {
                logger.error('API Request Error:', error);
                return Promise.reject(error);
            }
        );
        
        // 응답 인터셉터
        this.axiosInstance.interceptors.response.use(
            response => {
                logger.debug(`API Response: ${response.status}`);
                return response;
            },
            error => {
                logger.error(`API Response Error: ${error.response?.status} - ${error.response?.data?.label || error.message}`);
                return Promise.reject(error);
            }
        );
    }

    generateSignature(method, url, queryString = '', payload = '') {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const payloadHash = crypto
            .createHash('sha512')
            .update(payload || '')
            .digest('hex');
        
        const signatureString = [
            method.toUpperCase(),
            url,
            queryString,
            payloadHash,
            timestamp
        ].join('\n');
        
        const signature = crypto
            .createHmac('sha512', this.apiSecret)
            .update(signatureString)
            .digest('hex');
        
        return {
            'KEY': this.apiKey,
            'SIGN': signature,
            'Timestamp': timestamp
        };
    }

    async request(method, endpoint, params = {}, data = null) {
        try {
            const url = `/api/v4${endpoint}`;
            const queryString = new URLSearchParams(params).toString();
            const fullUrl = queryString ? `${url}?${queryString}` : url;
            
            const headers = this.generateSignature(
                method,
                url,
                queryString,
                data ? JSON.stringify(data) : ''
            );
            
            const config = {
                method: method,
                url: fullUrl,
                headers: headers
            };
            
            if (data) {
                config.data = data;
            }
            
            const response = await this.axiosInstance(config);
            return response.data;
            
        } catch (error) {
            logger.error(`Gate.io API Error: ${endpoint}`, error.response?.data || error.message);
            throw error;
        }
    }

    // ===== 계정 관련 API =====
    async getAccountInfo() {
        return await this.request('GET', '/wallet/total_balance');
    }

    async getSpotBalances() {
        return await this.request('GET', '/spot/accounts');
    }

    async getBalance(currency) {
        const balances = await this.getSpotBalances();
        return balances.find(b => b.currency === currency);
    }

    // ===== 거래 관련 API =====
    async createSpotOrder(symbol, side, amount, price = null, type = 'limit') {
        const orderData = {
            currency_pair: symbol,
            side: side.toLowerCase(),
            amount: amount.toString(),
            type: type.toLowerCase()
        };
        
        if (type === 'limit' && price) {
            orderData.price = price.toString();
        }
        
        orderData.time_in_force = 'gtc'; // Good Till Cancel
        orderData.account = 'spot';
        
        logger.info(`Creating ${side} order for ${symbol}: ${amount} @ ${price || 'market'}`);
        return await this.request('POST', '/spot/orders', {}, orderData);
    }

    async cancelOrder(orderId, symbol) {
        return await this.request('DELETE', `/spot/orders/${orderId}`, {
            currency_pair: symbol
        });
    }

    async cancelAllOrders(symbol = '') {
        const params = {};
        if (symbol) {
            params.currency_pair = symbol;
        }
        return await this.request('DELETE', '/spot/orders', params);
    }

    async getOrder(orderId, symbol) {
        return await this.request('GET', `/spot/orders/${orderId}`, {
            currency_pair: symbol
        });
    }

    async getOpenOrders(symbol = '') {
        const params = {
            status: 'open'
        };
        if (symbol) {
            params.currency_pair = symbol;
        }
        return await this.request('GET', '/spot/orders', params);
    }

    async getOrderHistory(symbol = '', limit = 100) {
        const params = {
            status: 'finished',
            limit: limit
        };
        if (symbol) {
            params.currency_pair = symbol;
        }
        return await this.request('GET', '/spot/orders', params);
    }

    // ===== 거래 내역 =====
    async getTradeHistory(symbol = '', limit = 100) {
        const params = {
            limit: limit
        };
        if (symbol) {
            params.currency_pair = symbol;
        }
        return await this.request('GET', '/spot/my_trades', params);
    }

    // ===== 시장 데이터 (인증 불필요) =====
    async getMarketPrice(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/spot/tickers`, {
                params: { currency_pair: symbol }
            });
            return response.data[0];
        } catch (error) {
            logger.error('Market price fetch error:', error);
            throw error;
        }
    }

    async getOrderBook(symbol, limit = 10) {
        try {
            const response = await axios.get(`${this.baseURL}/spot/order_book`, {
                params: { 
                    currency_pair: symbol,
                    limit: limit
                }
            });
            return response.data;
        } catch (error) {
            logger.error('Order book fetch error:', error);
            throw error;
        }
    }

    async get24hStats(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/spot/tickers`, {
                params: { currency_pair: symbol }
            });
            return response.data[0];
        } catch (error) {
            logger.error('24h stats fetch error:', error);
            throw error;
        }
    }

    async getCandlesticks(symbol, interval = '1h', limit = 100) {
        try {
            const response = await axios.get(`${this.baseURL}/spot/candlesticks`, {
                params: {
                    currency_pair: symbol,
                    interval: interval,
                    limit: limit
                }
            });
            return response.data;
        } catch (error) {
            logger.error('Candlesticks fetch error:', error);
            throw error;
        }
    }
}

module.exports = new GateioAPI();
