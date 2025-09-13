// config.ts - 통합 서버 설정

export const IS_DEVELOPMENT = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Mock API 비활성화 (실제 API 사용)
export const USE_MOCK_API = false;

// 현재 도메인을 백엔드 URL로 사용 (같은 서버이므로)
export const BACKEND_URL = window.location.origin;

// Webhook URL (TradingView에서 사용할 URL)
export const WEBHOOK_URL = `${BACKEND_URL}/webhook`;

export const WEBSOCKET_URL = '';

console.log('🔧 Configuration (Integrated Server):');
console.log('  📍 Environment:', IS_DEVELOPMENT ? 'Development' : 'Production');
console.log('  🎭 Mock API:', USE_MOCK_API ? 'Enabled' : 'Disabled');
console.log('  🌐 Backend URL:', BACKEND_URL);
console.log('  📡 Webhook URL:', WEBHOOK_URL);
console.log('  🏠 Current Origin:', window.location.origin);

// TradingView에서 복사할 수 있도록 전역 변수로 설정
(window as any).WEBHOOK_URL = WEBHOOK_URL;

// 개발자 도구에서 쉽게 확인할 수 있도록
console.log(`
🎯 TradingView Alert 설정:
   Webhook URL: ${WEBHOOK_URL}
   
📋 Alert Message 예시:
{
  "action": "open",
  "symbol": "BTC_USDT", 
  "side": "buy",
  "size": 100,
  "leverage": 10
}
`);