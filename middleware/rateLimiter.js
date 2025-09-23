const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// 일반 API 리미터
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100, // 최대 100 요청
    message: 'Too many requests, please try again later',
    handler: (req, res) => {
        logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfter: req.rateLimit.resetTime
        });
    }
});

// 웹훅 전용 리미터
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000, // 1분
    max: 30, // 분당 30 요청
    skipSuccessfulRequests: false
});

// 관리자 API 리미터
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50
});

module.exports = generalLimiter;
module.exports.webhookLimiter = webhookLimiter;
module.exports.adminLimiter = adminLimiter;
