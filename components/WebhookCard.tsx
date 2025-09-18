import React from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';

const WebhookCard: React.FC = () => {
  const { state, translate } = useAppContext();

  const uidReady = state.user.isLoggedIn;
  const status = state.user.status;
  const allowedStrategies = state.user.approvedStrategies || [];

  const statusLabel = (() => {
    switch (status) {
      case 'approved':
        return translate('statusApproved');
      case 'pending':
        return translate('statusPending');
      case 'denied':
        return translate('statusDenied');
      case 'not_registered':
        return translate('statusNotRegistered');
      default:
        return status ? status : translate('statusUnknown');
    }
  })();

  return (
    <Card title={translate('webhookSettings')}>
      <div className="space-y-5 text-sm">
        <p className="text-gate-text-secondary">{translate('webhookBroadcastInfo')}</p>

        <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-black/20 px-3 py-2 text-xs text-gray-300">
          <span className="font-semibold text-gray-200">{translate('currentStatusLabel')}</span>
          <span>{statusLabel}</span>
        </div>

        {!uidReady && (
          <div className="text-xs text-red-300 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2">
            {translate('webhookLoginRequired')}
          </div>
        )}

        {uidReady && status === 'pending' && (
          <div className="text-xs text-yellow-200 bg-yellow-900/10 border border-yellow-500/30 rounded-lg px-3 py-2">
            {translate('webhookPendingNotice')}
          </div>
        )}

        {uidReady && status === 'denied' && (
          <div className="text-xs text-red-200 bg-red-900/30 border border-red-500/30 rounded-lg px-3 py-2">
            {translate('signalDeniedMessage')}
          </div>
        )}

        {uidReady && status === 'approved' && (
          <div className="text-xs text-green-200 bg-green-900/20 border border-green-500/40 rounded-lg px-3 py-2">
            {translate('webhookApprovedNotice')}
          </div>
        )}

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

        <p className="text-xs text-gray-500">{translate('webhookSelectionReminder')}</p>
      </div>
    </Card>
  );
};

export default WebhookCard;
