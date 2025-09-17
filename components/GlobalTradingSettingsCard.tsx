import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';



type SignalStatus = 'pending' | 'executed' | 'failed' | 'stored' | 'invalid' | 'disabled' | 'no_api';



type Signal = {

  id: string;

  timestamp: string;

  action?: 'open' | 'close';

  side?: 'long' | 'short';

  symbol?: string;

  size?: number;

  leverage?: number;

  status: SignalStatus;

};



type Lang = 'ko' | 'en' | 'ja';



const LOCALE_MAP: Record<Lang, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' };



const i18n: Record<Lang, Record<string, string>> = {

  ko: {

    title: '웹훅 신호',

    none: '아직 수신된 신호가 없습니다.',

    save: '즉시 적용',

    syncing: '동기화 중...',

    auto: '自動取引',

    refreshing: '데이터 새로고침 중...',

    autoR: '자동 갱신',

    summary: '코인별 요약',

    lastSignals: '최근 5개 신호',

    totalSignals: '누적 신호',

    distinctSymbols: '거래 코인 수',

    lastUpdated: '마지막 갱신',

    autoDisabled: '자동거래가 꺼져 있어 신호만 저장됩니다.',

    autoEnabled: '자동거래가 활성화되어 있습니다.',

    tableTitle: '최근 신호 타임라인',

    columnTime: '時間',

    columnSymbol: '심볼',

    columnAction: '액션',

    columnSide: '方向',

    columnSize: '계약수',

    columnLeverage: '레버리지',

    columnStatus: '상태',

    sizeLabel: '계약수',

    leverageLabel: '레버리지',

    sideLabel: '方向',

    actionLabel: '액션',

    webhookId: '웹훅 ID',

    autoRefreshEvery: '갱신 주기',

    symbolUnknown: '未設定'

  },

  en: {

    title: 'Webhook Signals',

    none: 'No signals have been received yet.',

    save: 'Apply Now',

    syncing: 'Syncing...',

    auto: 'Auto Trading',

    refreshing: 'Refreshing...',

    autoR: 'Auto refresh',

    summary: 'Symbol Summary',

    lastSignals: 'Last 5 signals',

    totalSignals: 'Total signals',

    distinctSymbols: 'Symbols tracked',

    lastUpdated: 'Last update',

    autoDisabled: 'Auto trading is disabled; signals are stored only.',

    autoEnabled: 'Auto trading is active.',

    tableTitle: 'Latest Signal Timeline',

    columnTime: 'Time',

    columnSymbol: 'Symbol',

    columnAction: 'Action',

    columnSide: 'Side',

    columnSize: 'Size',

    columnLeverage: 'Leverage',

    columnStatus: 'Status',

    sizeLabel: 'Size',

    leverageLabel: 'Leverage',

    sideLabel: 'Side',

    actionLabel: 'Action',

    webhookId: 'Webhook ID',

    autoRefreshEvery: 'Refresh interval',

    symbolUnknown: 'Unknown'

  },

  ja: {

    title: 'Webhook シグナル',

    none: 'まだシグナルは受信されていません。',

    save: 'すぐ反映',

    syncing: '同期中...',

    auto: '自動取引',

    refreshing: '更新中...',

    autoR: '自動更新',

    summary: '銘柄サマリー',

    lastSignals: '直近5件のシグナル',

    totalSignals: '累計シグナル',

    distinctSymbols: '対象銘柄数',

    lastUpdated: '最終更新',

    autoDisabled: '自動取引が無効のためシグナルのみ保存されます。',

    autoEnabled: '自動取引が有効です。',

    tableTitle: '直近シグナルタイムライン',

    columnTime: '時間',

    columnSymbol: 'シンボル',

    columnAction: 'アクション',

    columnSide: '方向',

    columnSize: '数量',

    columnLeverage: 'レバレッジ',

    columnStatus: 'ステータス',

    sizeLabel: '数量',

    leverageLabel: 'レバレッジ',

    sideLabel: '方向',

    actionLabel: 'アクション',

    webhookId: 'Webhook ID',

    autoRefreshEvery: '更新間隔',

    symbolUnknown: '未設定'

  }

};



