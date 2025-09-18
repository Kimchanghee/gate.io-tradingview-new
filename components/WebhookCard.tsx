import React, { useMemo, useState } from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const WebhookCard: React.FC = () => {
  const { state, translate } = useAppContext();
  const [copied, setCopied] = useState(false);

  const webhookId = useMemo(() => {
    let id = localStorage.getItem('webhook_id');
    if (!id) {
      id = 'wh_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
      localStorage.setItem('webhook_id', id);
    }
    return id;
  }, []);

  const WEBHOOK_URL = useMemo(() => `${window.location.origin}/webhook/${encodeURIComponent(webhookId)}`, [webhookId]);

  const uidReady = state.user.isLoggedIn;
  const isApproved = state.user.status === 'approved';
  const allowedStrategies = state.user.approvedStrategies || [];
  const disabled = !uidReady || !isApproved;

  const copyToClipboard = async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <Card title={translate('webhookSettings')}>
      <div className="space-y-5">
        <p className="text-sm text-gate-text-secondary">{translate('webhookIndicatorHint')}</p>

        {disabled && (
          <div
            className={`text-xs rounded-lg px-3 py-2 border ${
              uidReady
                ? 'text-yellow-200 bg-yellow-900/10 border-yellow-500/30'
                : 'text-red-300 bg-red-900/20 border-red-500/30'
            }`}
          >
            {uidReady ? translate('webhookPendingNotice') : translate('webhookLoginRequired')}
          </div>
        )}

        <div
          className={`bg-gate-dark p-4 rounded-xl border border-gate-border ${
            disabled ? 'opacity-60 pointer-events-none' : ''
          }`}
        >
          <p className="text-sm text-gate-text-secondary mb-4">{translate('webhookUrlDesc')}</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={WEBHOOK_URL}
              className="flex-1 p-2 bg-slate-900 border border-gate-border rounded-lg font-mono text-xs select-all"
            />
            <button
              onClick={copyToClipboard}
              disabled={disabled}
              className={`p-2 rounded-lg text-xs font-bold flex items-center gap-1 ${
                disabled
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gate-primary text-gate-dark hover:bg-green-500 transition-colors'
              }`}
            >
              <CopyIcon /> {copied ? translate('copied') : translate('copy')}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-gray-400 uppercase tracking-wider">
            {translate('webhookStrategiesTitle')}
          </div>
          {allowedStrategies.length > 0 ? (
            <ul className="text-xs text-gray-300 list-disc list-inside space-y-1">
              {allowedStrategies.map((strategy) => (
                <li key={strategy.id}>{strategy.name}</li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-gray-500">{translate('webhookNoStrategies')}</div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default WebhookCard;
