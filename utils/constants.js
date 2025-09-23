module.exports = {
    // Gate.io 상수
    GATE_API_VERSION: 'v4',
    GATE_SPOT_ENDPOINT: '/spot',
    GATE_FUTURES_ENDPOINT: '/futures',
    
    // 거래 상수
    MIN_ORDER_VALUE_USDT: 5,
    MAX_SLIPPAGE_PERCENT: 0.5,
    DEFAULT_TIME_IN_FORCE: 'gtc', // Good Till Cancel
    
    // 심볼 매핑
    SYMBOL_MAPPING: {
        'BTCUSDT': 'BTC_USDT',
        'ETHUSDT': 'ETH_USDT',
        'BNBUSDT': 'BNB_USDT',
        'SOLUSDT': 'SOL_USDT',
        'ADAUSDT': 'ADA_USDT',
        'XRPUSDT': 'XRP_USDT',
        'DOTUSDT': 'DOT_USDT',
        'DOGEUSDT': 'DOGE_USDT',
        'AVAXUSDT': 'AVAX_USDT',
        'SHIBUSDT': 'SHIB_USDT',
        'MATICUSDT': 'MATIC_USDT',
        'LTCUSDT': 'LTC_USDT',
        'UNIUSDT': 'UNI_USDT',
        'LINKUSDT': 'LINK_USDT',
        'ATOMUSDT': 'ATOM_USDT'
    },
    
    // 시간 상수
    WEBHOOK_TIMEOUT: 30000, // 30초
    API_TIMEOUT: 10000, // 10초
    RECONNECT_DELAY: 5000, // 5초
    
    // 리스크 관리
    DEFAULT_STOP_LOSS: 5, // 5%
    DEFAULT_TAKE_PROFIT: 10, // 10%
    MAX_DAILY_LOSS: 10, // 10%
    MAX_POSITION_COUNT: 10,
    
    // 에러 코드
    ERROR_CODES: {
        INSUFFICIENT_BALANCE: 'E001',
        INVALID_SYMBOL: 'E002',
        ORDER_FAILED: 'E003',
        API_ERROR: 'E004',
        RISK_LIMIT: 'E005',
        UNAUTHORIZED: 'E401',
        RATE_LIMIT: 'E429'
    }
};
