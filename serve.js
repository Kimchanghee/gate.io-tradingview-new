// serve.js — 통합 서버 (Express 미사용)
// 기능: 정적서빙 + API(연결/설정/헬스/로그/포지션/계정조회) + TradingView Webhook 수신
// - Gate.io v4 서명 규격(method\npath\nquery\nbodyHash\ntimestamp) + 서버시각 동기화
// - Futures는 메인넷/테스트넷 분기, Spot/Margin/Options는 항상 메인넷
// - UI 입력(USDT·레버리지)로 계약수 산출(USDT*lev/mark_price) 후 시장가(IoC) 진입/청산

import { createServer } from 'http';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseUrl } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const PORT = process.env.PORT || 8080;
const DIST_DIR = join(__dirname, 'dist');

// ===== 상태 =====
let GATEIO_API_KEY = process.env.GATEIO_API_KEY || '';
let GATEIO_API_SECRET = process.env.GATEIO_API_SECRET || '';
let GATEIO_TESTNET = process.env.GATEIO_TESTNET === 'true'; // futures만 분기

let autoTrading = false;
let investmentAmountUSDT = 100;
let defaultLeverage = 10;

const logs = [];
const webhookSignals = Object.create(null);
let isConnected = false;
const SETTINGS_FILE = join(__dirname, 'server-settings.json');

// ===== 유틸 =====
function logMultiple(message, data = null, force = true) {
  const ts = new Date().toISOString();
  const line = data ? `${message} ${JSON.stringify(data)}` : message;
  logs.push({ id: `${Date.now()}-${Math.random()}`, timestamp: ts, message: line });
  if (logs.length > 300) logs.shift();
  if (force) console.log(`[${ts}] ${line}`);
}
function sendJSON(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    return ['1', 'true', 'on', 'yes', 'y'].includes(normalized);
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}
function toNumberOr(value, fallback) {
  const numeric = typeof value === 'string' && value.trim() === '' ? Number.NaN : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
function persistSettings() {
  try {
    const payload = {
      autoTrading,
      investmentAmountUSDT,
      defaultLeverage,
      updatedAt: new Date().toISOString()
    };
    writeFileSync(SETTINGS_FILE, JSON.stringify(payload, null, 2), { encoding: 'utf-8' });
  } catch (error) {
    logMultiple('?? ?? ?? ??', { error: error.message });
  }
}
function loadSettingsFromDisk() {
  try {
    if (!existsSync(SETTINGS_FILE)) return;
    const raw = readFileSync(SETTINGS_FILE, 'utf-8');
    if (!raw) return;
    const cfg = JSON.parse(raw);
    if (typeof cfg.autoTrading !== 'undefined') autoTrading = parseBoolean(cfg.autoTrading, autoTrading);
    if (typeof cfg.investmentAmountUSDT !== 'undefined') {
      const parsedAmount = toNumberOr(cfg.investmentAmountUSDT, investmentAmountUSDT);
      if (Number.isFinite(parsedAmount) && parsedAmount > 0) investmentAmountUSDT = parsedAmount;
    }
    if (typeof cfg.defaultLeverage !== 'undefined') {
      const parsedLev = toNumberOr(cfg.defaultLeverage, defaultLeverage);
      if (Number.isFinite(parsedLev) && parsedLev >= 1) defaultLeverage = parsedLev;
    }
    logMultiple('??? ???? ?? ??', { autoTrading, investmentAmountUSDT, defaultLeverage });
  } catch (error) {
    logMultiple('?? ?? ?? ??', { error: error.message });
  }
}

loadSettingsFromDisk();

const mime = {
  '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.mjs':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8',
  '.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'
};
// JSON / urlencoded / key:val / raw
async function parseBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (!raw) return resolve({});
      try { if (ct.includes('json')) return resolve(JSON.parse(raw)); } catch {}
      if (ct.includes('application/x-www-form-urlencoded')) {
        const out = {};
        raw.split('&').forEach(p => {
          const [k,v=''] = p.split('=');
          if (!k) return;
          out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g,' '));
        });
        return resolve(out);
      }
      const obj = {};
      raw.split(/[\r\n]+/).forEach(line => {
        const m = line.match(/^\s*([^=:\s]+)\s*[:=]\s*(.+?)\s*$/);
        if (m) obj[m[1]] = m[2];
      });
      if (Object.keys(obj).length) return resolve(obj);
      resolve({ raw });
    });
  });
}

