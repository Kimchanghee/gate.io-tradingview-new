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
let isConnected = false;

// 웹훅 신호 저장 (사용자별)
const webhookSignals = {};

// 자동 거래 설정
let autoTrading = false;
let defaultInvestmentAmount = 100;
let defaultLeverage = 10;

// 로깅 함수
function logMultiple(message, data = null, forceLog = false) {
  if (!forceLog && isConnected && message.includes('포지션')) {
    return;
  }
  
  const timestamp = new Date().toISOString();
  const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
  
  logs.push({
    id: Date.now() + Math.random(),
    timestamp,
    message: logMessage,
    level: 'info'
  });
  
  if (logs.length > 100) {
    logs.shift();
  }
  
  console.log(`[${timestamp}] ${logMessage}`);
}

// 웹훅 신호 정리 함수
function formatWebhookSignal(signal) {
  const { action, symbol, side, size, leverage } = signal;
  const coinName = symbol ? symbol.replace('_USDT', '').replace('_USD', '') : 'Unknown';
  
  const actionKo = {
    'open': '포지션 오픈',
    'buy': '매수',
    'sell': '매도',
    'close': '포지션 종료'
  }[action?.toLowerCase()] || action;
  
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

// Gate.io API 호출
async function callGateioAPI(method, endpoint, data = {}, isSpotAPI = false, silent = false) {
  if (!GATEIO_API_KEY || !GATEIO_API_SECRET) {
    throw new Error('Gate.io API credentials not configured');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const queryString = '';
  const bodyStr = method === 'GET' ? '' : JSON.stringify(data);
  
  const payloadHash = crypto.createHash('sha512').update(bodyStr, 'utf8').digest('hex');
  const signString = `${method}\n${endpoint}\n${queryString}\n${payloadHash}\n${timestamp}`;
  const signature = crypto.createHmac('sha512', GATEIO_API_SECRET).update(signString, 'utf8').digest('hex');

  const baseUrl = isSpotAPI 
    ? 'https://api.gateio.ws'
    : (GATEIO_TESTNET ? 'https://fx-api-testnet.gateio.ws' : 'https://api.gateio.ws');

  if (!silent && !endpoint.includes('/positions')) {
    logMultiple('API 호출', { method, endpoint, timestamp, hasBody: !!bodyStr, isSpotAPI });
  }

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
  
  if (!silent && !endpoint.includes('/positions')) {
    logMultiple('API 응답', { status: response.status, body: responseText.substring(0, 200) });
  }

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

// 선물 계정 정보 조회
async function getFuturesAccountInfo() {
  try {
    const response = await callGateioAPI('GET', '/api/v4/futures/usdt/accounts', {}, false, true);
    
    console.log('선물 계정 API 원본 응답:', JSON.stringify(response));
    
    let accountData = response;
    
    if (response.accounts && Array.isArray(response.accounts)) {
      accountData = response.accounts[0];
    } else if (Array.isArray(response)) {
      accountData = response[0];
    }
    
    if (!accountData) {
      console.log('선물 계정 데이터 없음');
      return {
        total: 0,
        available: 0,
        positionMargin: 0,
        orderMargin: 0,
        unrealisedPnl: 0,
        currency: 'USDT'
      };
    }
    
    const result = {
      total: parseFloat(accountData.total || accountData.balance || 0),
      available: parseFloat(accountData.available || accountData.available_balance || 0), 
      positionMargin: parseFloat(accountData.position_margin || accountData.margin || 0),
      orderMargin: parseFloat(accountData.order_margin || 0),
      unrealisedPnl: parseFloat(accountData.unrealised_pnl || accountData.unrealized_pnl || 0),
      currency: accountData.currency || 'USDT'
    };
    
    console.log('선물 계정 처리 결과:', result);
    
    return result;
  } catch (error) {
    console.log('선물 계정 정보 조회 실패:', error.message);
    
    if (error.message.includes('please transfer funds first') || 
        error.message.includes('insufficient')) {
      return {
        total: 0,
        available: 0,
        positionMargin: 0,
        orderMargin: 0,
        unrealisedPnl: 0,
        currency: 'USDT'
      };
    }
    
    throw error;
  }
}

// 현물 계정 정보 조회
async function getSpotBalances() {
  try {
    const balances = await callGateioAPI('GET', '/api/v4/spot/accounts', {}, true, true);
    
    const majorCoins = ['USDT', 'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'MATIC'];
    const filteredBalances = balances
      .filter(b => {
        const available = parseFloat(b.available || 0);
        const locked = parseFloat(b.locked || 0);
        const total = available + locked;
        return total > 0 || majorCoins.includes(b.currency);
      })
      .map(b => ({
        currency: b.currency,
        available: parseFloat(b.available || 0),
        locked: parseFloat(b.locked || 0),
        total: parseFloat(b.available || 0) + parseFloat(b.locked || 0)
      }))
      .sort((a, b) => {
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

// 마진 계정 정보 조회
async function getMarginBalances() {
  try {
    const accounts = await callGateioAPI('GET', '/api/v4/margin/accounts', {}, true, true);
    
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

// 옵션 계정 정보 조회
async function getOptionsAccountInfo() {
  try {
    const account = await callGateioAPI('GET', '/api/v4/options/accounts', {}, false, true);
    
    return {
      total: parseFloat(account.total || 0),
      available: parseFloat(account.available || 0),
      positionValue: parseFloat(account.position_value || 0),
      orderMargin: parseFloat(account.order_margin || 0),
      unrealisedPnl: parseFloat(account.unrealised_pnl || 0)
    };
  } catch (error) {
    return null;
  }
}

// 통합 계정 정보 조회
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

    let totalEstimatedValue = 0;
    
    if (result.futures) {
      totalEstimatedValue += result.futures.total;
    }
    
    result.spot.forEach(balance => {
      if (balance.currency === 'USDT') {
        totalEstimatedValue += balance.total;
      }
    });
    
    result.margin.forEach(margin => {
      if (margin.quote && margin.quote.currency === 'USDT') {
        const netUsdt = margin.quote.available - margin.quote.borrowed;
        if (netUsdt > 0) {
          totalEstimatedValue += netUsdt;
        }
      }
    });
    
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

// 포지션 조회
async function getPositions() {
  try {
    const positions = await callGateioAPI('GET', '/api/v4/futures/usdt/positions', {}, false, true);
    
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
        marginMode: p.mode,
        adlRanking: p.adl_ranking
      }));
    
    return activePositions;
  } catch (error) {
    return [];
  }
}

// 자동매매 로직
async function processTradeSignal(signal) {
  const { action, symbol, side, size, leverage } = signal;
  
  logMultiple('거래 처리 시작', formatWebhookSignal(signal), true);

  try {
    if (leverage && leverage > 1) {
      await setLeverage(symbol, leverage);
    }

    switch (action?.toLowerCase()) {
      case 'open':
      case 'buy':
      case 'sell':
        const orderData = {
          contract: symbol,
          side: side.toLowerCase(),
          size: Math.abs(size || defaultInvestmentAmount).toString(),
          price: '0',
          tif: 'ioc',
          text: 'webhook_order'
        };
        
        logMultiple('주문 데이터', orderData, true);
        
        const result = await callGateioAPI('POST', '/api/v4/futures/usdt/orders', orderData);
        logMultiple('거래 실행 성공', { 
          orderId: result.id,
          symbol, 
          side, 
          size,
          status: result.status
        }, true);
        return result;

      case 'close':
        const positions = await callGateioAPI('GET', '/api/v4/futures/usdt/positions');
        const position = positions.find(p => p.contract === symbol && parseFloat(p.size) !== 0);
        
        if (position) {
          const positionSize = parseFloat(position.size);
          const closeSide = positionSize > 0 ? 'short' : 'long';
          
          const closeOrder = {
            contract: symbol,
            side: closeSide,
            size: Math.abs(positionSize).toString(),
            price: '0',
            tif: 'ioc',
            text: 'webhook_close',
            reduce_only: true
          };
          
          logMultiple('청산 주문 데이터', closeOrder, true);
          
          const closeResult = await callGateioAPI('POST', '/api/v4/futures/usdt/orders', closeOrder);
          logMultiple('포지션 종료 성공', { 
            orderId: closeResult.id,
            symbol,
            closedSize: Math.abs(positionSize)
          }, true);
          return closeResult;
        } else {
          logMultiple('청산할 포지션이 없음', { symbol }, true);
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
    }, true);
    throw error;
  }
}

// HTTP 서버 생성
const server = createServer(async (req, res) => {
  const { pathname, query } = parse(req.url, true);
  
  const excludeFromLogs = ['/api/logs', '/api/positions', '/api/webhook/signals', '/assets/', '/vite.svg', '/index.css', '/service-worker.js'];
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
    // API 라우팅
    if (pathname.startsWith('/api/')) {
      
      // 로그 조회
      if (pathname === '/api/logs' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          logs: logs.slice(-50)
        }));
        return;
      }
      
      // 헬스체크
      if (pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'healthy', 
          timestamp: new Date().toISOString(),
          gateio: GATEIO_TESTNET ? 'testnet' : 'mainnet'
        }));
        return;
      }

      // 설정 저장
      if (pathname === '/api/settings' && req.method === 'POST') {
        const body = await parseBody(req);
        autoTrading = body.autoTrading || false;
        defaultInvestmentAmount = body.investmentAmount || 100;
        defaultLeverage = body.defaultLeverage || 10;
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // 웹훅 신호 조회
      if (pathname === '/api/webhook/signals' && req.method === 'GET') {
        const webhookId = query.id || 'default';
        const signals = webhookSignals[webhookId] || [];
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          signals: signals.slice(-10)
        }));
        return;
      }

      // API 연결
      if (pathname === '/api/connect' && req.method === 'POST') {
        const body = await parseBody(req);
        const { apiKey, apiSecret, isTestnet } = body;

        if (!apiKey || !apiSecret) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, message: 'API credentials required' }));
          return;
        }

        try {
          GATEIO_API_KEY = apiKey;
          GATEIO_API_SECRET = apiSecret;
          GATEIO_TESTNET = isTestnet;
          isConnected = true;

          console.log('선물 계정 조회 시작...');
          const futuresAccount = await getFuturesAccountInfo();
          console.log('선물 계정 조회 결과:', futuresAccount);
          
          const allAccounts = await getAllAccountInfo();
          const positions = await getPositions();
          
          logMultiple('✅ API 연결 성공', { 
            network: isTestnet ? '테스트넷' : '메인넷',
            선물계정: futuresAccount.total,
            총자산: `${allAccounts.totalEstimatedValue.toFixed(2)} USDT`
          }, true);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            ok: true, 
            message: 'API 연결 성공',
            network: isTestnet ? 'testnet' : 'mainnet',
            accounts: allAccounts,
            positions: positions,
            debug: {
              futures: futuresAccount
            }
          }));
        } catch (error) {
          if (error.message.includes('please transfer funds first') || 
              error.message.includes('insufficient') ||
              error.message.includes('not enough')) {
            isConnected = true;
            
            let accountInfo = {
              futures: {
                total: 0,
                available: 0,
                positionMargin: 0,
                orderMargin: 0,
                unrealisedPnl: 0,
                currency: 'USDT'
              },
              spot: [],
              margin: [],
              options: null,
              totalEstimatedValue: 0
            };
            
            try {
              accountInfo.spot = await getSpotBalances();
              accountInfo.margin = await getMarginBalances();
              accountInfo.options = await getOptionsAccountInfo();
              
              accountInfo.totalEstimatedValue = accountInfo.spot.reduce((sum, b) => 
                b.currency === 'USDT' ? sum + b.total : sum, 0);
              
              if (accountInfo.options) {
                accountInfo.totalEstimatedValue += accountInfo.options.total;
              }
            } catch (e) {
              console.log('추가 계정 정보 조회 실패:', e.message);
            }
            
            logMultiple('✅ API 연결 성공', { 
              network: isTestnet ? '테스트넷' : '메인넷',
              총자산: `${accountInfo.totalEstimatedValue.toFixed(2)} USDT`,
              참고: '선물 계정 자금 부족'
            }, true);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              ok: true, 
              message: 'API 연결 성공',
              network: isTestnet ? 'testnet' : 'mainnet',
              accounts: accountInfo,
              positions: [],
              warning: '선물 계정에 자금이 없습니다. 현물→선물로 자금을 이체해주세요.'
            }));
          } else {
            isConnected = false;
            logMultiple('❌ API 연결 실패', { error: error.message }, true);
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

      // 계정 정보 조회
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

      // 포지션 종료
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

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API endpoint not found' }));
      return;
    }

    // 웹훅 엔드포인트 (사용자별 고유 ID)
    if (pathname.startsWith('/webhook/') && req.method === 'POST') {
      const webhookId = pathname.split('/')[2] || 'default';
      const signal = await parseBody(req);
      
      // 웹훅 ID별로 신호 저장
      if (!webhookSignals[webhookId]) {
        webhookSignals[webhookId] = [];
      }
      
      const signalData = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        ...signal,
        status: 'pending'
      };
      
      webhookSignals[webhookId].push(signalData);
      
      // 최근 20개만 유지
      if (webhookSignals[webhookId].length > 20) {
        webhookSignals[webhookId] = webhookSignals[webhookId].slice(-20);
      }
      
      logMultiple(`📡 웹훅 수신 [${webhookId}]`, formatWebhookSignal(signal), true);

      // API 키가 있고 자동 거래가 켜져있을 때만 거래 실행
      if (GATEIO_API_KEY && GATEIO_API_SECRET && autoTrading) {
        try {
          const result = await processTradeSignal({
            ...signal,
            size: signal.size || defaultInvestmentAmount,
            leverage: signal.leverage || defaultLeverage
          });
          
          // 신호 상태 업데이트
          signalData.status = 'executed';
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'Signal processed and executed',
            result,
            webhookId
          }));
        } catch (error) {
          signalData.status = 'failed';
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'Signal received but execution failed',
            error: error.message,
            webhookId
          }));
        }
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Signal received and stored (Auto trading off or API not connected)',
          webhookId,
          autoTrading,
          apiConnected: !!(GATEIO_API_KEY && GATEIO_API_SECRET)
        }));
      }
      
      return;
    }

    // 정적 파일 서빙
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = join(DIST_DIR, filePath);

    if (!existsSync(filePath)) {
      filePath = join(DIST_DIR, 'index.html');
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
    logMultiple('서버 오류', { error: error.message }, true);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  logMultiple('🚀 서버 시작', { 
    port: PORT, 
    apiConfigured: !!(GATEIO_API_KEY && GATEIO_API_SECRET),
    network: GATEIO_TESTNET ? '테스트넷' : '메인넷'
  }, true);
});

// 종료 처리
process.on('SIGTERM', () => {
  logMultiple('서버 종료 중 (SIGTERM)', null, true);
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  logMultiple('서버 종료 중 (SIGINT)', null, true);
  server.close(() => process.exit(0));
});