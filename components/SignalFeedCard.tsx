import React, { useEffect, useMemo, useState } from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';

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

type SignalError = 'none' | 'forbidden' | 'generic';

const SignalFeedCard: React.FC = () => {
  const { state, translate } = useAppContext();
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [error, setError] = useState<SignalError>('none');

  const uid = state.user.uid;
  const accessKey = state.user.accessKey || '';
  const uidReady = state.user.isLoggedIn;
  const isApproved = state.user.status === 'approved';
  const allowedStrategies = useMemo(() => state.user.approvedStrategies || [], [state.user.approvedStrategies]);

  useEffect(() => {
    if (!uid || !accessKey || !isApproved) {
      setSignals([]);
      setError('none');
      return;
    }
    let stopped = false;
    const fetchSignals = async () => {
      try {
        const url = `/api/user/signals?uid=${encodeURIComponent(uid)}&key=${encodeURIComponent(accessKey)}`;
        const res = await fetch(url);
        if (res.status === 403) {
          if (!stopped) setError('forbidden');
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
        if (!stopped) setError('generic');
      }
    };
    fetchSignals();
    const id = window.setInterval(fetchSignals, 6000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [uid, accessKey, isApproved]);

  const errorMessage = error === 'forbidden'
    ? translate('signalErrorForbidden')
    : error === 'generic'
      ? translate('signalErrorGeneric')
      : '';

  return (
    <Card title={translate('signalFeedTitle')} className="mb-5">
      <div className="space-y-3 text-sm">
        {!uidReady && (
          <div className="text-gray-400">{translate('signalLoginRequired')}</div>
        )}

        {uidReady && state.user.status === 'pending' && (
          <div className="text-yellow-200">{translate('signalPendingMessage')}</div>
        )}

        {state.user.status === 'denied' && (
          <div className="text-red-300">{translate('signalDeniedMessage')}</div>
        )}

        <div className="text-xs text-gray-400 uppercase tracking-wider">
          {translate('signalStrategiesTitle')}
        </div>
        {allowedStrategies.length > 0 ? (
          <ul className="text-xs text-gray-300 list-disc list-inside space-y-1">
            {allowedStrategies.map((strategy) => (
              <li key={strategy.id}>{strategy.name}</li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-gray-500">{translate('signalNoStrategies')}</div>
        )}

        {errorMessage && <div className="text-xs text-red-400">{errorMessage}</div>}

        {uidReady && accessKey && isApproved && (
          <div className="max-h-72 overflow-y-auto space-y-2 text-sm">
            {signals.length === 0 ? (
              <div className="text-gray-500">{translate('signalEmpty')}</div>
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
      </div>
    </Card>
  );
};

export default SignalFeedCard;