// ===== TradingView 정규화 =====
function normalizeTradingView(body) {
  const b = body || {};
  let symbol = b.symbol || b.ticker || b.contract || b.pair || (typeof b.raw === 'string' && b.raw.match(/[A-Z]{3,}(?:[_/-]?USDT)/i)?.[0]) || '';
  if (symbol) {
    symbol = String(symbol).toUpperCase().trim().replace(/\.P(ERP)?$/i,'').replace('/', '_').replace('-', '_');
    if (/^([A-Z]+)USDT$/.test(symbol)) symbol = symbol.replace(/USDT$/,'') + '_USDT';
  }
  let action =
    (b.action && String(b.action).toLowerCase()) ||
    (b['strategy.order.action'] && String(b['strategy.order.action']).toLowerCase()) || '';
  let side =
    (b.side && String(b.side).toLowerCase()) ||
    (b.direction && String(b.direction).toLowerCase()) || '';

  const rawSignal = (b.signal || b.SIGNAL || '').toString().toUpperCase();
  if (rawSignal) {
    if (/\bEXIT\b|\bCLOSE\b/.test(rawSignal)) action = 'close';
    if (/\bENTRY\b|\bOPEN\b/.test(rawSignal)) action = 'open';
    if (/\bLONG\b/.test(rawSignal)) side = 'long';
    if (/\bSHORT\b/.test(rawSignal)) side = 'short';
  }

  let size =
    Number(b.size) || Number(b.qty) || Number(b.quantity) ||
    Number(b['strategy.order.contracts']) ||
    (b['strategy.position_size'] != null ? Math.abs(Number(b['strategy.position_size'])) : undefined);
  let leverage =
    Number(b.leverage) || Number(b.lev) ||
    Number((b.comment || b['strategy.order.comment'] || '').toString().match(/lev\s*=?\s*(\d+)/i)?.[1]) || undefined;

  if (!action && !side && typeof b['strategy.position_size'] !== 'undefined') {
    const ps = Number(b['strategy.position_size']);
    if (!Number.isNaN(ps)) { if (ps>0){action='open';side='long';} else if(ps<0){action='open';side='short';} else {action='close';} }
  }
  if (action && !['open','close','buy','sell'].includes(action)) {
    if (/entry|open/i.test(action)) action='open'; else if (/exit|close/i.test(action)) action='close';
  }
  if (action==='buy'||action==='sell'){ side = side || (action==='buy'?'long':'short'); action='open'; }
  if (side==='buy') side='long';
  if (side==='sell') side='short';

  return { action: action||undefined, side: side||undefined, symbol: symbol||undefined, size, leverage, raw: body };
}

// 로그(빈 값 숨김)
function formatWebhookSignalForLog(signal) {
  const { action, symbol, side, size, leverage } = signal || {};
  const parts = [];
  if (symbol) parts.push(`코인:${symbol.replace('_USDT','')}`);
  if (side) parts.push(`방향:${side==='short'?'숏(매도)':'롱(매수)'}`);
  if (action) parts.push(`액션:${action==='close'?'포지션 종료':'포지션 오픈'}`);
  if (typeof size === 'number') parts.push(`수량:${size}`);
  if (typeof leverage === 'number') parts.push(`레버리지:${leverage}x`);
  return parts.length ? `거래신호 | ${parts.join(' | ')}` : '거래신호';
}

