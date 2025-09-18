import React, { useEffect, useMemo, useState } from 'react';
import Card from './Card';

const CopyIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 flex-shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const WebhookCard: React.FC = () => {
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

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <Card title="웹훅 설정">
      <div className="space-y-5">
        <div className="bg-gate-dark p-4 rounded-xl border border-gate-border">
          <p className="text-sm text-gate-text-secondary mb-4">TradingView Alert에서 사용할 URL:</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={WEBHOOK_URL}
              className="flex-1 p-2 bg-slate-900 border border-gate-border rounded-lg font-mono text-xs select-all"
            />
            <button
              onClick={copyToClipboard}
              className="p-2 bg-gate-primary text-gate-dark rounded-lg hover:bg-green-500 transition-colors text-xs font-bold flex items-center gap-1"
            >
              <CopyIcon /> {copied ? '복사됨' : '복사'}
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default WebhookCard;
