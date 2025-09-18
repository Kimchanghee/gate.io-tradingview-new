import React, { useEffect, useMemo, useState } from 'react';
import Card from './Card';

interface SignalItem {
  id: string;
  timestamp: string;
  action?: string;
  side?: string;
  symbol?: string;
  size?: number;
  leverage?: number;
  status?: string;
  strategyId?: string;
}

const SignalFeedCard: React.FC = () => {
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [error, setError] = useState('');
  const uid = useMemo(() => localStorage.getItem('user_uid') || '', []);
  const accessKey = useMemo(() => localStorage.getItem('user_access_key') || '', []);

  useEffect(() => {
    if (!uid || !accessKey) return;
    let stopped = false;
    const fetchSignals = async () => {
      try {
        const url = `/api/user/signals?uid=${encodeURIComponent(uid)}&key=${encodeURIComponent(accessKey)}`;
        const res = await fetch(url);
        if (res.status === 403) {
          if (!stopped) setError('접근 권한이 없습니다. 관리자 승인을 확인해주세요.');
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped && Array.isArray(data.signals) && data.signals.length) {
          setSignals((prev) => {
            const merged = [...data.signals.slice().reverse(), ...prev];
            return merged.slice(0, 100);
          });
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchSignals();
    const id = window.setInterval(fetchSignals, 6000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [uid, accessKey]);

  if (!uid) {
    return null;
  }

  return (
    <Card title="승인된 전략 신호" className="mb-5">
      {!accessKey && (
        <div className="text-sm text-gray-400">승인 대기 중입니다. 관리자가 승인을 완료하면 신호가 표시됩니다.</div>
      )}
      {error && <div className="text-sm text-red-400 mb-2">{error}</div>}
      {accessKey && (
        <div className="max-h-72 overflow-y-auto space-y-2 text-sm">
          {signals.length === 0 ? (
            <div className="text-gray-500">아직 수신된 신호가 없습니다.</div>
          ) : (
            signals.map((signal) => (
              <div key={signal.id} className="bg-black/40 border border-gray-700 rounded px-3 py-2">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{signal.strategyId || '-'}</span>
                  <span>{new Date(signal.timestamp).toLocaleString()}</span>
                </div>
                <div className="text-sm font-semibold text-gate-text">
                  {signal.symbol || '---'} ({signal.action} {signal.side})
                </div>
                <div className="text-xs text-gray-500">
                  size={signal.size ?? '-'} | leverage={signal.leverage ?? '-'} | status={signal.status}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
};

export default SignalFeedCard;