// ===== Gate.io v4 (서명, 타임싱크) =====
function hmacSign(secret, payload) {
  return crypto.createHmac('sha512', secret).update(payload).digest('hex');
}
function buildSignPayload(method, pathWithQuery, bodyObj, ts) {
  const [pathOnly, query = ''] = pathWithQuery.split('?', 2);
  const bodyStr = (method === 'GET' || method === 'DELETE') ? '' : JSON.stringify(bodyObj || {});
  const bodyHash = crypto.createHash('sha512').update(bodyStr).digest('hex');
  // 공식 규격: method \n path \n query \n bodyHash \n timestamp
  return `${method.toUpperCase()}\n${pathOnly}\n${query}\n${bodyHash}\n${ts}`;
}
const API_HOSTS = {
  FUTURES_MAIN: 'https://fx-api.gateio.ws',
  FUTURES_TEST: 'https://fx-api-testnet.gateio.ws',
  SPOT_MAIN: 'https://api.gateio.ws',     // spot/margin/options 공용
};

// 서버 시각 동기화 (/api/v4/time)
let gateTimeDriftMs = 0; // gateTime - localTime
let gateTimeLastSync = 0;
async function syncGateTime() {
  try {
    const url = `${API_HOSTS.FUTURES_MAIN}/api/v4/time`;
    const t0 = Date.now();
    const resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    const text = await resp.text();
    const t1 = Date.now();
    const data = JSON.parse(text);
    let gate = Number(data?.server_time);
    if (gate < 1e12) gate = gate * 1000; // 초 -> ms
    const rtt = (t1 - t0) / 2;
    gateTimeDriftMs = (gate + rtt) - t1;
    gateTimeLastSync = Date.now();
  } catch (_) { /* 실패해도 로컬 시간 사용 */ }
}
function gateNowMs() {
  if (Date.now() - gateTimeLastSync > 60_000) syncGateTime(); // 60초마다 재동기화
  return Date.now() + gateTimeDriftMs;
}

/**
 * Gate.io API 호출
 * @param {'GET'|'POST'|'DELETE'} method 
 * @param {string} pathWithQuery  예: /api/v4/futures/usdt/accounts
 * @param {object} body 
 * @param {('futures'|'spot')} apiGroup  - futures: FUTURES_* 호스트 / spot: SPOT_MAIN
 * @param {boolean} auth  - 인증 필요 여부
 */
