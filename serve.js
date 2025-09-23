// ═══════════════════════════════════════════════════════════════════════════
// Gate.io - TradingView Trading Bot Server
// Version: 3.0.0
// ═══════════════════════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const http = require('http');
const socketIo = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const config = {
    // Server
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    
    // Gate.io API
    gateio: {
        apiKey: process.env.GATE_API_KEY,
        apiSecret: process.env.GATE_API_SECRET,
        apiUrl: process.env.GATE_API_URL || 'https://api.gateio.ws/api/v4',
    },
    
    // Webhook Security
    webhook: {
        secret: process.env.WEBHOOK_SECRET,
        allowedIPs: process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim()) : [],
    },
    
    // Trading Settings
    trading: {
        maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || 1000),
        riskPercentage: parseFloat(process.env.RISK_PERCENTAGE || 2),
        stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE || 5),
        takeProfitPercentage: parseFloat(process.env.TAKE_PROFIT_PERCENTAGE || 10),
        minOrderValue: 5, // USDT
    },
    
    // Admin
    admin: {
        token: process.env.ADMIN_TOKEN,
        username: process.env.ADMIN_USERNAME,
        password: process.env.ADMIN_PASSWORD,
    },
    
    // Notifications
    notifications: {
        telegram: {
            enabled: !!process.env.TELEGRAM_BOT_TOKEN,
            botToken: process.env.TELEGRAM_BOT_TOKEN,
            chatId: process.env.TELEGRAM_CHAT_ID,
        },
        discord: {
            enabled: !!process.env.DISCORD_WEBHOOK_URL,
            webhookUrl: process.env.DISCORD_WEBHOOK_URL,
        },
    },
    
    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        filePath: process.env.LOG_FILE_PATH || './logs',
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Logger Setup
// ═══════════════════════════════════════════════════════════════════════════

// Create logs directory if it doesn't exist
if (!fs.existsSync(config.logging.filePath)) {
    fs.mkdirSync(config.logging.filePath, { recursive: true });
}

const logger = winston.createLogger({
    level: config.logging.level,
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: 'gate-bot' },
    transports: [
        new winston.transports.File({
            filename: path.join(config.logging.filePath, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new winston.transports.File({
            filename: path.join(config.logging.filePath, 'combined.log'),
            maxsize: 5242880,
            maxFiles: 5
        })
    ]
});

// Console logging for development
if (config.env !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Express App Setup
// ═══════════════════════════════════════════════════════════════════════════

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Global variables
global.io = io;
global.tradingEngine = {
    isActive: true,
    positions: new Map(),
    orderQueue: [],
    processing: false
};

// ═══════════════════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════════════════

// Security
app.use(helmet({
    contentSecurityPolicy: false
}));

// CORS
app.use(cors());

// Body Parser
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
});

const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute for webhooks
    skipSuccessfulRequests: false
});

app.use('/api/', limiter);
app.use('/webhook/', webhookLimiter);

// Request Logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - IP: ${req.ip}`);
    req.startTime = Date.now();
    next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════════════════════════
// Gate.io API Class
// ═══════════════════════════════════════════════════════════════════════════

