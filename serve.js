require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const config = {
    port: PORT,
    env: process.env.NODE_ENV || 'production',
    
    gateio: {
        apiKey: process.env.GATE_API_KEY || '',
        apiSecret: process.env.GATE_API_SECRET || '',
        apiUrl: process.env.GATE_API_URL || 'https://api.gateio.ws/api/v4'
    },
    
    webhook: {
        secret: process.env.WEBHOOK_SECRET || '',
        allowedIPs: process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim()) : []
    },
    
    trading: {
        maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || 1000),
        riskPercentage: parseFloat(process.env.RISK_PERCENTAGE || 2),
        minOrderValue: 5
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════════════════

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// Static files serving for dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// ═══════════════════════════════════════════════════════════════════════════
// Gate.io API Class
// ═══════════════════════════════════════════════════════════════════════════

class GateioAPI {
    constructor() {
        this.apiKey = config.gateio.apiKey;
        this.apiSecret = config.gateio.apiSecret;
        this.baseURL = config.gateio.apiUrl;
        
        if (!this.apiKey || !this.apiSecret) {
            console.warn('⚠️ Gate.io API credentials not configured');
        }
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
        if (!this.apiKey || !this.apiSecret) {
            throw new Error('API credentials not configured');
        }
        
        try {
            const url = `/api/v4${endpoint}`;
            const queryString = new URLSearchParams(params).toString();
            const fullUrl = `${this.baseURL}${url}${queryString ? '?' + queryString : ''}`;
            
            const headers = this.generateSignature(
                method,
                url,
                queryString,
                data ? JSON.stringify(data) : ''
            );
            
            const config = {
                method: method,
                url: fullUrl,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                }
            };
            
            if (data) {
                config.data = data;
            }
            
            const response = await axios(config);
            return response.data;
            
        } catch (error) {
            console.error('Gate.io API Error:', error.response?.data || error.message);
            throw error;
        }
    }
    
    async testConnection() {
        try {
            return await this.request('GET', '/spot/accounts');
        } catch (error) {
            return null;
        }
    }
    
    async getSpotBalances() {
        return await this.request('GET', '/spot/accounts');
    }
    
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
        
        console.log(`Creating ${side} order: ${symbol} Amount: ${amount} Price: ${price || 'market'}`);
        return await this.request('POST', '/spot/orders', {}, orderData);
    }
    
    async cancelOrder(orderId, symbol) {
        return await this.request('DELETE', `/spot/orders/${orderId}`, {
            currency_pair: symbol
        });
    }
    
    async getOpenOrders(symbol = '') {
        const params = { status: 'open' };
        if (symbol) {
            params.currency_pair = symbol;
        }
        return await this.request('GET', '/spot/orders', params);
    }
    
    async getMarketPrice(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/spot/tickers`, {
                params: { currency_pair: symbol }
            });
            return response.data[0];
        } catch (error) {
            console.error('Market price fetch error:', error.message);
            throw error;
        }
    }
}

const gateio = new GateioAPI();

// ═══════════════════════════════════════════════════════════════════════════
// Trading Engine
// ═══════════════════════════════════════════════════════════════════════════

const tradingEngine = {
    isActive: true,
    positions: new Map(),
    dailyStats: {
        signals: 0,
        successful: 0,
        failed: 0,
        lastSignal: null
    }
};

async function executeSignal(signal) {
    try {
        console.log('Executing signal:', signal);
        
        // Update daily stats
        tradingEngine.dailyStats.signals++;
        tradingEngine.dailyStats.lastSignal = {
            ...signal,
            timestamp: new Date().toISOString()
        };
        
        // Format symbol
        const symbol = formatSymbol(signal.symbol);
        
        // Build result object
        const result = {
            success: true,
            message: 'Signal received and processed',
            signal: signal,
            symbol: symbol,
            timestamp: new Date().toISOString()
        };
        
        // If API is configured, try to execute trade
        if (config.gateio.apiKey && config.gateio.apiSecret) {
            try {
                // Get market price
                const marketData = await gateio.getMarketPrice(symbol);
                result.marketPrice = marketData.last;
                
                // Get balances
                const balances = await gateio.getSpotBalances();
                result.balances = balances.filter(b => 
                    parseFloat(b.available) > 0 || parseFloat(b.locked) > 0
                );
                
                // For safety, only execute if explicitly enabled via environment variable
                if (process.env.ENABLE_REAL_TRADING === 'true') {
                    // Execute real trade
                    const order = await gateio.createSpotOrder(
                        symbol,
                        signal.action,
                        signal.amount,
                        signal.price,
                        signal.price ? 'limit' : 'market'
                    );
                    result.order = order;
                    result.message = 'Trade executed successfully';
                } else {
                    result.message = 'Signal processed (TEST MODE - Real trading disabled)';
                    result.testMode = true;
                }
                
                tradingEngine.dailyStats.successful++;
            } catch (error) {
                console.error('Trading error:', error.message);
                result.error = error.message;
                result.message = 'Signal received but trade failed';
                tradingEngine.dailyStats.failed++;
            }
        } else {
            result.message = 'Signal received (API not configured)';
            result.apiConfigured = false;
        }
        
        return result;
        
    } catch (error) {
        console.error('Execute signal error:', error);
        tradingEngine.dailyStats.failed++;
        throw error;
    }
}

function formatSymbol(symbol) {
    if (!symbol) return 'BTC_USDT';
    
    // Already in Gate.io format
    if (symbol.includes('_')) {
        return symbol.toUpperCase();
    }
    
    // Convert from BTCUSDT to BTC_USDT
    const pairs = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB'];
    for (const pair of pairs) {
        if (symbol.toUpperCase().endsWith(pair)) {
            const base = symbol.substring(0, symbol.length - pair.length);
            return `${base.toUpperCase()}_${pair}`;
        }
    }
    
    return symbol.toUpperCase();
}

function parseSignal(body) {
    let parsed = {};
    
    if (typeof body === 'string') {
        try {
            parsed = JSON.parse(body);
        } catch (e) {
            // Parse text format
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
    
    return {
        action: parsed.action || parsed.side || 'buy',
        symbol: parsed.symbol || parsed.ticker || parsed.pair || 'BTC_USDT',
        price: parseFloat(parsed.price) || null,
        amount: parseFloat(parsed.amount) || parseFloat(parsed.contracts) || 0.0001,
        comment: parsed.comment || parsed.message || '',
        strategy: parsed.strategy || 'manual',
        timestamp: new Date().toISOString()
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// Webhook Validation
// ═══════════════════════════════════════════════════════════════════════════

function validateWebhook(req, res, next) {
    // Check webhook secret if configured
    if (config.webhook.secret) {
        const providedSecret = req.headers['x-webhook-secret'] || 
                              req.headers['authorization'] || 
                              req.query.secret;
        
        if (providedSecret !== config.webhook.secret) {
            console.warn('Invalid webhook secret provided');
            return res.status(401).json({ error: 'Invalid webhook secret' });
        }
    }
    
    // Check IP whitelist if configured
    if (config.webhook.allowedIPs.length > 0) {
        const clientIP = req.ip || req.connection.remoteAddress;
        const allowed = config.webhook.allowedIPs.some(ip => clientIP.includes(ip));
        
        if (!allowed) {
            console.warn(`Unauthorized webhook from IP: ${clientIP}`);
            return res.status(403).json({ error: 'Unauthorized IP' });
        }
    }
    
    next();
}

// ═══════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════

// Health check - CRITICAL for Cloud Run
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

// Root - Serve dashboard or API info
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    
    // Check if HTML dashboard exists
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    } else {
        // Return API info if no dashboard
        res.json({ 
            message: 'Gate.io Trading Bot API',
            version: '3.0.0',
            port: PORT,
            timestamp: new Date().toISOString(),
            endpoints: {
                health: '/health',
                webhook: '/webhook',
                status: '/api/status',
                config: '/api/config',
                test: '/api/test'
            }
        });
    }
});

// Main webhook endpoint
app.post('/webhook', validateWebhook, async (req, res) => {
    console.log('═══ Webhook Received ═══');
    console.log('Headers:', JSON.stringify(req.headers));
    console.log('Body:', JSON.stringify(req.body));
    
    try {
        // Parse signal
        const signal = parseSignal(req.body);
        console.log('Parsed signal:', signal);
        
        // Execute signal
        const result = await executeSignal(signal);
        
        console.log('✅ Signal processed successfully');
        res.json({
            status: 'success',
            result: result
        });
        
    } catch (error) {
        console.error('❌ Webhook error:', error.message);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Alternative webhook endpoint for compatibility
app.post('/webhook/tradingview', validateWebhook, async (req, res) => {
    // Forward to main webhook handler
    req.url = '/webhook';
    app.handle(req, res);
});

// API Status endpoint
app.get('/api/status', async (req, res) => {
    const status = {
        server: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        port: PORT,
        stats: tradingEngine.dailyStats
    };
    
    // Check Gate.io API connection
    if (config.gateio.apiKey) {
        try {
            const balances = await gateio.testConnection();
            status.gateio = balances ? 'connected' : 'disconnected';
        } catch (error) {
            status.gateio = 'error';
            status.gateioError = error.message;
        }
    } else {
        status.gateio = 'not_configured';
    }
    
    res.json(status);
});

// Configuration status (without sensitive data)
app.get('/api/config', (req, res) => {
    res.json({
        gateio: {
            configured: !!config.gateio.apiKey,
            url: config.gateio.apiUrl,
            realTradingEnabled: process.env.ENABLE_REAL_TRADING === 'true'
        },
        webhook: {
            secretConfigured: !!config.webhook.secret,
            ipWhitelist: config.webhook.allowedIPs.length > 0,
            allowedIPs: config.webhook.allowedIPs
        },
        trading: {
            maxPositionSize: config.trading.maxPositionSize,
            riskPercentage: config.trading.riskPercentage,
            minOrderValue: config.trading.minOrderValue
        },
        server: {
            port: PORT,
            environment: config.env,
            version: '3.0.0'
        }
    });
});

// Test endpoint
app.post('/api/test', async (req, res) => {
    const testSignal = {
        action: req.body.action || 'buy',
        symbol: req.body.symbol || 'BTC_USDT',
        amount: req.body.amount || 0.0001,
        price: req.body.price || null,
        comment: 'Test signal from API'
    };
    
    try {
        const result = await executeSignal(testSignal);
        res.json({
            status: 'success',
            result: result
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Get balances
app.get('/api/balances', async (req, res) => {
    try {
        if (!config.gateio.apiKey) {
            return res.json({
                status: 'error',
                message: 'API not configured',
                balances: []
            });
        }
        
        const balances = await gateio.getSpotBalances();
        const filtered = balances.filter(b => 
            parseFloat(b.available) > 0 || parseFloat(b.locked) > 0
        );
        
        res.json({
            status: 'success',
            balances: filtered
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Get open orders
app.get('/api/orders', async (req, res) => {
    try {
        if (!config.gateio.apiKey) {
            return res.json({
                status: 'error',
                message: 'API not configured',
                orders: []
            });
        }
        
        const orders = await gateio.getOpenOrders(req.query.symbol);
        res.json({
            status: 'success',
            orders: orders
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Cancel order
app.delete('/api/orders/:orderId', async (req, res) => {
    try {
        if (!config.gateio.apiKey) {
            return res.status(400).json({
                status: 'error',
                message: 'API not configured'
            });
        }
        
        const { orderId } = req.params;
        const { symbol } = req.query;
        
        if (!symbol) {
            return res.status(400).json({
                status: 'error',
                message: 'Symbol is required'
            });
        }
        
        const result = await gateio.cancelOrder(orderId, symbol);
        res.json({
            status: 'success',
            result: result
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.path,
        timestamp: new Date().toISOString()
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        timestamp: new Date().toISOString()
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Server Start
// ═══════════════════════════════════════════════════════════════════════════

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ═══════════════════════════════════════════════════════════════════
    🚀 Gate.io Trading Bot Started Successfully
    ═══════════════════════════════════════════════════════════════════
    📍 Port: ${PORT}
    🌍 Environment: ${config.env}
    📅 Started: ${new Date().toISOString()}
    
    📡 Webhook URL: https://[YOUR-CLOUD-RUN-URL]/webhook
    
    🔧 Configuration Status:
       Gate.io API: ${config.gateio.apiKey ? '✅ Configured' : '❌ Not configured'}
       Webhook Secret: ${config.webhook.secret ? '✅ Set' : '⚠️ Not set'}
       Real Trading: ${process.env.ENABLE_REAL_TRADING === 'true' ? '✅ Enabled' : '⚠️ Disabled (Test Mode)'}
    
    📌 Important Notes:
       - Set ENABLE_REAL_TRADING=true to enable real trades
       - Configure GATE_API_KEY and GATE_API_SECRET
       - Set WEBHOOK_SECRET for security
    ═══════════════════════════════════════════════════════════════════
    `);
    
    // Test API connection on startup
    if (config.gateio.apiKey) {
        gateio.testConnection().then(result => {
            if (result) {
                console.log('✅ Gate.io API connection successful');
            } else {
                console.log('❌ Gate.io API connection failed');
            }
        });
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = app;