const STATUS_LABELS: Record<Lang, Record<SignalStatus, string>> = {

  ko: {

    executed: '체결',

    failed: '실패',

    stored: '대기',

    pending: '대기',

    invalid: '무효',

    disabled: '자동 OFF',

    no_api: 'API 없음'

  },

  en: {

    executed: 'Executed',

    failed: 'Failed',

    stored: 'Queued',

    pending: 'Pending',

    invalid: 'Invalid',

    disabled: 'Auto Off',

    no_api: 'No API'

  },

  ja: {

    executed: '체결',

    failed: '실패',

    stored: '대기',

    pending: '대기',

    invalid: '무효',

    disabled: '自動OFF',

    no_api: 'API未設定'

  }

};



const ACTION_LABELS: Record<Lang, Record<'open' | 'close', string>> = {

  ko: { open: '진입', close: '청산' },

  en: { open: 'Open', close: 'Close' },

  ja: { open: 'エントリー', close: 'クローズ' }

};



const SIDE_LABELS: Record<Lang, Record<'long' | 'short', string>> = {

  ko: { long: '롱', short: '숏' },

  en: { long: 'Long', short: 'Short' },

  ja: { long: 'ロング', short: 'ショート' }

};



const STATUS_CLASS: Record<SignalStatus, string> = {

  executed: 'bg-green-600 text-white',

  failed: 'bg-red-600 text-white',

  stored: 'bg-slate-600 text-white',

  pending: 'bg-slate-500 text-white',

  invalid: 'bg-yellow-600 text-black',

  disabled: 'bg-orange-500 text-white',

  no_api: 'bg-purple-600 text-white'

};



function toLocal(iso: string | undefined, lang: Lang, options?: Intl.DateTimeFormatOptions) {

  if (!iso) return '-';

  try {

    return new Date(iso).toLocaleString(LOCALE_MAP[lang], { hour12: false, ...options });

  } catch {

    return iso;

  }

}



function baseSymbol(sym?: string) {

  if (!sym) return '';

  return sym.toUpperCase().replace(/[_/-]USDT$/, '').replace(/USDT$/, '');

}



function formatNumber(value: number | undefined, lang: Lang, fractionDigits = 2) {

  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';

  try {

    return new Intl.NumberFormat(LOCALE_MAP[lang], {

      minimumFractionDigits: 0,

      maximumFractionDigits: fractionDigits

    }).format(value);

  } catch {

    return value.toString();

  }

}



