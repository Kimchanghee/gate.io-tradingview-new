module.exports = {
    // 거래 가능 심볼
    allowedSymbols: [
        'BTC_USDT',
        'ETH_USDT',
        'BNB_USDT',
        'SOL_USDT',
        'XRP_USDT',
        'ADA_USDT',
        'DOGE_USDT',
        'AVAX_USDT',
        'DOT_USDT',
        'MATIC_USDT'
    ],
    
    // 심볼별 설정
    symbolSettings: {
        'BTC_USDT': {
            minAmount: 0.0001,
            maxAmount: 1,
            precision: 8,
            minNotional: 10
        },
        'ETH_USDT': {
            minAmount: 0.001,
            maxAmount: 10,
            precision: 6,
            minNotional: 10
        },
        'BNB_USDT': {
            minAmount: 0.01,
            maxAmount: 100,
            precision: 4,
            minNotional: 10
        }
    },
    
    // 블랙리스트 (거래 금지)
    blacklist: [
        'LUNA_USDT',
        'UST_USDT',
        'FTT_USDT'
    ]
};
