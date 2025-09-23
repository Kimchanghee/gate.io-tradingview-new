const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
    logger.error('Error handler:', err);
    
    // 에러 타입별 처리
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            details: err.message
        });
    }
    
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            error: 'Unauthorized',
            details: err.message
        });
    }
    
    if (err.response?.status === 429) {
        return res.status(429).json({
            error: 'Rate Limit Exceeded',
            details: 'Too many requests to Gate.io API'
        });
    }
    
    // Gate.io API 에러
    if (err.response?.data?.label) {
        return res.status(400).json({
            error: 'Gate.io API Error',
            label: err.response.data.label,
            message: err.response.data.message || err.response.data.detail
        });
    }
    
    // 기본 에러 응답
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

module.exports = errorHandler;