const GlobalTradingSettingsCard: React.FC = () => {

  const initialAmount = () => {

    if (typeof window === 'undefined') return 100;

    const stored = Number(window.localStorage.getItem('inv_usdt'));

    return Number.isFinite(stored) && stored > 0 ? stored : 100;

  };

  const initialLev = () => {

    if (typeof window === 'undefined') return 10;

    const stored = Number(window.localStorage.getItem('inv_lev'));

    return Number.isFinite(stored) && stored >= 1 ? stored : 10;

  };

  const initialAuto = () => {

    if (typeof window === 'undefined') return false;

    return window.localStorage.getItem('autotrade') === '1';

  };

  const initialLang = () => {

    if (typeof window === 'undefined') return 'ko';

    const stored = window.localStorage.getItem('ui_lang') as Lang | null;

    return stored && ['ko', 'en', 'ja'].includes(stored) ? stored : 'ko';

  };



  const [signals, setSignals] = useState<Signal[]>([]);

  const [loading, setLoading] = useState(false);

  const [pollMs, setPollMs] = useState(3000);

  const [lang, setLang] = useState<Lang>(initialLang);

  const [amount, setAmount] = useState<number>(initialAmount);

  const [lev, setLev] = useState<number>(initialLev);

  const [auto, setAuto] = useState<boolean>(initialAuto);

  const [hydrated, setHydrated] = useState(false);

  const [isSyncingSettings, setIsSyncingSettings] = useState(false);

  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [webhookId, setWebhookId] = useState<string>('');



  const syncTimeoutRef = useRef<number | null>(null);

  const syncInFlightRef = useRef(0);



  const t = useMemo(() => i18n[lang], [lang]);



  useEffect(() => {

    if (typeof window === 'undefined') return;

    window.localStorage.setItem('ui_lang', lang);

  }, [lang]);



  useEffect(() => {

    const loadSettings = async () => {

      try {

        const res = await fetch('/api/settings');

        if (!res.ok) return;

        const data = await res.json();

        if (typeof data.investmentAmountUSDT !== 'undefined') {

          const num = Number(data.investmentAmountUSDT);

          if (Number.isFinite(num) && num > 0) {

            setAmount(num);

            if (typeof window !== 'undefined') {

              window.localStorage.setItem('inv_usdt', String(num));

            }

          }

        }

        if (typeof data.defaultLeverage !== 'undefined') {

          const num = Number(data.defaultLeverage);

          if (Number.isFinite(num) && num >= 1) {

            setLev(num);

            if (typeof window !== 'undefined') {

              window.localStorage.setItem('inv_lev', String(num));

            }

          }

        }

        if (typeof data.autoTrading !== 'undefined') {

          const nextAuto = Boolean(data.autoTrading);

          setAuto(nextAuto);

          if (typeof window !== 'undefined') {

            window.localStorage.setItem('autotrade', nextAuto ? '1' : '0');

          }

        }

      } catch (error) {

        console.error('Failed to load trading settings', error);

      } finally {

        setHydrated(true);

      }

    };

    loadSettings();

  }, []);



  const pushSettings = useCallback(async () => {

    if (!hydrated) return;

    syncInFlightRef.current += 1;

    setIsSyncingSettings(true);

    try {

      await fetch('/api/settings', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          autoTrading: auto,

          investmentAmountUSDT: amount,

          defaultLeverage: lev

        })

      });

    } catch (error) {

      console.error('Failed to sync trading settings', error);

    } finally {

      syncInFlightRef.current = Math.max(0, syncInFlightRef.current - 1);

      if (syncInFlightRef.current === 0) {

        setIsSyncingSettings(false);

      }

    }

  }, [hydrated, auto, amount, lev]);



  useEffect(() => {

    if (!hydrated) return;

    if (typeof window !== 'undefined') {

      window.localStorage.setItem('inv_usdt', String(amount));

      window.localStorage.setItem('inv_lev', String(lev));

      window.localStorage.setItem('autotrade', auto ? '1' : '0');

    }

    if (syncTimeoutRef.current) {

      window.clearTimeout(syncTimeoutRef.current);

    }

    syncTimeoutRef.current = window.setTimeout(() => {

      pushSettings();

      syncTimeoutRef.current = null;

    }, 400);



    return () => {

      if (syncTimeoutRef.current) {

        window.clearTimeout(syncTimeoutRef.current);

        syncTimeoutRef.current = null;

      }

    };

  }, [amount, lev, auto, hydrated, pushSettings]);



  const handleApplyClick = useCallback(() => {

    if (syncTimeoutRef.current) {

      window.clearTimeout(syncTimeoutRef.current);

      syncTimeoutRef.current = null;

    }

    void pushSettings();

  }, [pushSettings]);



  useEffect(() => {

    let active = true;

    let intervalId: number;



    const ensureWebhookId = () => {

      if (typeof window === 'undefined') return '';

      let stored = window.localStorage.getItem('webhook_id');

      if (!stored) {

        stored = 'wh_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);

        window.localStorage.setItem('webhook_id', stored);

      }

      setWebhookId(stored);

      return stored;

    };



    const id = ensureWebhookId();



    const fetchSignals = async () => {

      setLoading(true);

      try {

        const response = await fetch(`/api/webhook/signals?id=${encodeURIComponent(id)}`);

        if (!response.ok) throw new Error('failed to fetch signals');

        const data = await response.json();

        if (!active) return;

        const list = Array.isArray(data.signals) ? data.signals : [];

        setSignals(list);

        setLastUpdated(new Date().toISOString());

      } catch (error) {

        console.error('Failed to load webhook signals', error);

      } finally {

        if (active) setLoading(false);

      }

    };



    fetchSignals();

    intervalId = window.setInterval(fetchSignals, pollMs);



    return () => {

      active = false;

      window.clearInterval(intervalId);

    };

  }, [pollMs]);



  const groupedSignals = useMemo(() => {

    const map = new Map<string, Signal[]>();

    signals.forEach((signal) => {

      const key = (signal.symbol || 'UNKNOWN').toUpperCase();

      if (!map.has(key)) {

        map.set(key, []);

      }

      map.get(key)!.push(signal);

    });



    return Array.from(map.entries()).map(([symbol, list]) => {

      const sorted = [...list].sort((a, b) => {

        const va = Date.parse(a.timestamp);

        const vb = Date.parse(b.timestamp);

        if (!Number.isFinite(vb) && !Number.isFinite(va)) return 0;

        if (!Number.isFinite(va)) return -1;

        if (!Number.isFinite(vb)) return 1;

        return va - vb;

      });

      const latest = sorted[sorted.length - 1];

      const lastFive = sorted.slice(-5).reverse();

      const totals: Record<SignalStatus, number> = {

        pending: 0,

        executed: 0,

        failed: 0,

        stored: 0,

        invalid: 0,

        disabled: 0,

        no_api: 0

      };

      sorted.forEach((item) => {

        totals[item.status] += 1;

      });

      const latestTs = latest ? Date.parse(latest.timestamp) : 0;

      return {

        symbol,

        latest,

        lastFive,

        totals,

        total: sorted.length,

        latestTs

      };

    }).sort((a, b) => b.latestTs - a.latestTs);

  }, [signals]);



  const recentSignals = useMemo(() => {

    return [...signals].slice(-10).reverse();

  }, [signals]);



  const statusOrder: SignalStatus[] = ['executed', 'failed', 'stored', 'pending', 'disabled', 'no_api', 'invalid'];



  const autoNotice = auto ? t.autoEnabled : t.autoDisabled;

  const lastUpdatedText = lastUpdated ? toLocal(lastUpdated, lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';



  const formatSignalSummary = useCallback((signal: Signal) => {

    const parts: string[] = [];

    if (signal.action) parts.push(ACTION_LABELS[lang][signal.action]);

    if (signal.side) parts.push(SIDE_LABELS[lang][signal.side]);

    if (typeof signal.size === 'number') parts.push(`${t.sizeLabel}: ${formatNumber(Math.abs(signal.size), lang)}`);

    if (typeof signal.leverage === 'number') parts.push(`${t.leverageLabel}: ${signal.leverage}x`);

    return parts.length ? parts.join(' ? ') : STATUS_LABELS[lang][signal.status];

  }, [lang, t.sizeLabel, t.leverageLabel]);



  const formatSideLabel = useCallback((side?: 'long' | 'short') => {

    return side ? SIDE_LABELS[lang][side] : '-';

  }, [lang]);



  const formatActionLabel = useCallback((action?: 'open' | 'close') => {

    return action ? ACTION_LABELS[lang][action] : '-';

  }, [lang]);



  return (

    <div className="rounded-lg border border-gray-700 p-4 space-y-4">

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">

        <div>

          <label className="block text-xs opacity-70 mb-1">Amount (USDT)</label>

          <input

            type="number"

            min={1}

            step={1}

            value={amount}

            onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))}

            className="w-full bg-slate-900 border border-gate-border rounded px-2 py-1"

          />

        </div>

        <div>

          <label className="block text-xs opacity-70 mb-1">Leverage (x)</label>

          <input

            type="number"

            min={1}

            step={1}

            value={lev}

            onChange={(e) => setLev(Math.max(1, Number(e.target.value)))}

            className="w-full bg-slate-900 border border-gate-border rounded px-2 py-1"

          />

        </div>

        <label className="flex items-end gap-2 text-sm">

          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />

          {t.auto}

        </label>

        <div className="flex items-end gap-2">

          <button

            type="button"

            onClick={handleApplyClick}

            disabled={isSyncingSettings}

            className="px-3 py-2 bg-gate-primary text-black rounded font-semibold hover:bg-green-500 transition-colors disabled:opacity-60"

          >

            {isSyncingSettings ? t.syncing : t.save}

          </button>

          <select

            className="bg-slate-900 border border-gate-border rounded px-2 py-1 text-xs ml-auto md:ml-0"

            value={lang}

            onChange={(e) => setLang(e.target.value as Lang)}

          >

            <option value="ko">???</option>

            <option value="en">English</option>

            <option value="ja">???</option>

          </select>

        </div>

      </div>



      <div className="flex flex-wrap items-center gap-3 text-xs">

        <span className="flex items-center gap-1 text-gate-text-secondary">

          <span className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />

          {loading ? t.refreshing : t.autoR}

        </span>

        <span className="text-gate-text-secondary">

          {t.autoRefreshEvery}: {pollMs / 1000}s

        </span>

        <select

          className="bg-slate-900 border border-gate-border rounded px-2 py-1"

          value={pollMs}

          onChange={(e) => setPollMs(Number(e.target.value))}

        >

          <option value={3000}>3s</option>

          <option value={5000}>5s</option>

          <option value={10000}>10s</option>

          <option value={30000}>30s</option>

        </select>

        <span className="text-gate-text-secondary">

          {t.lastUpdated}: <span className="text-gate-text">{lastUpdatedText}</span>

        </span>

        {webhookId && (

          <span className="text-gate-text-secondary flex items-center gap-1">

            {t.webhookId}:

            <span className="font-mono text-gate-text bg-black/40 border border-gray-700 rounded px-2 py-0.5">{webhookId}</span>

          </span>

        )}

        <span className="ml-auto text-gate-text-secondary">{autoNotice}</span>

      </div>



      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-gate-text">

        <div className="bg-black/40 border border-gray-700 rounded-lg px-3 py-2">

          <div className="text-gate-text-secondary">{t.totalSignals}</div>

          <div className="text-lg font-semibold">{signals.length}</div>

        </div>

        <div className="bg-black/40 border border-gray-700 rounded-lg px-3 py-2">

          <div className="text-gate-text-secondary">{t.distinctSymbols}</div>

          <div className="text-lg font-semibold">{groupedSignals.length}</div>

        </div>

        <div className="bg-black/40 border border-gray-700 rounded-lg px-3 py-2">

          <div className="text-gate-text-secondary">{t.lastSignals}</div>

          <div className="text-lg font-semibold">{Math.min(recentSignals.length, 10)}</div>

        </div>

        <div className="bg-black/40 border border-gray-700 rounded-lg px-3 py-2">

          <div className="text-gate-text-secondary">{t.auto}</div>

          <div className={`text-lg font-semibold ${auto ? 'text-green-400' : 'text-yellow-400'}`}>{auto ? 'ON' : 'OFF'}</div>

        </div>

      </div>



      <div>

        <div className="font-semibold mb-2 text-sm">{t.summary}</div>

        {groupedSignals.length === 0 ? (

          <div className="text-sm text-gray-500">{t.none}</div>

        ) : (

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

            {groupedSignals.map((group) => (

              <div key={group.symbol} className="bg-black/40 border border-gray-700 rounded-lg p-3 space-y-3">

                <div className="flex flex-col gap-1">

                  <div className="flex items-start justify-between gap-3">

                    <div>

                      <div className="text-sm font-semibold">{baseSymbol(group.symbol) || t.symbolUnknown}</div>

                      <div className="text-[11px] text-gate-text-secondary">

                        {toLocal(group.latest?.timestamp, lang, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}

                      </div>

                    </div>

                    <div className="flex flex-wrap justify-end gap-1">

                      {statusOrder.filter((status) => group.totals[status] > 0).map((status) => (

                        <span key={status} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CLASS[status]}`}>

                          {STATUS_LABELS[lang][status]} {group.totals[status]}

                        </span>

                      ))}

                    </div>

                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-gate-text-secondary">

                    <div>

                      {t.totalSignals}: <span className="text-gate-text font-semibold">{group.total}</span>

                    </div>

                    <div>

                      {t.actionLabel}: <span className="text-gate-text">{formatActionLabel(group.latest?.action)}</span>

                    </div>

                    <div>

                      {t.sideLabel}: <span className="text-gate-text">{formatSideLabel(group.latest?.side)}</span>

                    </div>

                    <div>

                      {t.sizeLabel}: <span className="text-gate-text">{formatNumber(group.latest?.size, lang)}</span>

                    </div>

                    <div>

                      {t.leverageLabel}: <span className="text-gate-text">{typeof group.latest?.leverage === 'number' ? `${group.latest?.leverage}x` : '-'}</span>

                    </div>

                    <div>

                      {t.columnStatus}: <span className="text-gate-text">{group.latest ? STATUS_LABELS[lang][group.latest.status] : '-'}</span>

                    </div>

                  </div>

                </div>



                <div>

                  <div className="text-[11px] text-gate-text-secondary mb-1">{t.lastSignals}</div>

                  <ul className="space-y-1">

                    {group.lastFive.map((signal) => (

                      <li

                        key={signal.id}

                        className="grid grid-cols-[auto,1fr,auto] items-center gap-2 text-xs bg-black/40 border border-gray-700 rounded px-2 py-1"

                      >

                        <span className="font-mono text-[10px] text-gray-400">

                          {toLocal(signal.timestamp, lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}

                        </span>

                        <span className="text-gate-text truncate">{formatSignalSummary(signal)}</span>

                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CLASS[signal.status]}`}>

                          {STATUS_LABELS[lang][signal.status]}

                        </span>

                      </li>

                    ))}

                  </ul>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>



      <div>

        <div className="font-semibold mb-2 text-sm">{t.tableTitle}</div>

        {recentSignals.length === 0 ? (

          <div className="text-sm text-gray-500">{t.none}</div>

        ) : (

          <div className="overflow-x-auto">

            <table className="min-w-full text-xs border-separate border-spacing-y-1">

              <thead className="text-gate-text-secondary text-left">

                <tr>

                  <th className="px-2 py-1">{t.columnTime}</th>

                  <th className="px-2 py-1">{t.columnSymbol}</th>

                  <th className="px-2 py-1">{t.columnAction}</th>

                  <th className="px-2 py-1">{t.columnSide}</th>

                  <th className="px-2 py-1">{t.columnSize}</th>

                  <th className="px-2 py-1">{t.columnLeverage}</th>

                  <th className="px-2 py-1">{t.columnStatus}</th>

                </tr>

              </thead>

              <tbody>

                {recentSignals.map((signal) => (

                  <tr key={signal.id} className="bg-black/40 border border-gray-700 rounded-lg">

                    <td className="px-2 py-1 font-mono text-[10px] text-gray-400">

                      {toLocal(signal.timestamp, lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}

                    </td>

                    <td className="px-2 py-1 text-gate-text">{baseSymbol(signal.symbol) || t.symbolUnknown}</td>

                    <td className="px-2 py-1 text-gate-text">{formatActionLabel(signal.action)}</td>

                    <td className="px-2 py-1 text-gate-text">{formatSideLabel(signal.side)}</td>

                    <td className="px-2 py-1 text-gate-text">{formatNumber(signal.size, lang)}</td>

                    <td className="px-2 py-1 text-gate-text">

                      {typeof signal.leverage === 'number' ? `${signal.leverage}x` : '-'}

                    </td>

                    <td className="px-2 py-1">

                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CLASS[signal.status]}`}>

                        {STATUS_LABELS[lang][signal.status]}

                      </span>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>

  );

};



export default GlobalTradingSettingsCard;