async function callGateioAPI(method, pathWithQuery, body = {}, apiGroup = 'futures', auth = true) {
  const base =
    apiGroup === 'futures'
      ? (GATEIO_TESTNET ? API_HOSTS.FUTURES_TEST : API_HOSTS.FUTURES_MAIN)
      : API_HOSTS.SPOT_MAIN;
  const url = `${base}${pathWithQuery}`;
  const common = { method, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' } };
  const withBody = (method === 'GET' || method === 'DELETE') ? {} : { body: JSON.stringify(body || {}) };

  async function doReq(tsString) {
    const headers = { ...common.headers };
    if (auth) {
      const payload = buildSignPayload(method, pathWithQuery, body, tsString);
      const sign = hmacSign(GATEIO_API_SECRET, payload);
      headers['KEY'] = GATEIO_API_KEY;
      headers['Timestamp'] = tsString;
      headers['SIGN'] = sign; // 반드시 대문자
    }
    const resp = await fetch(url, { ...common, headers, ...withBody });
    const text = await resp.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { resp, data };
  }

  // 1) ms 타임스탬프로 시도
  let tsMs = `${gateNowMs() | 0}`;
  let { resp, data } = await doReq(tsMs);

  // 2) REQUEST_EXPIRED면 → 시각 재동기화 후 ms로 1회 재시도
  if (!resp.ok && (data?.label === 'REQUEST_EXPIRED' || /expired/i.test(data?.message || ''))) {
    await syncGateTime();
    tsMs = `${gateNowMs() | 0}`;
    ({ resp, data } = await doReq(tsMs));
  }

  // 3) 그래도 실패면 → 초 단위(tsSec)로 마지막 재시도
  if (!resp.ok && (data?.label === 'REQUEST_EXPIRED' || /expired/i.test(data?.message || ''))) {
    const tsSec = `${Math.floor(gateNowMs() / 1000)}`;
    ({ resp, data } = await doReq(tsSec));
  }

  if (!resp.ok) throw new Error(data?.label || data?.message || `HTTP ${resp.status}`);
  return data;
}

// ===== 도메인 로직 =====
async function fetchMarkPrice(symbol) {
  const arr = await callGateioAPI('GET', `/api/v4/futures/usdt/tickers?contract=${encodeURIComponent(symbol)}`, {}, 'futures', false);
  const obj = Array.isArray(arr)?arr[0]:arr;
  const mp = Number(obj?.mark_price || obj?.last || obj?.last_price || 0);
  if (!mp || !isFinite(mp)) throw new Error('mark price unavailable');
  return mp;
}
async function usdtToContracts(symbol, usdtAmount, lev) {
  const price = await fetchMarkPrice(symbol);
  const nominal = Math.max(0, Number(usdtAmount)) * Math.max(1, Number(lev));
  return Math.max(1, Math.floor(nominal / price));
}
async function setLeverage(symbol, leverage) {
  await callGateioAPI('POST','/api/v4/futures/usdt/positions/leverage',{ contract:symbol, leverage:String(leverage), cross_leverage_limit:'0' },'futures', true);
}
async function placeOpenOrder(symbol, sideLongShort, contracts) {
  const sideWord = sideLongShort === 'short' ? 'sell' : 'buy';
  const orderData = { contract:symbol, side:sideWord, size:String(Math.max(1, Number(contracts))), price:'0', tif:'ioc', text:'webhook_order' };
  return await callGateioAPI('POST','/api/v4/futures/usdt/orders',orderData,'futures', true);
}
async function closePosition(symbol) {
  return await callGateioAPI('POST','/api/v4/futures/usdt/positions/close',{ contract:symbol },'futures', true);
}

// ===== 계정 조회 (Futures/Spot/Margin/Options) =====
async function getFuturesAccountInfo() {
  try {
    const acc = await callGateioAPI('GET','/api/v4/futures/usdt/accounts',{},'futures', true);
    return {
      total: parseFloat(acc.total || 0),
      available: parseFloat(acc.available || 0),
      positionMargin: parseFloat(acc.position_margin || 0),
      orderMargin: parseFloat(acc.order_margin || 0),
      unrealisedPnl: parseFloat(acc.unrealised_pnl || 0),
      currency: acc.currency || 'USDT'
    };
  } catch (e) {
    if (/please transfer funds/i.test(e.message)) {
      // 계정은 유효하나 잔고 0
      return { total:0, available:0, positionMargin:0, orderMargin:0, unrealisedPnl:0, currency:'USDT' };
    }
    throw e;
  }
}
async function getSpotBalances() {
  try {
    const arr = await callGateioAPI('GET','/api/v4/spot/accounts',{},'spot', true);
    // 잔고 > 0 만
    return (arr||[])
      .map(b => ({
        currency: b.currency,
        available: parseFloat(b.available || 0),
        locked: parseFloat(b.locked || 0),
        total: parseFloat(b.available || 0) + parseFloat(b.locked || 0)
      }))
      .filter(b => b.total > 0);
  } catch {
    return [];
  }
}
async function getMarginBalances() {
  try {
    const accounts = await callGateioAPI('GET','/api/v4/margin/accounts',{},'spot', true);
    return (accounts||[]).filter(acc => {
      const total = parseFloat(acc.base?.total || 0) + parseFloat(acc.quote?.total || 0);
      return total > 0;
    }).map(acc => ({
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
  } catch {
    return [];
  }
}
async function getOptionsAccountInfo() {
  try {
    const account = await callGateioAPI('GET','/api/v4/options/accounts',{},'spot', true);
    return {
      total: parseFloat(account.total || 0),
      available: parseFloat(account.available || 0),
      positionValue: parseFloat(account.position_value || 0),
      orderMargin: parseFloat(account.order_margin || 0),
      unrealisedPnl: parseFloat(account.unrealised_pnl || 0)
    };
  } catch {
    return null;
  }
}
async function getAllAccountInfo() {
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
  if (result.futures) totalEstimatedValue += result.futures.total;
  result.spot.forEach(b => { if (b.currency === 'USDT') totalEstimatedValue += b.total; });
  result.margin.forEach(m => {
    if (m.quote && m.quote.currency === 'USDT') {
      const net = m.quote.available - m.quote.borrowed;
      if (net > 0) totalEstimatedValue += net;
    }
  });
  if (result.options) totalEstimatedValue += result.options.total;
  result.totalEstimatedValue = totalEstimatedValue;
  return result;
}

// ===== 포지션 조회 =====
async function getPositions() {
  try {
    const positions = await callGateioAPI('GET','/api/v4/futures/usdt/positions',{},'futures', true);
    return (positions||[])
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
  } catch {
    return [];
  }
}

// ===== 서버 =====
const server = createServer(async (req, res) => {
  const { pathname, query } = parseUrl(req.url, true);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Id');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  try {
    // ---------- API ----------
    if (pathname.startsWith('/api/')) {

      // 헬스
      if (pathname === '/api/health' && req.method === 'GET') {
        return sendJSON(res, 200, {
          ok:true, gateio: GATEIO_TESTNET ? 'testnet' : 'mainnet',
          apiConfigured: !!(GATEIO_API_KEY && GATEIO_API_SECRET),
          autoTrading, investmentAmountUSDT, defaultLeverage, ts: new Date().toISOString()
        });
      }

      // 설정 저장(USDT/레버리지/오토)
      if (pathname === '/api/settings' && req.method === 'GET') {
        return sendJSON(res, 200, { autoTrading, investmentAmountUSDT, defaultLeverage });
      }

      if (pathname === '/api/settings' && req.method === 'POST') {
        const body = await parseBody(req);
        let changed = false;

        if (Object.prototype.hasOwnProperty.call(body, 'autoTrading')) {
          const nextAuto = parseBoolean(body.autoTrading, autoTrading);
          if (nextAuto !== autoTrading) {
            autoTrading = nextAuto;
            changed = true;
          }
        }

        const amountSource = Object.prototype.hasOwnProperty.call(body, 'investmentAmountUSDT')
          ? body.investmentAmountUSDT
          : body.investmentAmount;
        if (typeof amountSource !== 'undefined') {
          const parsedAmount = toNumberOr(amountSource, investmentAmountUSDT);
          const sanitizedAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : investmentAmountUSDT;
          if (sanitizedAmount !== investmentAmountUSDT) {
            investmentAmountUSDT = sanitizedAmount;
            changed = true;
          }
        }

        if (typeof body.defaultLeverage !== 'undefined') {
          const parsedLeverage = toNumberOr(body.defaultLeverage, defaultLeverage);
          const sanitizedLeverage = Number.isFinite(parsedLeverage) && parsedLeverage >= 1 ? parsedLeverage : defaultLeverage;
          if (sanitizedLeverage !== defaultLeverage) {
            defaultLeverage = sanitizedLeverage;
            changed = true;
          }
        }

        if (changed) persistSettings();

        return sendJSON(res, 200, { ok:true, changed, saved:{ autoTrading, investmentAmountUSDT, defaultLeverage } });
      }

      // 연결 (키/시크릿/네트워크 유연 파싱) — 연결과 동시에 계정/포지션 리턴
      if (pathname === '/api/connect' && req.method === 'POST') {
        const b = await parseBody(req);
        const apiKey = String(b.apiKey || b.key || '').trim();
        const apiSecret = String(b.apiSecret || b.secret || '').trim();
        const networkRaw = (b.network || '').toString().toLowerCase();
        const isTestnet = typeof b.isTestnet !== 'undefined' ? !!b.isTestnet
          : typeof b.testnet !== 'undefined' ? !!b.testnet
          : (networkRaw ? networkRaw === 'testnet' : GATEIO_TESTNET);

        if (!apiKey || !apiSecret) return sendJSON(res, 400, { ok:false, message:'API credentials required' });

        GATEIO_API_KEY = apiKey; GATEIO_API_SECRET = apiSecret; GATEIO_TESTNET = !!isTestnet;
        isConnected = true;

        // 최초 한 번 시각 동기화
        await syncGateTime();

        try {
          const accounts = await getAllAccountInfo();
          const positions = await getPositions();
          logMultiple('✅ API 연결 성공', {
            network: GATEIO_TESTNET ? 'testnet' : 'mainnet',
            estTotal: `${accounts.totalEstimatedValue.toFixed(2)} USDT`,
            positions: positions.length
          });
          return sendJSON(res, 200, {
            ok:true, message:'API 연결 성공',
            network: GATEIO_TESTNET ? 'testnet' : 'mainnet',
            accounts, positions
          });
        } catch (error) {
          // 자금 없음 등은 연결 성공 처리 + 안내
          if (/please transfer funds/i.test(error.message) || /insufficient|not enough/i.test(error.message)) {
            const empty = { futures:{ total:0, available:0, positionMargin:0, orderMargin:0, unrealisedPnl:0, currency:'USDT' },
                            spot:[], margin:[], options:null, totalEstimatedValue:0 };
            logMultiple('✅ API 연결 성공(선물 자금 없음)', { network: GATEIO_TESTNET ? 'testnet' : 'mainnet' });
            return sendJSON(res, 200, {
              ok:true, message:'API 연결 성공',
              network: GATEIO_TESTNET ? 'testnet' : 'mainnet',
              accounts: empty, positions: [],
              warning: '선물 계정에 자금이 없습니다. 현물→선물로 자금을 이체해주세요.'
            });
          }
          isConnected = false;
          logMultiple('❌ API 연결 실패', { error: error.message });
          return sendJSON(res, 200, { ok:false, message:'API 키가 잘못되었습니다', error: error.message });
        }
      }

      // 전체 계정 조회
      if (pathname === '/api/accounts/all' && req.method === 'GET') {
        try {
          const accounts = await getAllAccountInfo();
          return sendJSON(res, 200, accounts);
        } catch (error) {
          return sendJSON(res, 500, { error: error.message });
        }
      }

      // 포지션 조회
      if (pathname === '/api/positions' && req.method === 'GET') {
        try {
          const positions = await getPositions();
          return sendJSON(res, 200, { positions });
        } catch (error) {
          return sendJSON(res, 500, { error: error.message });
        }
      }

      // 포지션 전체 청산(마켓)
      if (pathname === '/api/positions/close' && req.method === 'POST') {
        const body = await parseBody(req);
        try {
          const result = await closePosition(String(body.contract || body.symbol || ''));
          return sendJSON(res, 200, { ok:true, result });
        } catch (error) {
          return sendJSON(res, 500, { ok:false, error: error.message });
        }
      }

      // 웹훅 신호 로그 조회
      if (pathname === '/api/webhook/signals' && req.method === 'GET') {
        const id = (query.id && String(query.id)) || 'default';
        const arr = webhookSignals[id] || [];
        return sendJSON(res, 200, { id, signals: arr.slice(-50) });
      }

      return sendJSON(res, 404, { error:'API not found' });
    }

    // ---------- WEBHOOK ----------
    async function handleWebhook(webhookId, raw) {
      const n = normalizeTradingView(raw);
      if (!webhookSignals[webhookId]) webhookSignals[webhookId] = [];

      const usedLeverage = Number(n.leverage) || defaultLeverage;
      let usedContracts = Number(n.size);

      if (n.action === 'open' && (!usedContracts || !isFinite(usedContracts))) {
        if (!n.symbol) {
          const entry0 = { id: Date.now().toString(36), timestamp: new Date().toISOString(), ...n, status:'invalid' };
          webhookSignals[webhookId].push(entry0);
          return { ok:true, stored:true };
        }
        usedContracts = await usdtToContracts(n.symbol, investmentAmountUSDT, usedLeverage);
      }

      const entry = {
        id: Date.now().toString(36), timestamp: new Date().toISOString(),
        action:n.action, side:n.side, symbol:n.symbol, size:usedContracts, leverage:usedLeverage,
        status:'pending', raw:n.raw
      };
      webhookSignals[webhookId].push(entry);
      if (webhookSignals[webhookId].length > 200) webhookSignals[webhookId] = webhookSignals[webhookId].slice(-200);

      logMultiple(`📡 웹훅 수신 [${webhookId}]`, formatWebhookSignalForLog(entry));

      const okToTrade = entry.symbol && (entry.action==='close' || (entry.action==='open' && (entry.side==='long'||entry.side==='short')));
      const hasCredentials = !!(GATEIO_API_KEY && GATEIO_API_SECRET);

      if (!okToTrade) {
        entry.status = 'invalid';
        return { ok:true, stored:true, reason:'invalid_signal' };
      }

      if (!hasCredentials) {
        entry.status = 'no_api';
        logMultiple('API ????? ?? ??', formatWebhookSignalForLog(entry));
        return { ok:false, processed:false, error:'missing_api_credentials' };
      }

      if (!autoTrading) {
        entry.status = 'disabled';
        logMultiple('???? ??? - ??? ??', formatWebhookSignalForLog(entry));
        return { ok:true, stored:true, autoTrading:false };
      }

      entry.status = 'stored';

      try {
        if (entry.action === 'open') {
          if (entry.leverage && entry.leverage > 1) await setLeverage(entry.symbol, entry.leverage);
          const result = await placeOpenOrder(entry.symbol, entry.side, entry.size);
          entry.status = 'executed';
          logMultiple('?? ?? ?? ??', { symbol: entry.symbol, side: entry.side, size: entry.size, leverage: entry.leverage });
          return { ok:true, processed:true, result };
        } else {
          const result = await closePosition(entry.symbol);
          entry.status = 'executed';
          logMultiple('??? ?? ?? ??', { symbol: entry.symbol });
          return { ok:true, processed:true, result };
        }
      } catch (e) {
        entry.status = 'failed';
        logMultiple('?? ?? ??', { error:(e && e.message) || String(e), symbol: entry.symbol, action: entry.action, side: entry.side });
        return { ok:false, processed:false, error:(e && e.message) || String(e) };
      }

      return { ok:true, stored:true };
    }

    if (pathname === '/webhook' && req.method === 'POST') {
      const raw = await parseBody(req);
      const out = await handleWebhook('default', raw);
      return sendJSON(res, 200, out);
    }
    if (pathname.startsWith('/webhook/') && req.method === 'POST') {
      const id = pathname.split('/')[2] || 'default';
      const raw = await parseBody(req);
      const out = await handleWebhook(id, raw);
      return sendJSON(res, 200, out);
    }

    // ---------- STATIC ----------
    let fp = pathname === '/' ? join(DIST_DIR, 'index.html') : join(DIST_DIR, pathname);
    if (!existsSync(fp)) fp = join(DIST_DIR, 'index.html');
    if (!existsSync(fp)) { res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); res.end('File not found'); return; }
    const ct = mime[extname(fp)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
    res.end(readFileSync(fp));
  } catch (e) {
    logMultiple('서버 에러', { error: (e && e.message) || String(e) });
    res.writeHead(500, { 'Content-Type':'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  logMultiple('🚀 서버 시작', { port: PORT, apiConfigured: !!(GATEIO_API_KEY && GATEIO_API_SECRET), network: GATEIO_TESTNET ? 'testnet' : 'mainnet' });
});

// 종료 처리
process.on('SIGTERM', () => { logMultiple('서버 종료 중 (SIGTERM)'); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { logMultiple('서버 종료 중 (SIGINT)'); server.close(() => process.exit(0)); });
