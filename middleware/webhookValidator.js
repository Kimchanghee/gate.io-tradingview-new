const crypto = require('crypto');
const logger = require('../utils/logger');

function validateWebhook(req, res, next) {
    try {
        // 1. IP 화이트리스트 확인
        const allowedIPs = process.env.ALLOWED_IPS?.split(',').map(ip => ip.trim()) || [];
        const clientIP = req.ip || 
                        req.connection.remoteAddress || 
                        req.headers['x-forwarded-for']?.split(',')[0];
        
        logger.info(`Webhook request from IP: ${clientIP}`);
        
        if (allowedIPs.length > 0) {
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

        // 2. 시크릿 토큰 확인
        const webhookSecret = process.env.WEBHOOK_SECRET;
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

        // 3. 요청 본문 검증
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ 
                error: 'Empty request body' 
            });
        }

        // 4. Content-Type 검증
        const contentType = req.headers['content-type'];
        if (!contentType || !contentType.includes('application/json')) {
            logger.warn(`Invalid content type: ${contentType}`);
            // TradingView가 text/plain으로 보낼 수도 있으므로 경고만
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

module.exports = { validateWebhook };
