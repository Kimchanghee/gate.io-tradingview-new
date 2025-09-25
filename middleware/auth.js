const logger = require('../utils/logger');

function authenticateAdmin(req, res, next) {
    try {
        const token = req.headers['authorization'] ||
                     req.headers['x-admin-token'] ||
                     req.query.token;

        const adminToken = process.env.ADMIN_TOKEN;

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

function authenticateUser(req, res, next) {
    // 사용자 인증 구현 (선택사항)
    next();
}

module.exports = {
    authenticateAdmin,
    authenticateUser
};
