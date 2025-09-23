require('dotenv').config();
const gateio = require('./api/gateio');
const logger = require('./utils/logger');

async function testConnection() {
    console.log('═══════════════════════════════════════════');
    console.log('🧪 Gate.io API Connection Test');
    console.log('═══════════════════════════════════════════\n');
    
    try {
        // 환경변수 확인
        console.log('📋 Configuration Check:');
        console.log('  API Key:', process.env.GATE_API_KEY ? '✅ Configured' : '❌ Missing');
        console.log('  API Secret:', process.env.GATE_API_SECRET ? '✅ Configured' : '❌ Missing');
        console.log('  API URL:', process.env.GATE_API_URL || 'Using default');
        
        // 1. 계정 정보 테스트
        console.log('\n📊 Testing Account Info...');
        const accountInfo = await gateio.getAccountInfo();
        console.log('  ✅ Account info retrieved successfully');
        
        // 2. 잔고 조회 테스트
        console.log('\n💰 Testing Spot Balances...');
        const balances = await gateio.getSpotBalances();
        console.log(`  ✅ Found ${balances.length} currencies`);
        
        // 주요 잔고 표시
        const mainBalances = balances.filter(b => 
            parseFloat(b.available) > 0 || parseFloat(b.locked) > 0
        );
        if (mainBalances.length > 0) {
            console.log('\n  Active Balances:');
            mainBalances.forEach(b => {
                console.log(`    ${b.currency}: ${b.available} available, ${b.locked} locked`);
            });
        }
        
        // 3. 시장 가격 조회 테스트
        console.log('\n📈 Testing Market Data...');
        const btcPrice = await gateio.getMarketPrice('BTC_USDT');
        console.log(`  ✅ BTC/USDT Price: $${btcPrice.last}`);
        
        // 4. 오픈 주문 확인
        console.log('\n📝 Testing Open Orders...');
        const openOrders = await gateio.getOpenOrders();
        console.log(`  ✅ Open orders: ${openOrders.length}`);
        
        console.log('\n═══════════════════════════════════════════');
        console.log('✅ All tests passed successfully!');
        console.log('═══════════════════════════════════════════');
        
    } catch (error) {
        console.error('\n═══════════════════════════════════════════');
        console.error('❌ Test Failed!');
        console.error('═══════════════════════════════════════════');
        console.error('Error:', error.message);
        
        if (error.response) {
            console.error('\nAPI Response:');
            console.error('  Status:', error.response.status);
            console.error('  Data:', error.response.data);
        }
        
        console.error('\n💡 Troubleshooting Tips:');
        console.error('  1. Check if API keys are correctly set in .env');
        console.error('  2. Verify API key permissions on Gate.io');
        console.error('  3. Check if IP whitelist is configured');
        console.error('  4. Ensure API keys are not expired');
    }
}

// 웹훅 테스트
async function testWebhook() {
    console.log('\n📮 Testing Webhook Endpoint...');
    
    const testSignal = {
        action: 'buy',
        symbol: 'BTC_USDT',
        price: 50000,
        amount: 0.001,
        comment: 'Test signal'
    };
    
    console.log('Test signal:', testSignal);
    console.log('\nTo test webhook, send POST request to:');
    console.log(`http://localhost:${process.env.PORT || 3000}/webhook/tradingview`);
    console.log('\nWith body:', JSON.stringify(testSignal, null, 2));
}

// 메인 실행
(async () => {
    await testConnection();
    await testWebhook();
})();
