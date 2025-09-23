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
// Trading Engine (Simplified)
// ═══════════════════════════════════════════════════════════════════════════

async function executeSignal(signal) {
    try {
        console.log('Executing signal:', signal);
        
        // Format symbol
        const symbol = formatSymbol(signal.symbol);
        
        // For now, just log the signal (you can enable actual trading later)
        const result = {
            success: true,
            message: 'Signal received and logged',
            signal: signal,
            symbol: symbol,
            timestamp: new Date().toISOString()
        };
        
        // If API is configured, try to get market price
        if (config.gateio.apiKey) {
            try {
                const marketData = await gateio.getMarketPrice(symbol);
                result.marketPrice = marketData.last;
            } catch (error) {
                console.error('Market data error:', error.message);
            }
        }
        
        return result;
        
    } catch (error) {
        console.error('Execute signal error:', error);
        throw error;
    }
}

function formatSymbol(symbol) {
    if (!symbol) return 'BTC_USDT';
    
    if (symbol.includes('_')) {
        return symbol.toUpperCase();
    }
    
    const pairs = ['USDT', 'USDC', 'BTC', 'ETH'];
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
        symbol: parsed.symbol || parsed.ticker || 'BTC_USDT',
        price: parseFloat(parsed.price) || null,
        amount: parseFloat(parsed.amount) || null,
        comment: parsed.comment || '',
        timestamp: new Date().toISOString()
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

// Root
app.get('/', (req, res) => {
    res.json({ 
        message: 'Gate.io Trading Bot API',
        version: '3.0.0',
        port: PORT,
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            webhook: '/webhook',
            status: '/api/status',
            config: '/api/config'
        }
    });
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
    console.log('═══ Webhook Received ═══');
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

// API Status
app.get('/api/status', async (req, res) => {
    const status = {
        server: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        port: PORT
    };
    
    // Check Gate.io API connection
    if (config.gateio.apiKey) {
        try {
            const balances = await gateio.testConnection();
            status.gateio = balances ? 'connected' : 'disconnected';
        } catch (error) {
            status.gateio = 'error';
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
            url: config.gateio.apiUrl
        },
        webhook: {
            secretConfigured: !!config.webhook.secret,
            ipWhitelist: config.webhook.allowedIPs.length > 0
        },
        trading: {
            maxPositionSize: config.trading.maxPositionSize,
            riskPercentage: config.trading.riskPercentage,
            minOrderValue: config.trading.minOrderValue
        }
    });
});

// Test endpoint
app.post('/api/test', async (req, res) => {
    const testSignal = {
        action: 'buy',
        symbol: 'BTC_USDT',
        amount: 0.0001,
        price: null,
        comment: 'Test signal'
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

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.path
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// Server Start
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ═══════════════════════════════════════════════════════════════════
    🚀 Gate.io Trading Bot Started Successfully
    ═══════════════════════════════════════════════════════════════════
    📍 Port: ${PORT}
    🌍 Environment: ${config.env}
    📅 Started: ${new Date().toISOString()}
    
    📡 Webhook URL: https://YOUR_CLOUD_RUN_URL/webhook
    
    🔧 Configuration Status:
       Gate.io API: ${config.gateio.apiKey ? '✅ Configured' : '❌ Not configured'}
       Webhook Secret: ${config.webhook.secret ? '✅ Set' : '⚠️ Not set'}
    ═══════════════════════════════════════════════════════════════════════
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

module.exports = app;
