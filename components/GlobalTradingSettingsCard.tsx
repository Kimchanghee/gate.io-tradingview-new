import React, { useEffect, useMemo, useState } from 'react';

type Signal = {
  id: string;
  timestamp: string;
  action?: 'open' | 'close';
  side?: 'long' | 'short';
  symbol?: string;
  size?: number;     // 서버에서 USDT→계약 변환 후 저장
  leverage?: number;
  status: 'pending' | 'executed' | 'failed' | 'stored' | 'invalid';
};

type Lang = 'ko' | 'en' | 'ja';
const i18n: Record<Lang, Record<string, string>> = {
  ko: { title:'웹훅 신호', none:'아직 수신된 신호가 없습니다.', save:'저장', auto:'자동거래', refreshing:'새로고침…', autoR:'자동 새로고침' },
  en: { title:'Webhook Signals', none:'No signals received yet.', save:'Save', auto:'Auto Trading', refreshing:'Refreshing…', autoR:'Auto Refresh' },
  ja: { title:'Webhook シグナル', none:'まだシグナルは受信されていません。', save:'保存', auto:'自動取引', refreshing:'更新中…', autoR:'自動更新' },
};

function toLocal(iso: string, lang: Lang) {
  const locales = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' } as const;
  try { return new Date(iso).toLocaleString(locales[lang], { hour12:false }); } catch { return iso; }
}
function base(sym?: string) {
  return (sym || '').toUpperCase().replace(/[_/-]USDT$/,'').replace(/USDT$/,'');
}

const GlobalTradingSettingsCard: React.FC = () => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [pollMs, setPollMs] = useState(3000);
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('ui_lang') as Lang) || 'ko');

  const [amount, setAmount] = useState<number>(() => Number(localStorage.getItem('inv_usdt') || 100));
  const [lev, setLev] = useState<number>(() => Number(localStorage.getItem('inv_lev') || 10));
  const [auto, setAuto] = useState<boolean>(() => localStorage.getItem('autotrade') === '1');

  const t = useMemo(() => i18n[lang], [lang]);

  const saveSettings = async () => {
    localStorage.setItem('inv_usdt', String(amount));
    localStorage.setItem('inv_lev', String(lev));
    localStorage.setItem('autotrade', auto ? '1' : '0');
    await fetch('/api/settings', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ autoTrading: auto, investmentAmountUSDT: amount, defaultLeverage: lev })
    });
  };

  useEffect(() => { localStorage.setItem('ui_lang', lang); }, [lang]);

  useEffect(() => {
    let webhookId = localStorage.getItem('webhook_id');
    if (!webhookId) {
      webhookId = 'wh_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
      localStorage.setItem('webhook_id', webhookId);
    }
    const tick = async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/webhook/signals?id=${encodeURIComponent(webhookId!)}`);
        if (!r.ok) throw new Error();
        const data = await r.json();
        setSignals(Array.isArray(data.signals) ? data.signals : []);
      } catch {}
      setLoading(false);
    };
    tick();
    const tm = setInterval(tick, pollMs);
    return () => clearInterval(tm);
  }, [pollMs]);

  return (
    <div className="rounded-lg border border-gray-700 p-4 space-y-4">
      {/* 설정 폼 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs opacity-70 mb-1">Amount (USDT)</label>
          <input type="number" min={1} step={1} value={amount}
            onChange={e=>setAmount(Number(e.target.value))}
            className="w-full bg-slate-900 border border-gate-border rounded px-2 py-1"/>
        </div>
        <div>
          <label className="block text-xs opacity-70 mb-1">Leverage (x)</label>
          <input type="number" min={1} step={1} value={lev}
            onChange={e=>setLev(Number(e.target.value))}
            className="w-full bg-slate-900 border border-gate-border rounded px-2 py-1"/>
        </div>
        <label className="flex items-end gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)} />
          {t.auto}
        </label>
        <div className="flex items-end">
          <button onClick={saveSettings} className="px-3 py-2 bg-gate-primary text-black rounded font-semibold hover:bg-green-500">
            {t.save}
          </button>
        </div>
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gate-text-secondary">{loading ? t.refreshing : t.autoR}</span>
        <select className="bg-slate-900 border border-gate-border rounded px-2 py-1" value={pollMs} onChange={e=>setPollMs(Number(e.target.value))}>
          <option value={3000}>3s</option><option value={5000}>5s</option><option value={10000}>10s</option><option value={30000}>30s</option>
        </select>
        <select className="bg-slate-900 border border-gate-border rounded px-2 py-1 ml-auto" value={lang} onChange={e=>setLang(e.target.value as Lang)}>
          <option value="ko">한국어</option><option value="en">English</option><option value="ja">日本語</option>
        </select>
      </div>

      {/* 신호 리스트 */}
      <div>
        <div className="font-semibold mb-2">{t.title} ({signals.length})</div>
        {signals.length === 0 ? (
          <div className="text-sm text-gray-500">{t.none}</div>
        ) : (
          <ul className="space-y-2">
            {[...signals].slice(-20).reverse().map((s) => (
              <li key={s.id} className="text-sm bg-black/30 border border-gray-700 rounded p-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs opacity-75">{toLocal(s.timestamp, lang)}</span>
                  <span className={`px-2 py-0.5 rounded text-white text-xs ${
                    s.status === 'executed' ? 'bg-green-600' :
                    s.status === 'failed' ? 'bg-red-600' :
                    s.status === 'invalid' ? 'bg-yellow-600' : 'bg-gray-600'
                  }`}>{s.status}</span>
                </div>
                <div className="mt-1">
                  {/* 예: "ETH • long • size=123 • lev=10x" */}
                  <b>{base(s.symbol) || s.symbol}</b>
                  {s.side ? ` • ${s.side}` : ''}{typeof s.size === 'number' ? ` • size=${s.size}` : ''}{typeof s.leverage === 'number' ? ` • lev=${s.leverage}x` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default GlobalTradingSettingsCard;
