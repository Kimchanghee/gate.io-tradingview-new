module.exports = {
    // 거래 전략 설정
    strategies: {
        default: {
            enabled: true,
            maxPositionSize: 1000,
            riskPercentage: 2,
            stopLoss: 5,
            takeProfit: 10,
            trailingStop: false,
            trailingStopDistance: 2
        },
        scalping: {
            enabled: false,
            maxPositionSize: 500,
            riskPercentage: 1,
            stopLoss: 2,
            takeProfit: 3,
            timeframe: '1m'
        },
        swing: {
            enabled: false,
            maxPositionSize: 2000,
            riskPercentage: 3,
            stopLoss: 7,
            takeProfit: 15,
            timeframe: '4h'
        }
    },
    
    // 마켓 메이커 설정
    marketMaker: {
        enabled: false,
        spread: 0.1,
        orderCount: 5,
        orderAmount: 0.01,
        rebalanceInterval: 60000
    },
    
    // DCA (Dollar Cost Averaging) 설정
    dca: {
        enabled: false,
        interval: 3600000, // 1시간
        amount: 10,
        maxOrders: 10
    }
};
