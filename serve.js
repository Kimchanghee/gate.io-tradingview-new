// serve.js - 정적 파일 + API 서버 통합 버전 (완전 수정)
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

const PORT = process.env.PORT || 8080;
const DIST_DIR = join(__dirname, 'dist');

// Gate.io API 설정 (환경변수에서 가져오기)
let GATEIO_API_KEY = process.env.GATEIO_API_KEY || '';
let GATEIO_API_SECRET = process.env.GATEIO_API_SECRET || '';
let GATEIO_TESTNET = process.env.GATEIO_TESTNET === 'true';

// 로그 저장을 위한 메모리 배열
const logs = [];

// 강화된 로깅 함수 (웹사이트 로그 저장 포함)
function logMultiple(message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
  
  // 메모리에 로그 저장
  logs.push({
    id: Date.now() + Math.random(),
    timestamp,
    message: logMessage,
    level: 'info'
  });
  
  // 최근 100개만 유지
  if (logs.length > 100) {
    logs.shift();
  }
  
  // 모든 방법으로 로그 출력
  console.log(`[${timestamp}] ${logMessage}`);
  console.error(`[${timestamp}] ERROR_LOG: ${logMessage}`);
  process.stdout.write(`[${timestamp}] STDOUT: ${logMessage}\n`);
  process.stderr.write(`[${timestamp}] STDERR: ${logMessage}\n`);
}

// 웹훅 신호 정리 함수
function formatWebhookSignal(signal) {
  const { action, symbol, side, size, leverage } = signal;
  
  // 심볼에서 코인 이름 추출
  const coinName = symbol ? symbol.replace('_USDT', '').replace('_USD', '') : 'Unknown';
  
  // 액션 한국어 변환
  const actionKo = {
    'open': '포지션 오픈',
    'buy': '매수',
    'sell': '매도',
    'close': '포지션 종료'
  }[action?.toLowerCase()] || action;
  
  // 방향 한국어 변환
  const sideKo = {
    'buy': '롱(매수)',
    'sell': '숏(매도)',
    'long': '롱(매수)', 
    'short': '숏(매도)'
  }[side?.toLowerCase()] || side;
  
  return `거래신호 | 코인: ${coinName} | 방향: ${sideKo} | 액션: ${actionKo} | 수량: ${size}${leverage ? ` | 레버리지: ${leverage}x` : ''}`;
}

// MIME 타입 매핑
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Gate.io API 호출 - 수정된 서명 버전
async function callGateioAPI(method, endpoint, data = {}, isSpotAPI = false) {
  if (!GATEIO_API_KEY || !GATEIO_API_SECRET) {
    throw new Error('Gate.io API credentials not configured');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const queryString = '';
  const bodyStr = method === 'GET' ? '' : JSON.stringify(data);
  
  // Gate.io API 서명 생성 (정확한 방식)
  const payloadHash = crypto.createHash('sha512').update(bodyStr, 'utf8').digest('hex');
  const signString = `${method}\n${endpoint}\n${queryString}\n${payloadHash}\n${timestamp}`;
  const signature = crypto.createHmac('sha512', GATEIO_API_SECRET).update(signString, 'utf8').digest('hex');

  // Spot API는 테스트넷이 없으므로 항상 메인넷 사용
  const baseUrl = isSpotAPI 
    ? 'https://api.gateio.ws'
    : (GATEIO_TESTNET ? 'https://fx-api-testnet.gateio.ws' : 'https://api.gateio.ws');

  logMultiple('API 호출', { method, endpoint, timestamp, hasBody: !!bodyStr, isSpotAPI });

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'KEY': GATEIO_API_KEY,
      'Timestamp': timestamp.toString(),
      'Sign': signature
    },
    body: method === 'GET' ? undefined : bodyStr
  });

  const responseText = await response.text();
  logMultiple('API 응답', { status: response.status, body: responseText.substring(0, 200) });

  if (!response.ok) {
    throw new Error(`Gate.io API Error: ${response.status} ${responseText}`);
  }

  try {
    return JSON.parse(responseText);
  } catch (e) {
    throw new Error(`Invalid JSON response: ${responseText}`);
  }
}