class GateioAPI {
    constructor(config) {
        this.apiKey = config.gateio.apiKey;
        this.apiSecret = config.gateio.apiSecret;
        this.baseURL = config.gateio.apiUrl;
        
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
        
        // Request interceptor
        this.axiosInstance.interceptors.request.use(
            config => {
                logger.debug(`Gate.io API Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            error => {
                logger.error('Gate.io API Request Error:', error);
                return Promise.reject(error);
            }
        );
        
        // Response interceptor
        this.axiosInstance.interceptors.response.use(
            response => {
                logger.debug(`Gate.io API Response: ${response.status}`);
                return response;
            },
            error => {
                const errorInfo = {
                    status: error.response?.status,
                    message: error.response?.data?.message || error.message,
                    label: error.response?.data?.label,
                    detail: error.response?.data?.detail
                };
                
                logger.error('Gate.io API Error:', errorInfo);
                
                // Specific error handling
                if (error.response?.status === 401) {
                    logger.error('Authentication failed - Check API key and secret');
                } else if (error.response?.status === 403) {
                    logger.error('Permission denied - Check API key permissions');
                } else if (error.response?.status === 429) {
                    logger.error('Rate limit exceeded - Reduce request frequency');
                }
                
                return Promise.reject(error);
            }
        );
    }
    
    generateSignature(method, url, queryString = '', payload = '') {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const hashedPayload = crypto
            .createHash('sha512')
            .update(payload || '')
            .digest('hex');
        
        const signatureString = [
            method.toUpperCase(),
            url,
            queryString,
            hashedPayload,
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
            throw error;
        }
    }
    
    // Account Methods
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
    
    // Trading Methods
    async createSpotOrder(symbol, side, amount, price = null, type = 'limit') {
        const orderData = {
            currency_pair: symbol,
            side: side.toLowerCase(),
            amount: amount.toString(),
            type: type.toLowerCase(),
            time_in_force: 'gtc',
            account: 'spot'
        };
        
        if (type === 'limit' && price) {
            orderData.price = price.toString();
        }
        
        logger.info(`Creating ${side} order: ${symbol} Amount: ${amount} Price: ${price || 'market'}`);
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
    
    async getOpenOrders(symbol = '') {
        const params = { status: 'open' };
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
    
    async getTradeHistory(symbol = '', limit = 100) {
        const params = { limit: limit };
        if (symbol) {
            params.currency_pair = symbol;
        }
        return await this.request('GET', '/spot/my_trades', params);
    }
    
    // Market Data (No authentication required)
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
}

// Initialize Gate.io API
const gateio = new GateioAPI(config);

// ═══════════════════════════════════════════════════════════════════════════
// Trading Engine
// ═══════════════════════════════════════════════════════════════════════════

class TradingEngine {
    constructor() {
        this.isActive = true;
        this.positions = new Map();
        this.orderQueue = [];
        this.processing = false;
        this.dailyStats = {
            trades: 0,
            successful: 0,
            failed: 0,
            pnl: 0,
            date: new Date().toDateString()
        };
    }
    
    async executeSignal(signal) {
        if (!this.isActive) {
            throw new Error('Trading engine is stopped');
        }
        
        try {
            logger.info('═══ Executing Trade Signal ═══');
            logger.info('Signal:', signal);
            
            // Format symbol
            const symbol = this.formatSymbol(signal.symbol);
            logger.info(`Formatted symbol: ${symbol}`);
            
            // Get market price
            const marketData = await gateio.getMarketPrice(symbol);
            const currentPrice = parseFloat(marketData.last);
            logger.info(`Current market price: ${currentPrice}`);
            
            // Calculate order amount
            const orderAmount = await this.calculateOrderAmount(signal, currentPrice);
            logger.info(`Calculated order amount: ${orderAmount}`);
            
            // Risk check
            const riskCheck = await this.checkRisk(signal, orderAmount, currentPrice);
            if (!riskCheck.approved) {
                throw new Error(`Risk check failed: ${riskCheck.reason}`);
            }
            
            // Execute order
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
            
            // Update position
            this.updatePosition(symbol, signal, order);
            
            // Update statistics
            this.updateStatistics(true);
            
            // Save trade record
            await this.saveTradeRecord(signal, order, true);
            
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
            
            // Update statistics
            this.updateStatistics(false);
            
            // Save failed trade record
            await this.saveTradeRecord(signal, null, false, error.message);
            
            // Send alert
            await this.sendNotification('Trade Failed', `${signal.symbol} ${signal.action} failed: ${error.message}`);
            
            throw error;
        }
    }
    
    formatSymbol(symbol) {
        if (!symbol) return 'BTC_USDT';
        
        // Already in Gate.io format
        if (symbol.includes('_')) {
            return symbol.toUpperCase();
        }
        
        // Convert from BTCUSDT to BTC_USDT format
        const pairs = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'BUSD'];
        for (const pair of pairs) {
            if (symbol.toUpperCase().endsWith(pair)) {
                const base = symbol.substring(0, symbol.length - pair.length);
                return `${base.toUpperCase()}_${pair}`;
            }
        }
        
        return symbol.toUpperCase();
    }
    
    async calculateOrderAmount(signal, currentPrice) {
        // Get balances
        const balances = await gateio.getSpotBalances();
        
        // Parse symbol
        const symbol = this.formatSymbol(signal.symbol);
        const [base, quote] = symbol.split('_');
        
        // Find quote balance (usually USDT)
        const quoteBalance = balances.find(b => b.currency === quote);
        const availableBalance = parseFloat(quoteBalance?.available || 0);
        
        logger.info(`Available ${quote} balance: ${availableBalance}`);
        
        // Calculate order amount
        let orderAmount;
        
        if (signal.amount) {
            // Use specified amount
            orderAmount = parseFloat(signal.amount);
        } else {
            // Calculate based on risk percentage
            const riskPercentage = config.trading.riskPercentage;
            const orderValue = availableBalance * (riskPercentage / 100);
            orderAmount = orderValue / currentPrice;
        }
        
        // Apply limits
        const maxPositionValue = config.trading.maxPositionSize;
        const maxAmount = maxPositionValue / currentPrice;
        orderAmount = Math.min(orderAmount, maxAmount);
        
        // Check minimum order value
        const minOrderValue = config.trading.minOrderValue;
        const orderValue = orderAmount * currentPrice;
        
        if (orderValue < minOrderValue) {
            throw new Error(`Order value too small: ${orderValue.toFixed(2)} USDT (minimum: ${minOrderValue} USDT)`);
        }
        
        // Round to appropriate precision (8 decimals for most pairs)
        return parseFloat(orderAmount.toFixed(8));
    }
    
    async checkRisk(signal, amount, price) {
        try {
            // Check daily trade limit
            if (this.dailyStats.trades >= 50) {
                return {
                    approved: false,
                    reason: 'Daily trade limit reached (50 trades)'
                };
            }
            
            // Check position value
            const positionValue = amount * price;
            if (positionValue > config.trading.maxPositionSize) {
                return {
                    approved: false,
                    reason: `Position value ${positionValue.toFixed(2)} exceeds limit ${config.trading.maxPositionSize}`
                };
            }
            
            // Check number of open positions
            if (this.positions.size >= 10) {
                return {
                    approved: false,
                    reason: 'Maximum number of open positions reached (10)'
                };
            }
            
            return {
                approved: true,
                reason: 'Risk checks passed'
            };
            
        } catch (error) {
            return {
                approved: false,
                reason: `Risk check error: ${error.message}`
            };
        }
    }
    
    async executeBuyOrder(symbol, amount, price) {
        logger.info(`📈 Executing BUY order: ${symbol} Amount: ${amount} @ ${price}`);
        
        const orderType = price ? 'limit' : 'market';
        const order = await gateio.createSpotOrder(symbol, 'buy', amount, price, orderType);
        
        logger.info(`Buy order created: ${order.id}`);
        return order;
    }
    
    async executeSellOrder(symbol, amount, price) {
        logger.info(`📉 Executing SELL order: ${symbol} Amount: ${amount} @ ${price}`);
        
        // Check if we have a position
        const position = this.positions.get(symbol);
        if (!position || position.amount <= 0) {
            // Check actual balance
            const [base] = symbol.split('_');
            const balance = await gateio.getBalance(base);
            
            if (!balance || parseFloat(balance.available) <= 0) {
                throw new Error(`No ${base} balance to sell`);
            }
            
            amount = amount || parseFloat(balance.available);
        } else {
            amount = amount || position.amount;
        }
        
        const orderType = price ? 'limit' : 'market';
        const order = await gateio.createSpotOrder(symbol, 'sell', amount, price, orderType);
        
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
    
    updatePosition(symbol, signal, order) {
        const current = this.positions.get(symbol) || {
            amount: 0,
            avgPrice: 0,
            totalCost: 0
        };
        
        const orderAmount = parseFloat(order.amount || 0);
        const orderPrice = parseFloat(order.price || 0);
        
        if (signal.action === 'buy' || signal.action === 'long') {
            const newAmount = current.amount + orderAmount;
            const newTotalCost = current.totalCost + (orderAmount * orderPrice);
            const newAvgPrice = newTotalCost / newAmount;
            
            this.positions.set(symbol, {
                amount: newAmount,
                avgPrice: newAvgPrice,
                totalCost: newTotalCost,
                lastUpdate: new Date().toISOString()
            });
            
        } else if (signal.action === 'sell' || signal.action === 'short' || signal.action === 'close') {
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
    
    updateStatistics(success) {
        const today = new Date().toDateString();
        if (this.dailyStats.date !== today) {
            this.dailyStats = {
                trades: 0,
                successful: 0,
                failed: 0,
                pnl: 0,
                date: today
            };
        }
        
        this.dailyStats.trades++;
        if (success) {
            this.dailyStats.successful++;
        } else {
            this.dailyStats.failed++;
        }
    }
    
    async saveTradeRecord(signal, order, success, error = null) {
        const record = {
            id: Date.now().toString(),
            signal: signal,
            order: order,
            success: success,
            error: error,
            timestamp: new Date().toISOString()
        };
        
        // Save to file
        const dataDir = './data';
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        const tradesFile = path.join(dataDir, 'trades.json');
        let trades = [];
        
        try {
            if (fs.existsSync(tradesFile)) {
                const data = fs.readFileSync(tradesFile, 'utf8');
                trades = JSON.parse(data);
            }
        } catch (error) {
            logger.error('Error reading trades file:', error);
        }
        
        trades.push(record);
        
        // Keep only last 1000 trades
        if (trades.length > 1000) {
            trades = trades.slice(-1000);
        }
        
        try {
            fs.writeFileSync(tradesFile, JSON.stringify(trades, null, 2));
            logger.info('Trade record saved');
        } catch (error) {
            logger.error('Error saving trade record:', error);
        }
        
        return record;
    }
    
    async sendNotification(title, message) {
        // Telegram notification
        if (config.notifications.telegram.enabled) {
            try {
                const url = `https://api.telegram.org/bot${config.notifications.telegram.botToken}/sendMessage`;
                await axios.post(url, {
                    chat_id: config.notifications.telegram.chatId,
                    text: `*${title}*\n${message}`,
                    parse_mode: 'Markdown'
                });
                logger.debug('Telegram notification sent');
            } catch (error) {
                logger.error('Telegram notification error:', error.message);
            }
        }
        
        // Discord notification
        if (config.notifications.discord.enabled) {
            try {
                await axios.post(config.notifications.discord.webhookUrl, {
                    content: `**${title}**\n${message}`
                });
                logger.debug('Discord notification sent');
            } catch (error) {
                logger.error('Discord notification error:', error.message);
            }
        }
        
        // WebSocket notification
        if (global.io) {
            global.io.emit('notification', {
                title,
                message,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    stop() {
        this.isActive = false;
        logger.warn('Trading engine stopped');
    }
    
    start() {
        this.isActive = true;
        logger.info('Trading engine started');
    }
    
    getStatus() {
        return {
            active: this.isActive,
            positions: Array.from(this.positions.entries()),
            statistics: this.dailyStats,
            queueLength: this.orderQueue.length
        };
    }
}

// Initialize Trading Engine
const tradingEngine = new TradingEngine();
global.tradingEngine = tradingEngine;

// ═══════════════════════════════════════════════════════════════════════════
// Webhook Validation Middleware
// ═══════════════════════════════════════════════════════════════════════════

function validateWebhook(req, res, next) {
    try {
        // IP Whitelist Check
        const allowedIPs = config.webhook.allowedIPs;
        if (allowedIPs.length > 0) {
            const clientIP = req.ip || 
                           req.connection.remoteAddress || 
                           req.headers['x-forwarded-for']?.split(',')[0];
            
            logger.info(`Webhook request from IP: ${clientIP}`);
            
            const ipAllowed = allowedIPs.some(allowedIP => {
                return clientIP.includes(allowedIP.replace('::ffff:', ''));
            });
            
            if (!ipAllowed) {
                logger.warn(`Unauthorized webhook attempt from IP: ${clientIP}`);
                return res.status(403).json({
                    error: 'Unauthorized IP address',
                    yourIP: clientIP
                });
            }
        }
        
        // Secret Token Check
        const webhookSecret = config.webhook.secret;
        if (webhookSecret) {
            const providedSecret = req.headers['x-webhook-secret'] ||
                                 req.headers['authorization'] ||
                                 req.query.secret ||
                                 req.body.secret;
            
            if (providedSecret !== webhookSecret) {
                logger.warn('Invalid webhook secret provided');
                return res.status(401).json({
                    error: 'Invalid webhook secret'
                });
            }
        }
        
        // Request Body Validation
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                error: 'Empty request body'
            });
        }
        
        logger.info('✅ Webhook validation passed');
        next();
        
    } catch (error) {
        logger.error('Webhook validation error:', error);
        res.status(500).json({
            error: 'Validation error',
            details: error.message
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Admin Authentication Middleware
// ═══════════════════════════════════════════════════════════════════════════

function authenticateAdmin(req, res, next) {
    try {
        const token = req.headers['authorization'] ||
                     req.headers['x-admin-token'] ||
                     req.query.token;
        
        const adminToken = config.admin.token;
        
        if (!adminToken) {
            logger.warn('Admin token not configured');
            return res.status(500).json({
                error: 'Admin authentication not configured'
            });
        }
        
        if (token !== adminToken) {
            logger.warn('Invalid admin token attempt');
            return res.status(401).json({
                error: 'Unauthorized'
            });
        }
        
        next();
        
    } catch (error) {
        logger.error('Auth middleware error:', error);
        res.status(500).json({
            error: 'Authentication error'
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════

// Root Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env
    });
});

// ────────────────────────────────────────────────────────────────────────────
// Webhook Routes
// ────────────────────────────────────────────────────────────────────────────

// TradingView Webhook
app.post('/webhook', validateWebhook, async (req, res) => {
    const startTime = Date.now();
    
    try {
        logger.info('═══ TradingView Webhook Received ═══');
        logger.info('Request Body:', JSON.stringify(req.body));
        
        // Parse signal
        const signal = parseSignal(req.body);
        logger.info('Parsed Signal:', signal);
        
        // Execute trade
        const result = await tradingEngine.executeSignal(signal);
        
        // Send notification
        await tradingEngine.sendNotification(
            '📊 Trade Executed',
            `${signal.action.toUpperCase()} ${signal.symbol}\nAmount: ${result.amount}\nPrice: ${result.price}\nOrder ID: ${result.orderId}`
        );
        
        // Emit to WebSocket
        if (global.io) {
            global.io.emit('trade', {
                signal: signal,
                result: result,
                timestamp: new Date().toISOString()
            });
        }
        
        const executionTime = Date.now() - startTime;
        logger.info(`✅ Webhook processed in ${executionTime}ms`);
        
        res.json({
            status: 'success',
            signal: signal,
            result: result,
            executionTime: `${executionTime}ms`
        });
        
    } catch (error) {
        logger.error('❌ Webhook processing error:', error);
        
        res.status(500).json({
            status: 'error',
            message: error.message,
            signal: req.body
        });
    }
});

// Alternative webhook endpoints
app.post('/webhook/tradingview', validateWebhook, async (req, res) => {
    // Same as /webhook
    req.url = '/webhook';
    app.handle(req, res);
});

// Test webhook
app.post('/webhook/test', async (req, res) => {
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
        logger.error('Test webhook error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ────────────────────────────────────────────────────────────────────────────
// Admin Routes
// ────────────────────────────────────────────────────────────────────────────

// Admin dashboard
app.get('/admin/dashboard', authenticateAdmin, async (req, res) => {
    try {
        const [balances, openOrders] = await Promise.all([
            gateio.getSpotBalances(),
            gateio.getOpenOrders()
        ]);
        
        const engineStatus = tradingEngine.getStatus();
        
        res.json({
            balances: balances.filter(b => parseFloat(b.available) > 0 || parseFloat(b.locked) > 0),
            openOrders: openOrders,
            engine: engineStatus,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Dashboard error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Trading engine control
app.post('/admin/engine/start', authenticateAdmin, (req, res) => {
    tradingEngine.start();
    logger.info('Trading engine started by admin');
    res.json({ status: 'started' });
});

app.post('/admin/engine/stop', authenticateAdmin, (req, res) => {
    tradingEngine.stop();
    logger.warn('Trading engine stopped by admin');
    res.json({ status: 'stopped' });
});

// Emergency stop
app.post('/admin/emergency-stop', authenticateAdmin, async (req, res) => {
    try {
        // Stop trading engine
        tradingEngine.stop();
        
        // Cancel all open orders
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

// Manual order
app.post('/admin/manual-order', authenticateAdmin, async (req, res) => {
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

// ────────────────────────────────────────────────────────────────────────────
// API Routes
// ────────────────────────────────────────────────────────────────────────────

// Get market data
app.get('/api/market/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const formattedSymbol = tradingEngine.formatSymbol(symbol);
        
        const [ticker, orderBook, stats] = await Promise.all([
            gateio.getMarketPrice(formattedSymbol),
            gateio.getOrderBook(formattedSymbol, 5),
            gateio.get24hStats(formattedSymbol)
        ]);
        
        res.json({
            symbol: formattedSymbol,
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

// Get positions
app.get('/api/positions', async (req, res) => {
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

// Get orders
app.get('/api/orders', async (req, res) => {
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

// Get trade history
app.get('/api/trades', async (req, res) => {
    try {
        const { symbol, limit = 100 } = req.query;
        const trades = await gateio.getTradeHistory(symbol, parseInt(limit));
        res.json(trades);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ────────────────────────────────────────────────────────────────────────────
// Status Routes
// ────────────────────────────────────────────────────────────────────────────

// System status
app.get('/api/status/system', (req, res) => {
    const os = require('os');
    
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

// API connection status
app.get('/api/status/api', async (req, res) => {
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

// Trading engine status
app.get('/api/status/engine', (req, res) => {
    const status = tradingEngine.getStatus();
    res.json(status);
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function parseSignal(body) {
    let parsed = {};
    
    // Handle string body
    if (typeof body === 'string') {
        try {
            // Try JSON parse
            parsed = JSON.parse(body);
        } catch (e) {
            // Parse line format
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
    
    // Map TradingView fields
    return {
        action: parsed.action || parsed.side || parsed.order || 'buy',
        symbol: parsed.symbol || parsed.ticker || parsed.pair || 'BTC_USDT',
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

// ═══════════════════════════════════════════════════════════════════════════
// Socket.IO Events
// ═══════════════════════════════════════════════════════════════════════════

io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);
    
    // Join rooms
    socket.on('subscribe', (data) => {
        socket.join(data.room);
        logger.info(`Client ${socket.id} joined room: ${data.room}`);
    });
    
    // Get engine status
    socket.on('get-status', () => {
        socket.emit('status', tradingEngine.getStatus());
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Error Handler
// ═══════════════════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    
    res.status(500).json({
        error: 'Internal Server Error',
        message: config.env === 'development' ? err.message : 'Something went wrong',
        ...(config.env === 'development' && { stack: err.stack })
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.path
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Server Start
// ═══════════════════════════════════════════════════════════════════════════

server.listen(config.port, () => {
    logger.info(`
    ═══════════════════════════════════════════════════════════════════
    🚀 Gate.io Trading Bot Server Started
    ═══════════════════════════════════════════════════════════════════
    📍 Port: ${config.port}
    🌍 Environment: ${config.env}
    📅 Started: ${new Date().toISOString()}
    📡 Webhook URL: http://localhost:${config.port}/webhook
    ═══════════════════════════════════════════════════════════════════
    `);
    
    // Configuration check
    console.log('Configuration Status:');
    console.log('  Gate.io API:', config.gateio.apiKey ? '✅ Configured' : '❌ Missing');
    console.log('  Webhook Secret:', config.webhook.secret ? '✅ Configured' : '❌ Missing');
    console.log('  Admin Token:', config.admin.token ? '✅ Configured' : '❌ Missing');
    console.log('  Telegram:', config.notifications.telegram.enabled ? '✅ Enabled' : '⚪ Disabled');
    console.log('  Discord:', config.notifications.discord.enabled ? '✅ Enabled' : '⚪ Disabled');
});

// ═══════════════════════════════════════════════════════════════════════════
// Graceful Shutdown
// ═══════════════════════════════════════════════════════════════════════════

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
    logger.info('Shutting down gracefully...');
    
    // Stop trading engine
    tradingEngine.stop();
    
    // Close server
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
        logger.error('Forced shutdown');
        process.exit(1);
    }, 10000);
}

// ═══════════════════════════════════════════════════════════════════════════
// Export for testing
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    app,
    server,
    gateio,
    tradingEngine
};
