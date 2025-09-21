import React, { useEffect, useMemo, useState } from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';

interface NamedStrategy {
  id: string;
  name: string;
}

interface UserStatusResponse {
  status: 'not_registered' | 'pending' | 'approved' | 'denied' | string;
  requestedStrategies?: NamedStrategy[];
  approvedStrategies?: NamedStrategy[];
  accessKey?: string;
  autoTradingEnabled?: boolean;
}

const RegistrationCard: React.FC = () => {
  const { state, dispatch, translate } = useAppContext();
  const [uid, setUid] = useState(state.user.uid || '');
  const [statusInfo, setStatusInfo] = useState<UserStatusResponse | null>(null);
  const [message, setMessage] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  const activeUid = state.user.uid;

  const approvedStrategyNames = useMemo(() => {
    if (statusInfo?.approvedStrategies?.length) {
      return statusInfo.approvedStrategies.map((s) => s.name);
    }
    if (state.user.approvedStrategies?.length) {
      return state.user.approvedStrategies.map((s) => s.name);
    }
    return [];
  }, [statusInfo?.approvedStrategies, state.user.approvedStrategies]);

  useEffect(() => {
    setUid(state.user.uid || '');
  }, [state.user.uid]);

  useEffect(() => {
    if (!activeUid) return;
    let stopped = false;
    const poll = async () => {
      try {
        const url = `/api/user/status?uid=${encodeURIComponent(activeUid)}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data: UserStatusResponse = await res.json();
        if (!stopped) {
          setStatusInfo(data);
          dispatch({
            type: 'SET_USER',
            payload: {
              uid: activeUid,
              status: data.status,
              accessKey: data.accessKey ?? null,
              approvedStrategies: (data.approvedStrategies || []).map((item) => ({ id: item.id, name: item.name })),
              autoTradingEnabled: Boolean(data.autoTradingEnabled),
            },
          });
        }
      } catch (err) {
        console.error(err);
      }
    };
    poll();
    const id = window.setInterval(poll, 7000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [activeUid, dispatch]);

  const handleLogin = async () => {
    setMessage('');
    const trimmed = uid.trim();
    if (!trimmed) {
      setMessage(translate('uidLoginRequiredMessage'));
      return;
    }
    try {
      setLoginLoading(true);
      const res = await fetch(`/api/user/status?uid=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        setMessage(translate('uidLoginFailed'));
        return;
      }
      const data: UserStatusResponse = await res.json();
      setStatusInfo(data);
      dispatch({
        type: 'SET_USER',
        payload: {
          uid: trimmed,
          status: data.status,
          accessKey: data.accessKey ?? null,
          approvedStrategies: (data.approvedStrategies || []).map((item) => ({ id: item.id, name: item.name })),
          isLoggedIn: true,
          autoTradingEnabled: Boolean(data.autoTradingEnabled),
        },
      });
      setMessage(translate('uidLoginSuccess'));
    } catch (err) {
      console.error(err);
      setMessage(translate('uidLoginError'));
    } finally {
      setLoginLoading(false);
    }
  };

  const submitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    const trimmed = uid.trim();
    if (!trimmed) {
      setMessage(translate('uidLoginRequiredMessage'));
      return;
    }
    try {
      setRegisterLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: trimmed })
      });
      if (!res.ok) {
        setMessage(translate('registrationRequestFailed'));
        return;
      }
      const data = await res.json();
      setStatusInfo((prev) => ({ ...(prev || {}), status: data.status }));
      dispatch({
        type: 'SET_USER',
        payload: {
          uid: trimmed,
          status: data.status,
          accessKey: null,
          isLoggedIn: true,
          approvedStrategies: [],
          autoTradingEnabled: false,
        },
      });
      if (typeof window !== 'undefined') {
        window.alert(translate('registrationPopupMessage'));
      }
      setMessage(translate('registrationRequestSent'));
    } catch (err) {
      console.error(err);
      setMessage(translate('registrationRequestError'));
    } finally {
      setRegisterLoading(false);
    }
  };

  const statusLabel = (() => {
    const currentStatus = statusInfo?.status || state.user.status;
    switch (currentStatus) {
      case 'approved':
        return translate('statusApproved');
      case 'pending':
        return translate('statusPending');
      case 'denied':
        return translate('statusDenied');
      case 'not_registered':
        return translate('statusNotRegistered');
      default:
        return currentStatus || translate('statusUnknown');
    }
  })();

  return (
    <Card title={translate('userRegistrationTitle')} className="mb-5">
      <form onSubmit={submitRegistration} className="space-y-5">
        <div className="space-y-3">
          <label className="block text-sm text-gray-400 mb-1">{translate('uidLabel')}</label>
          <input
            type="text"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            placeholder={translate('uidPlaceholder')}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
          />
          <p className="text-xs text-gray-500">{translate('uidLoginHelp')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleLogin}
              disabled={loginLoading}
              className={`px-4 py-2 rounded bg-gate-secondary text-sm font-medium hover:bg-gate-secondary/80 transition ${
                loginLoading ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {loginLoading ? translate('loading') : translate('uidLoginButton')}
            </button>
            <button
              type="submit"
              disabled={registerLoading}
              className={`px-4 py-2 bg-gate-primary text-black rounded hover:bg-green-500 transition text-sm font-semibold ${
                registerLoading ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {registerLoading ? translate('loading') : translate('uidRegisterButton')}
            </button>
          </div>
          <p className="text-xs text-gray-400">{translate('registrationReviewNotice')}</p>
        </div>

        {message && <div className="text-sm text-gray-300">{message}</div>}
      </form>

      <div className="mt-4 text-sm space-y-2">
        <div>
          {translate('currentStatusLabel')}: <span className="font-semibold">{statusLabel}</span>
        </div>
        {state.user.status === 'pending' && (
          <div className="text-xs text-yellow-300">{translate('uidPendingNotice')}</div>
        )}
        {state.user.status === 'denied' && (
          <div className="text-xs text-red-300">{translate('uidDeniedNotice')}</div>
        )}
        {(statusInfo?.requestedStrategies?.length ?? 0) > 0 && (
          <div className="text-xs text-gray-400">
            {translate('requestedStrategiesLabel')}: {statusInfo?.requestedStrategies?.map((s) => s.name).join(', ')}
          </div>
        )}
        {approvedStrategyNames.length > 0 && (
          <div className="text-xs text-gray-400">
            {translate('approvedStrategiesLabel')}: {approvedStrategyNames.join(', ')}
          </div>
        )}
        {state.user.accessKey && (
          <div className="text-xs text-gray-400">
            {translate('accessKeyLabel')}: {state.user.accessKey}
          </div>
        )}
      </div>
    </Card>
  );
};

export default RegistrationCard;
