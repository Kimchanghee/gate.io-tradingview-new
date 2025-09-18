import React, { useEffect, useMemo, useState } from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';

interface Strategy {
  id: string;
  name: string;
  description?: string;
  active?: boolean;
}

interface NamedStrategy {
  id: string;
  name: string;
}

interface UserStatusResponse {
  status: 'not_registered' | 'pending' | 'approved' | 'denied' | string;
  requestedStrategies?: NamedStrategy[];
  approvedStrategies?: NamedStrategy[];
  accessKey?: string;
}

const RegistrationCard: React.FC = () => {
  const { state, dispatch, translate } = useAppContext();
  const [uid, setUid] = useState(state.user.uid || '');
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selected, setSelected] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('user_requested_strategies');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
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
    const fetchStrategies = async () => {
      try {
        const res = await fetch('/api/strategies');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.strategies)) {
          setStrategies(data.strategies);
        }
      } catch (err) {
        console.error('전략 목록을 불러오지 못했습니다.', err);
      }
    };
    fetchStrategies();
  }, []);

  useEffect(() => {
    if (state.user.uid && state.user.uid !== uid) {
      setUid(state.user.uid);
    }
  }, [state.user.uid, uid]);

  useEffect(() => {
    localStorage.setItem('user_requested_strategies', JSON.stringify(selected));
  }, [selected]);

  useEffect(() => {
    if (!activeUid) return;
    let stopped = false;
    const poll = async () => {
      try {
<<<<<<< ours
        const res = await fetch(/api/user/status?uid=);
=======
        const url = `/api/user/status?uid=${encodeURIComponent(activeUid)}`;
        const res = await fetch(url);
>>>>>>> theirs
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

  const toggleStrategy = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      return [...prev, id];
    });
  };

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
      if (data.requestedStrategies && data.requestedStrategies.length) {
        setSelected(data.requestedStrategies.map((s) => s.id));
      }
      dispatch({
        type: 'SET_USER',
        payload: {
          uid: trimmed,
          status: data.status,
          accessKey: data.accessKey ?? null,
          approvedStrategies: (data.approvedStrategies || []).map((item) => ({ id: item.id, name: item.name })),
          isLoggedIn: true,
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
    if (!selected.length) {
      setMessage(translate('strategySelectionRequiredMessage'));
      return;
    }

    if (typeof window !== 'undefined') {
      window.alert(translate('uidAlertMessage'));
    }

    try {
      setRegisterLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: trimmed, strategies: selected })
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
        },
      });
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
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">{translate('strategySelectLabel')}</label>
          <div className="flex flex-wrap gap-2">
            {strategies.map((strategy) => (
              <label key={strategy.id} className={px-3 py-2 border rounded cursor-pointer text-sm }>
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={selected.includes(strategy.id)}
                  onChange={() => toggleStrategy(strategy.id)}
                />
                {strategy.name}
              </label>
            ))}
            {strategies.length === 0 && (
              <div className="text-xs text-gray-500">{translate('strategyNone')}</div>
            )}
          </div>
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
