const logger = require('../utils/logger');

const DEFAULT_ADMIN_TOKEN = 'Ckdgml9788@';

function resolveAdminToken() {
    const candidates = [
        process.env.ADMIN_TOKEN,
        process.env.ADMIN_SECRET,
        process.env.ADMIN_KEY
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            const trimmed = candidate.trim();
            if (trimmed) {
                return trimmed;
            }
        }
    }

    return DEFAULT_ADMIN_TOKEN;
}

function authenticateAdmin(req, res, next) {
    try {
        const token = req.headers['authorization'] ||
                     req.headers['x-admin-token'] ||
                     req.query.token;

        const adminToken = resolveAdminToken();

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