// POST 바디 파싱
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

// 레버리지 설정 함수
async function setLeverage(symbol, leverage) {
  if (!leverage || leverage < 1) return;
  
  try {
    await callGateioAPI('POST', '/api/v4/futures/usdt/positions/leverage', {
      contract: symbol,
      leverage: leverage.toString()
    });
    logMultiple('레버리지 설정 완료', { symbol, leverage });
  } catch (error) {
    logMultiple('레버리지 설정 실패', { symbol, leverage, error: error.message });
  }
}

// 계정 정보 조회 함수 개선 - 선물 계정
async function getFuturesAccountInfo() {
  try {
    const account = await callGateioAPI('GET', '/api/v4/futures/usdt/accounts');
    
    return {
      total: parseFloat(account.total || 0),
      available: parseFloat(account.available || 0), 
      positionMargin: parseFloat(account.position_margin || 0),
      orderMargin: parseFloat(account.order_margin || 0),
      unrealisedPnl: parseFloat(account.unrealised_pnl || 0),
      currency: account.currency || 'USDT'
    };
  } catch (error) {
    logMultiple('선물 계정 정보 조회 실패', { error: error.message });
    throw error;
  }
}

// 현물 계정 정보 조회 함수 추가
async function getSpotBalances() {
  try {
    // 현물 계정 잔고 조회
    const balances = await callGateioAPI('GET', '/api/v4/spot/accounts', {}, true);
    
    // USDT와 주요 코인들만 필터링
    const majorCoins = ['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'MATIC'];
    const filteredBalances = balances
      .filter(b => {
        const available = parseFloat(b.available || 0);
        const locked = parseFloat(b.locked || 0);
        const total = available + locked;
        // 0이 아닌 잔고만 포함하거나 주요 코인인 경우
        return total > 0 || majorCoins.includes(b.currency);
      })
      .map(b => ({
        currency: b.currency,
        available: parseFloat(b.available || 0),
        locked: parseFloat(b.locked || 0),
        total: parseFloat(b.available || 0) + parseFloat(b.locked || 0)
      }))
      .sort((a, b) => {
        // USDT를 맨 위로, 그 다음 잔고가 큰 순서로
        if (a.currency === 'USDT') return -1;
        if (b.currency === 'USDT') return 1;
        return b.total - a.total;
      });
    
    return filteredBalances;
  } catch (error) {
    logMultiple('현물 계정 조회 실패', { error: error.message });
    return [];
  }
}

// 마진 계정 정보 조회 함수 추가
async function getMarginBalances() {
  try {
    const accounts = await callGateioAPI('GET', '/api/v4/margin/accounts', {}, true);
    
    // 마진 계정 정보 정리
    const marginBalances = accounts
      .filter(acc => {
        const total = parseFloat(acc.base?.total || 0) + parseFloat(acc.quote?.total || 0);
        return total > 0;
      })
      .map(acc => ({
        currencyPair: acc.currency_pair,
        base: {
          currency: acc.base?.currency || '',
          available: parseFloat(acc.base?.available || 0),
          locked: parseFloat(acc.base?.locked || 0),
          borrowed: parseFloat(acc.base?.borrowed || 0),
          interest: parseFloat(acc.base?.interest || 0)
        },
        quote: {
          currency: acc.quote?.currency || '',
          available: parseFloat(acc.quote?.available || 0),
          locked: parseFloat(acc.quote?.locked || 0),
          borrowed: parseFloat(acc.quote?.borrowed || 0),
          interest: parseFloat(acc.quote?.interest || 0)
        },
        risk: parseFloat(acc.risk || 0)
      }));
    
    return marginBalances;
  } catch (error) {
    logMultiple('마진 계정 조회 실패', { error: error.message });
    return [];
  }
}

// 옵션 계정 정보 조회 함수 추가
async function getOptionsAccountInfo() {
  try {
    const account = await callGateioAPI('GET', '/api/v4/options/accounts', {}, false);
    
    return {
      total: parseFloat(account.total || 0),
      available: parseFloat(account.available || 0),
      positionValue: parseFloat(account.position_value || 0),
      orderMargin: parseFloat(account.order_margin || 0),
      unrealisedPnl: parseFloat(account.unrealised_pnl || 0)
    };
  } catch (error) {
    logMultiple('옵션 계정 조회 실패', { error: error.message });
    // 옵션 계정이 없을 수 있으므로 빈 객체 반환
    return null;
  }
}

// 통합 계정 정보 조회 함수
async function getAllAccountInfo() {
  try {
    const [futures, spot, margin, options] = await Promise.allSettled([
      getFuturesAccountInfo(),
      getSpotBalances(),
      getMarginBalances(),
      getOptionsAccountInfo()
    ]);

    const result = {
      futures: futures.status === 'fulfilled' ? futures.value : null,
      spot: spot.status === 'fulfilled' ? spot.value : [],
      margin: margin.status === 'fulfilled' ? margin.value : [],
      options: options.status === 'fulfilled' ? options.value : null
    };

    // 총 자산 계산 (USDT 기준 추정치)
    let totalEstimatedValue = 0;
    
    if (result.futures) {
      totalEstimatedValue += result.futures.total;
    }
    
    // 현물 USDT 잔고 추가
    const usdtBalance = result.spot.find(b => b.currency === 'USDT');
    if (usdtBalance) {
      totalEstimatedValue += usdtBalance.total;
    }
    
    if (result.options) {
      totalEstimatedValue += result.options.total;
    }

    result.totalEstimatedValue = totalEstimatedValue;
    
    return result;
  } catch (error) {
    logMultiple('통합 계정 정보 조회 실패', { error: error.message });
    throw error;
  }
}

// 포지션 상태 조회 함수 개선
async function getPositions() {
  try {
    const positions = await callGateioAPI('GET', '/api/v4/futures/usdt/positions');
    
    // 활성 포지션만 필터링하고 정보 정리
    const activePositions = positions
      .filter(p => parseFloat(p.size) !== 0)
      .map(p => ({
        contract: p.contract,
        size: parseFloat(p.size),
        side: parseFloat(p.size) > 0 ? 'long' : 'short',
        leverage: p.leverage,
        margin: parseFloat(p.margin),
        pnl: parseFloat(p.unrealised_pnl || 0),
        pnlPercentage: parseFloat(p.unrealised_pnl_percentage || 0),
        entryPrice: parseFloat(p.entry_price || 0),
        markPrice: parseFloat(p.mark_price || 0),
        marginMode: p.mode, // 'cross' 또는 'isolated'
        adlRanking: p.adl_ranking
      }));
    
    return activePositions;
  } catch (error) {
    logMultiple('포지션 조회 실패', { error: error.message });
    return [];
  }
}

// 수정된 자동매매 로직
async function processTradeSignal(signal) {
  const { action, symbol, side, size, leverage } = signal;
  
  logMultiple('거래 처리 시작', formatWebhookSignal(signal));

  try {
    // 레버리지 설정 (필요시)
    if (leverage && leverage > 1) {
      await setLeverage(symbol, leverage);
    }

    switch (action?.toLowerCase()) {
      case 'open':
      case 'buy':
      case 'sell':
        // 포지션 오픈 - 수정된 파라미터
        const orderData = {
          contract: symbol,
          side: side.toLowerCase(), // 'long' 또는 'short'
          size: Math.abs(size).toString(), // 항상 양수
          price: '0', // 시장가 주문
          tif: 'ioc', // Immediate or Cancel
          text: 'webhook_order' // 주문 식별용
        };
        
        logMultiple('주문 데이터', orderData);
        
        const result = await callGateioAPI('POST', '/api/v4/futures/usdt/orders', orderData);
        logMultiple('거래 실행 성공', { 
          orderId: result.id,
          symbol, 
          side, 
          size,
          status: result.status
        });
        return result;

      case 'close':
        // 현재 포지션 조회
        const positions = await callGateioAPI('GET', '/api/v4/futures/usdt/positions');
        const position = positions.find(p => p.contract === symbol && parseFloat(p.size) !== 0);
        
        if (position) {
          const positionSize = parseFloat(position.size);
          const closeSide = positionSize > 0 ? 'short' : 'long'; // 반대 방향으로 청산
          
          const closeOrder = {
            contract: symbol,
            side: closeSide,
            size: Math.abs(positionSize).toString(),
            price: '0',
            tif: 'ioc',
            text: 'webhook_close',
            reduce_only: true // 포지션 감소만 허용
          };
          
          logMultiple('청산 주문 데이터', closeOrder);
          
          const closeResult = await callGateioAPI('POST', '/api/v4/futures/usdt/orders', closeOrder);
          logMultiple('포지션 종료 성공', { 
            orderId: closeResult.id,
            symbol,
            closedSize: Math.abs(positionSize)
          });
          return closeResult;
        } else {
          logMultiple('청산할 포지션이 없음', { symbol });
          return { message: 'No position to close' };
        }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    logMultiple('거래 처리 실패', { 
      symbol,
      action,
      error: error.message
    });
    throw error;
  }
}

// HTTP 서버 생성
const server = createServer(async (req, res) => {
  const { pathname, query } = parse(req.url, true);
  
  // 로그 제외 목록
  const excludeFromLogs = ['/api/logs', '/assets/', '/vite.svg', '/index.css', '/service-worker.js'];
  const shouldLog = !excludeFromLogs.some(path => pathname.startsWith(path));
  
  if (shouldLog) {
    logMultiple(`${req.method} ${pathname}`);
  }

  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // 테스트 엔드포인트
    if (pathname === '/test' && req.method === 'GET') {
      logMultiple('테스트 엔드포인트 호출');
      
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Test endpoint works! ' + new Date().toISOString());
      return;
    }

    // API 라우팅
    if (pathname.startsWith('/api/')) {
      
      // 로그 조회 API
      if (pathname === '/api/logs' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          logs: logs.slice(-50) // 최근 50개 로그만 반환
        }));
        return;
      }
      
      // 헬스체크
      if (pathname === '/api/health') {
        logMultiple('헬스체크 요청');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'healthy', 
          timestamp: new Date().toISOString(),
          gateio: GATEIO_TESTNET ? 'testnet' : 'mainnet'
        }));
        return;
      }

      // API 연결 테스트 - 통합 계정 정보 포함
      if (pathname === '/api/connect' && req.method === 'POST') {
        const body = await parseBody(req);
        const { apiKey, apiSecret, isTestnet } = body;

        if (!apiKey || !apiSecret) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, message: 'API credentials required' }));
          return;
        }

        try {
          // 전역 변수 업데이트
          GATEIO_API_KEY = apiKey;
          GATEIO_API_SECRET = apiSecret;
          GATEIO_TESTNET = isTestnet;

          // 통합 계정 정보 조회
          const allAccounts = await getAllAccountInfo();
          const positions = await getPositions();
          
          logMultiple('API 연결 성공', { 
            testnet: isTestnet,
            hasFutures: !!allAccounts.futures,
            spotCount: allAccounts.spot.length,
            hasOptions: !!allAccounts.options,
            positionCount: positions.length 
          });
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            ok: true, 
            message: 'API 연결 성공',
            network: isTestnet ? 'testnet' : 'mainnet',
            accounts: allAccounts,
            positions: positions
          }));
        } catch (error) {
          // 자금 부족 오류는 연결 성공으로 처리
          if (error.message.includes('please transfer funds first')) {
            logMultiple('API 연결 성공 - 선물계정 자금 없음', { testnet: isTestnet });
            
            // 현물 계정만이라도 조회 시도
            let spotBalances = [];
            try {
              spotBalances = await getSpotBalances();
            } catch (e) {
              logMultiple('현물 계정 조회도 실패', { error: e.message });
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              ok: true, 
              message: 'API 연결 성공',
              network: isTestnet ? 'testnet' : 'mainnet',
              accounts: {
                futures: {
                  total: 0,
                  available: 0,
                  positionMargin: 0,
                  orderMargin: 0,
                  unrealisedPnl: 0,
                  currency: 'USDT'
                },
                spot: spotBalances,
                margin: [],
                options: null,
                totalEstimatedValue: spotBalances.reduce((sum, b) => 
                  b.currency === 'USDT' ? sum + b.total : sum, 0)
              },
              positions: [],
              warning: '선물 계정에 자금이 없습니다. 현물→선물로 자금을 이체해주세요.'
            }));
          } else {
            // 실제 API 키 오류만 실패로 처리
            logMultiple('API 연결 실패', { error: error.message });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              ok: false, 
              message: 'API 키가 잘못되었습니다',
              error: error.message
            }));
          }
        }
        return;
      }

      // 통합 계정 정보 조회 API
      if (pathname === '/api/accounts/all' && req.method === 'GET') {
        try {
          const allAccounts = await getAllAccountInfo();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(allAccounts));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }

      // 포지션 조회
      if (pathname === '/api/positions' && req.method === 'GET') {
        try {
          const positions = await getPositions();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ positions }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }

      // 포지션 닫기
      if (pathname === '/api/positions/close' && req.method === 'POST') {
        const body = await parseBody(req);
        try {
          const result = await processTradeSignal({ action: 'close', symbol: body.contract });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Position closed', result }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }

      // Webhook 제어
      if (pathname.startsWith('/api/webhook/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          message: `Webhook ${pathname.split('/').pop()}`,
          timestamp: new Date().toISOString()
        }));
        return;
      }

      // 404 for unknown API routes
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API endpoint not found' }));
      return;
    }

    // TradingView Webhook 엔드포인트
    if (pathname === '/webhook' && req.method === 'POST') {
      const signal = await parseBody(req);
      
      // 깔끔하게 정리된 웹훅 수신 로그
      logMultiple('웹훅 수신', formatWebhookSignal(signal));

      // 1단계: 웹훅 데이터 검증
      const { action, symbol, side, size } = signal;
      if (!action || !symbol) {
        logMultiple('필수 파라미터 누락', { action, symbol });
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: '필수 파라미터 누락 (action, symbol)',
          received: true,
          timestamp: new Date().toISOString()
        }));
        return;
      }

      // 2단계: API 인증 확인
      if (!GATEIO_API_KEY || !GATEIO_API_SECRET) {
        logMultiple('API 미설정 - 신호만 수신');
        
        const responseData = {
          success: false,
          error: 'Gate.io API credentials not configured',
          received: true,
          webhookData: signal,
          timestamp: new Date().toISOString()
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseData));
        
        logMultiple('웹훅 수신 완료 (API 미설정)');
        return;
      }

      // 3단계: 실제 거래 처리
      try {
        logMultiple('API 인증 확인됨 - 거래 실행');
        const result = await processTradeSignal(signal);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Signal processed successfully',
          timestamp: new Date().toISOString(),
          result
        }));
        
        logMultiple('웹훅 처리 성공');
      } catch (error) {
        logMultiple('거래 실행 실패', { error: error.message });
        
        const errorResponse = {
          success: false,
          error: error.message,
          received: true,
          webhookData: signal,
          timestamp: new Date().toISOString()
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorResponse));
        
        logMultiple('웹훅 에러 응답 전송');
      }
      
      return;
    }

    // 정적 파일 서빙
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = join(DIST_DIR, filePath);

    if (!existsSync(filePath)) {
      filePath = join(DIST_DIR, 'index.html'); // SPA fallback
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }

    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = readFileSync(filePath);
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);

  } catch (error) {
    logMultiple('서버 오류', { error: error.message });
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  logMultiple('서버 시작', { 
    port: PORT, 
    apiConfigured: !!(GATEIO_API_KEY && GATEIO_API_SECRET),
    testnet: GATEIO_TESTNET 
  });
});

// 종료 처리
process.on('SIGTERM', () => {
  logMultiple('서버 종료 중 (SIGTERM)');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  logMultiple('서버 종료 중 (SIGINT)');
  server.close(() => process.exit(0));
});