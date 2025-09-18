import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Card from './Card';

interface AdminStrategy {
  id: string;
  name: string;
  description?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface AdminUser {
  uid: string;
  status: 'pending' | 'approved' | 'denied' | string;
  requestedStrategies?: string[];
  approvedStrategies?: string[];
  accessKey?: string | null;
  createdAt?: string;
  updatedAt?: string;
  approvedAt?: string;
}

interface OverviewResponse {
  users: AdminUser[];
  strategies: AdminStrategy[];
  stats: {
    totalUsers: number;
    pending: number;
    approved: number;
  };
}

interface AdminSignal {
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

interface AdminWebhookInfo {
  url: string;
  secret?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface BroadcastFormState {
  strategyId: string;
  title: string;
  action: string;
  side: string;
  symbol: string;
  price: string;
  note: string;
}

const initialBroadcastForm: BroadcastFormState = {
  strategyId: '',
  title: '',
  action: 'open',
  side: 'long',
  symbol: '',
  price: '',
  note: ''
};

const AdminApp: React.FC = () => {
  const [token, setToken] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return window.localStorage.getItem('admin_token') || '';
      } catch (err) {
        console.error('Failed to read admin token', err);
      }
    }
    return '';
  });
  const [inputToken, setInputToken] = useState('');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signalStrategy, setSignalStrategy] = useState('');
  const [signals, setSignals] = useState<AdminSignal[]>([]);
  const [addingStrategy, setAddingStrategy] = useState(false);
  const [newStrategyName, setNewStrategyName] = useState('');
  const [newStrategyDesc, setNewStrategyDesc] = useState('');
  const [selectionMap, setSelectionMap] = useState<Record<string, string[]>>({});
  const [overviewUpdatedAt, setOverviewUpdatedAt] = useState<number | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<AdminWebhookInfo | null>(null);
  const [webhookStatus, setWebhookStatus] = useState('');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState<BroadcastFormState>(initialBroadcastForm);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');

  const authorized = useMemo(() => Boolean(token), [token]);

  const pendingUsers = useMemo(
    () => (overview?.users || []).filter((u) => u.status === 'pending'),
    [overview]
  );
  const approvedUsers = useMemo(
    () => (overview?.users || []).filter((u) => u.status === 'approved'),
    [overview]
  );
  const deniedUsers = useMemo(
    () => (overview?.users || []).filter((u) => u.status === 'denied'),
    [overview]
  );

  const strategyNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (overview?.strategies || []).forEach((strategy) => {
      if (strategy.id) {
        map.set(strategy.id, strategy.name);
      }
    });
    return map;
  }, [overview?.strategies]);

  const resetAdminState = useCallback(() => {
    setToken('');
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('admin_token');
      } catch (err) {
        console.error('Failed to clear admin token', err);
      }
    }
    setOverview(null);
    setSignals([]);
    setSelectionMap({});
    setSignalStrategy('');
    setOverviewUpdatedAt(null);
    setWebhookInfo(null);
    setWebhookStatus('');
    setWebhookLoading(false);
    setWebhookCopied(false);
    setBroadcastForm(initialBroadcastForm);
    setBroadcastLoading(false);
    setBroadcastMessage('');
  }, []);

  const buildHeaders = useCallback(
    (overrideToken?: string): Record<string, string> => {
      const authToken = overrideToken ?? token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['x-admin-token'] = authToken;
      }
      return headers;
    },
    [token]
  );

  const buildAdminUrl = useCallback(
    (
      path: string,
      params?: Record<string, string | number | boolean | null | undefined>
    ) => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            searchParams.set(key, String(value));
          }
        });
      }
      const basePath = path.startsWith('/') ? path : `/${path}`;
      const query = searchParams.toString();
      return query ? `/api/admin${basePath}?${query}` : `/api/admin${basePath}`;
    },
    []
  );

  const overviewUrl = useMemo(() => buildAdminUrl('/overview'), [buildAdminUrl]);

  const fetchOverview = useCallback(
    async (overrideToken?: string): Promise<OverviewResponse | null> => {
      const authToken = overrideToken ?? token;
      if (!authToken) return null;
      try {
        setLoading(true);
        setError('');
        const res = await fetch(overviewUrl, { headers: buildHeaders(authToken) });
        if (res.status === 401) {
          setError('관리자 토큰이 유효하지 않습니다.');
          resetAdminState();
          return null;
        }
        if (!res.ok) {
          setError('관리자 데이터를 불러오지 못했습니다.');
          return null;
        }
        const data: OverviewResponse = await res.json();
        setOverview(data);
        setOverviewUpdatedAt(Date.now());
        const nextSelection: Record<string, string[]> = {};
        data.users.forEach((user) => {
          if (user.status === 'pending') {
            nextSelection[user.uid] = [...(user.requestedStrategies || [])];
          }
        });
        setSelectionMap((prev) => {
          const preserved = Object.fromEntries(
            Object.entries(prev).filter(([uid]) => nextSelection[uid])
          ) as Record<string, string[]>;
          return { ...nextSelection, ...preserved };
        });
        return data;
      } catch (err) {
        console.error(err);
        setError('관리자 데이터를 불러오는 중 오류가 발생했습니다.');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token, buildHeaders, overviewUrl, resetAdminState]
  );

  const fetchSignals = useCallback(
    async (strategyId: string, overrideToken?: string): Promise<void> => {
      const authToken = overrideToken ?? token;
      if (!authToken || !strategyId) return;
      try {
        const res = await fetch(
          buildAdminUrl('/signals', { strategy: strategyId }),
          { headers: buildHeaders(authToken) }
        );
        if (res.status === 401) {
          setError('관리자 토큰이 유효하지 않습니다.');
          resetAdminState();
          return;
        }
        if (!res.ok) {
          throw new Error('Failed to fetch signals');
        }
        const data = await res.json();
        setSignals(Array.isArray(data.signals) ? data.signals.slice().reverse() : []);
      } catch (err) {
        console.error(err);
      }
    },
    [token, buildHeaders, buildAdminUrl, resetAdminState]
  );

  const fetchWebhookInfo = useCallback(
    async (overrideToken?: string): Promise<AdminWebhookInfo | null> => {
      const authToken = overrideToken ?? token;
      if (!authToken) return null;
      try {
        setWebhookLoading(true);
        setWebhookStatus('');
        const res = await fetch(buildAdminUrl('/webhook'), { headers: buildHeaders(authToken) });
        if (res.status === 401) {
          setError('관리자 토큰이 유효하지 않습니다.');
          resetAdminState();
          return null;
        }
        if (res.status === 404) {
          setWebhookInfo(null);
          return null;
        }
        if (!res.ok) {
          setWebhookStatus('대표 웹훅 정보를 불러오지 못했습니다.');
          return null;
        }
        const data: AdminWebhookInfo = await res.json();
        setWebhookInfo(data);
        return data;
      } catch (err) {
        console.error(err);
        setWebhookStatus('대표 웹훅 정보를 불러오는 중 오류가 발생했습니다.');
        return null;
      } finally {
        setWebhookLoading(false);
      }
    },
    [token, buildAdminUrl, buildHeaders, resetAdminState]
  );

  const generateWebhook = useCallback(
    async () => {
      if (!token) return;
      try {
        setWebhookLoading(true);
        setWebhookStatus('');
        const res = await fetch(buildAdminUrl('/webhook'), {
          method: 'POST',
          headers: buildHeaders()
        });
        if (res.status === 401) {
          setError('관리자 토큰이 유효하지 않습니다.');
          resetAdminState();
          return;
        }
        if (!res.ok) {
          setWebhookStatus('대표 웹훅 생성에 실패했습니다.');
          return;
        }
        const data: AdminWebhookInfo = await res.json();
        setWebhookInfo(data);
        setWebhookStatus('대표 웹훅이 새로 발급되었습니다.');
      } catch (err) {
        console.error(err);
        setWebhookStatus('대표 웹훅 생성 중 오류가 발생했습니다.');
      } finally {
        setWebhookLoading(false);
      }
    },
    [token, buildAdminUrl, buildHeaders, resetAdminState]
  );

  const copyWebhookUrl = useCallback(async () => {
    if (!webhookInfo?.url) return;
    try {
      await navigator.clipboard.writeText(webhookInfo.url);
      setWebhookCopied(true);
      setWebhookStatus('대표 웹훅 URL을 복사했습니다.');
      if (typeof window !== 'undefined') {
        window.setTimeout(() => setWebhookCopied(false), 1500);
      }
    } catch (err) {
      console.error(err);
      setWebhookStatus('클립보드로 복사하지 못했습니다.');
    }
  }, [webhookInfo?.url]);

  const updateBroadcastField = useCallback(
    (field: keyof BroadcastFormState, value: string) => {
      setBroadcastForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleBroadcastStrategyChange = useCallback(
    (value: string) => {
      updateBroadcastField('strategyId', value);
      if (value) {
        setSignalStrategy(value);
      }
    },
    [updateBroadcastField, setSignalStrategy]
  );

  const handleBroadcastSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBroadcastMessage('');
      if (!broadcastForm.strategyId) {
        setBroadcastMessage('전송할 전략을 선택해 주세요.');
        return;
      }
      try {
        setBroadcastLoading(true);
        const payload: Record<string, unknown> = {
          strategyId: broadcastForm.strategyId,
          title: broadcastForm.title || undefined,
          action: broadcastForm.action || undefined,
          side: broadcastForm.side || undefined,
          symbol: broadcastForm.symbol || undefined,
          note: broadcastForm.note || undefined
        };
        if (broadcastForm.price) {
          const parsed = Number(broadcastForm.price);
          if (!Number.isNaN(parsed)) {
            payload.price = parsed;
          }
        }
        const res = await fetch(buildAdminUrl('/signals/broadcast'), {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify(payload)
        });
        if (res.status === 401) {
          setError('관리자 토큰이 유효하지 않습니다.');
          resetAdminState();
          return;
        }
        if (!res.ok) {
          setBroadcastMessage('신호 전송에 실패했습니다.');
          return;
        }
        setBroadcastMessage('신호가 구독자에게 전송되었습니다.');
        setBroadcastForm((prev) => ({ ...prev, title: '', symbol: '', price: '', note: '' }));
        await fetchSignals(broadcastForm.strategyId);
      } catch (err) {
        console.error(err);
        setBroadcastMessage('신호 전송 중 오류가 발생했습니다.');
      } finally {
        setBroadcastLoading(false);
      }
    },
    [broadcastForm, buildAdminUrl, buildHeaders, fetchSignals, resetAdminState]
  );

  useEffect(() => {
    if (!token) return;
    fetchOverview();
    fetchWebhookInfo();
    if (typeof window === 'undefined') return;
    const id = window.setInterval(() => {
      fetchOverview();
    }, 15000);
    return () => window.clearInterval(id);
  }, [token, fetchOverview, fetchWebhookInfo]);

  useEffect(() => {
    if (token && signalStrategy) {
      fetchSignals(signalStrategy);
    }
  }, [token, signalStrategy, fetchSignals]);

  useEffect(() => {
    const strategies = overview?.strategies || [];
    if (!strategies.length) return;
    if (!strategies.some((s) => s.id === signalStrategy)) {
      setSignalStrategy(strategies[0].id);
    }
    setBroadcastForm((prev) => {
      if (prev.strategyId && strategies.some((s) => s.id === prev.strategyId)) {
        return prev;
      }
      return { ...prev, strategyId: strategies[0].id };
    });
  }, [overview?.strategies, signalStrategy]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputToken.trim()) {
      setError('토큰을 입력해주세요.');
      return;
    }
    const authToken = inputToken.trim();
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('admin_token', authToken);
      } catch (err) {
        console.error('Failed to persist admin token', err);
      }
    }
    setToken(authToken);
    setInputToken('');
    await fetchWebhookInfo(authToken);
    const latestOverview = await fetchOverview(authToken);
    const strategies = latestOverview?.strategies || overview?.strategies || [];
    if (strategies.length) {
      const nextStrategy = strategies.some((s) => s.id === signalStrategy)
        ? signalStrategy
        : strategies[0].id;
      setSignalStrategy(nextStrategy);
      await fetchSignals(nextStrategy, authToken);
    } else if (signalStrategy) {
      await fetchSignals(signalStrategy, authToken);
    }
  };

  const handleLogout = () => {
    resetAdminState();
  };

  const toggleSelection = (uid: string, strategyId: string) => {
    setSelectionMap((prev) => {
      const current = prev[uid] ? [...prev[uid]] : [];
      if (current.includes(strategyId)) {
        return { ...prev, [uid]: current.filter((id) => id !== strategyId) };
      }
      current.push(strategyId);
      return { ...prev, [uid]: current };
    });
  };

  const approveUser = async (uid: string) => {
    const selected = selectionMap[uid] || [];
    if (!selected.length) {
      setError('최소 한 개 이상의 전략을 선택해주세요.');
      return;
    }
    try {
      const res = await fetch(buildAdminUrl('/users/approve'), {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ uid, strategies: selected })
      });
      if (res.status === 401) {
        setError('관리자 토큰이 유효하지 않습니다.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('사용자 승인에 실패했습니다.');
        return;
      }
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('사용자 승인 중 오류가 발생했습니다.');
    }
  };

  const denyUser = async (uid: string) => {
    try {
      const res = await fetch(buildAdminUrl('/users/deny'), {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ uid })
      });
      if (res.status === 401) {
        setError('관리자 토큰이 유효하지 않습니다.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('사용자 거절에 실패했습니다.');
        return;
      }
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('사용자 거절 중 오류가 발생했습니다.');
    }
  };

  const addStrategy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStrategyName.trim()) return;
    try {
      setAddingStrategy(true);
      const res = await fetch(buildAdminUrl('/strategies'), {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ name: newStrategyName.trim(), description: newStrategyDesc.trim() })
      });
      if (res.status === 401) {
        setError('관리자 토큰이 유효하지 않습니다.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('전략 추가에 실패했습니다.');
        return;
      }
      setNewStrategyName('');
      setNewStrategyDesc('');
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('전략 추가 중 오류가 발생했습니다.');
    } finally {
      setAddingStrategy(false);
    }
  };

  const toggleStrategyActive = async (strategy: AdminStrategy) => {
    try {
      const res = await fetch(buildAdminUrl(`/strategies/${strategy.id}`), {
        method: 'PATCH',
        headers: buildHeaders(),
        body: JSON.stringify({ active: strategy.active === false })
      });
      if (res.status === 401) {
        setError('관리자 토큰이 유효하지 않습니다.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('전략 상태 변경에 실패했습니다.');
        return;
      }
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('전략 상태 변경 중 오류가 발생했습니다.');
    }
  };

  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gate-dark to-black text-gate-text p-6">
        <div className="max-w-md mx-auto">
          <Card title="관리자 로그인">
            <div className="space-y-2 text-sm text-gray-300 mb-4">
              <p>1) 브라우저 주소창 끝에 <span className="font-mono text-xs bg-black/40 px-1 py-0.5 rounded">/admin</span> 을 입력해 관리자 페이지에 접속합니다.</p>
              <p>2) 백엔드 환경 변수 <span className="font-mono text-xs bg-black/40 px-1 py-0.5 rounded">ADMIN_SECRET</span> 값과 동일한 토큰을 준비합니다.</p>
              <p>3) 아래 입력란에 토큰을 넣고 로그인하면 UID 승인·거절 및 신호 브로드캐스트 기능을 사용할 수 있습니다.</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">관리자 토큰</label>
                <input
                  type="password"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
                  placeholder="ADMIN_SECRET 값"
                />
              </div>
              {error && <div className="text-sm text-red-400">{error}</div>}
              <button
                type="submit"
                className="w-full py-2 bg-gate-primary text-black rounded font-semibold hover:bg-green-500 transition"
              >
                로그인
              </button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  const totalUsers = overview?.stats?.totalUsers ?? overview?.users?.length ?? 0;
  const pendingCount = overview?.stats?.pending ?? pendingUsers.length;
  const approvedCount = overview?.stats?.approved ?? approvedUsers.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gate-dark to-black text-gate-text p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <h1 className="text-2xl font-bold">관리자 콘솔</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchOverview()}
            className="px-3 py-1 bg-gate-primary text-black rounded hover:bg-green-500 transition"
            disabled={loading}
          >
            새로고침
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
          >
            로그아웃
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card title="총 사용자 수" className="text-center">
          <div className="text-3xl font-bold text-gate-primary">{totalUsers}</div>
          <div className="text-xs text-gray-400 mt-2">등록된 전체 사용자 수</div>
        </Card>
        <Card title="승인 대기" className="text-center">
          <div className="text-3xl font-bold text-yellow-300">{pendingCount}</div>
          <div className="text-xs text-gray-400 mt-2">승인 대기 중인 사용자</div>
        </Card>
        <Card title="승인된 사용자" className="text-center">
          <div className="text-3xl font-bold text-green-300">{approvedCount}</div>
          <div className="text-xs text-gray-400 mt-2">
            {overviewUpdatedAt
              ? `마지막 업데이트: ${new Date(overviewUpdatedAt).toLocaleString()}`
              : '업데이트 정보 없음'}
          </div>
        </Card>
      </div>

      {error && <div className="mb-4 text-red-400 text-sm">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card title="대표 웹훅 관리" className="space-y-4">
          <p className="text-sm text-gray-300">
            TradingView 같은 외부 도구에서 이 URL로 신호를 보내면 선택한 회원들에게 자동으로 중계됩니다.
          </p>
          {webhookInfo?.url ? (
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={webhookInfo.url}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-xs font-mono"
                />
                <button
                  onClick={copyWebhookUrl}
                  disabled={webhookLoading}
                  className={`px-3 py-2 rounded text-xs font-semibold ${
                    webhookLoading
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-gate-primary text-black hover:bg-green-500 transition'
                  }`}
                >
                  {webhookCopied ? '복사됨' : '복사'}
                </button>
              </div>
              {webhookInfo.updatedAt && (
                <div className="text-xs text-gray-500">
                  마지막 갱신: {new Date(webhookInfo.updatedAt).toLocaleString()}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-400 bg-black/30 border border-gray-700 rounded px-3 py-2">
              아직 대표 웹훅이 생성되지 않았습니다. 아래 버튼으로 생성하세요.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={generateWebhook}
              disabled={webhookLoading}
              className={`px-4 py-2 rounded text-sm font-semibold ${
                webhookLoading
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gate-primary text-black hover:bg-green-500 transition'
              }`}
            >
              대표 웹훅 생성
            </button>
            <button
              onClick={() => fetchWebhookInfo()}
              disabled={webhookLoading}
              className={`px-4 py-2 rounded text-sm border border-gray-600 hover:bg-gray-800 transition ${
                webhookLoading ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              정보 새로고침
            </button>
          </div>
          {webhookStatus && <div className="text-xs text-gray-300">{webhookStatus}</div>}
        </Card>

        <Card title="신호 브로드캐스트" className="space-y-4">
          <p className="text-sm text-gray-300">
            대표 웹훅에서 수신한 신호를 선택한 전략 구독자에게 전송할 수 있습니다.
          </p>
          <form onSubmit={handleBroadcastSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">대상 전략</label>
              <select
                value={broadcastForm.strategyId}
                onChange={(e) => handleBroadcastStrategyChange(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
              >
                <option value="">전략을 선택하세요</option>
                {(overview?.strategies || []).map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name} ({strategy.id})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">신호 제목</label>
                <input
                  type="text"
                  value={broadcastForm.title}
                  onChange={(e) => updateBroadcastField('title', e.target.value)}
                  placeholder="예: RSI 진입 신호"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">거래 종목</label>
                <input
                  type="text"
                  value={broadcastForm.symbol}
                  onChange={(e) => updateBroadcastField('symbol', e.target.value)}
                  placeholder="예: BTC_USDT"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">포지션 동작</label>
                <select
                  value={broadcastForm.action}
                  onChange={(e) => updateBroadcastField('action', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
                >
                  <option value="open">진입 (open)</option>
                  <option value="close">청산 (close)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">포지션 방향</label>
                <select
                  value={broadcastForm.side}
                  onChange={(e) => updateBroadcastField('side', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
                >
                  <option value="long">롱 (long)</option>
                  <option value="short">숏 (short)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">가격 (선택)</label>
                <input
                  type="text"
                  value={broadcastForm.price}
                  onChange={(e) => updateBroadcastField('price', e.target.value)}
                  placeholder="예: 67123.5"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">추가 메모</label>
                <input
                  type="text"
                  value={broadcastForm.note}
                  onChange={(e) => updateBroadcastField('note', e.target.value)}
                  placeholder="필요 시 간단히 기록"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={broadcastLoading}
              className={`w-full py-2 rounded text-sm font-semibold ${
                broadcastLoading
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gate-primary text-black hover:bg-green-500 transition'
              }`}
            >
              신호 전송
            </button>
          </form>
          {broadcastMessage && <div className="text-xs text-gray-300">{broadcastMessage}</div>}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="전략 관리" className="space-y-4">
          <form onSubmit={addStrategy} className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={newStrategyName}
              onChange={(e) => setNewStrategyName(e.target.value)}
              placeholder="전략 이름"
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded"
            />
            <input
              type="text"
              value={newStrategyDesc}
              onChange={(e) => setNewStrategyDesc(e.target.value)}
              placeholder="설명 (선택)"
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded"
            />
            <button
              type="submit"
              disabled={addingStrategy}
              className="px-3 py-2 bg-gate-primary text-black rounded hover:bg-green-500 transition disabled:opacity-60"
            >
              추가
            </button>
          </form>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(overview?.strategies || []).map((strategy) => (
              <div key={strategy.id} className="flex items-center justify-between bg-black/40 border border-gray-700 rounded px-3 py-2">
                <div>
                  <div className="font-semibold">{strategy.name}</div>
                  <div className="text-xs text-gray-400">ID: {strategy.id}</div>
                  {strategy.description && (
                    <div className="text-xs text-gray-500">{strategy.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${
                      strategy.active !== false
                        ? 'bg-green-500/20 border-green-500/50 text-green-200'
                        : 'bg-gray-800 border-gray-600 text-gray-300'
                    }`}
                  >
                    {strategy.active !== false ? '활성' : '비활성'}
                  </span>
                  <button
                    onClick={() => toggleStrategyActive(strategy)}
                    className="text-xs px-2 py-1 border border-gray-500 rounded hover:bg-gray-700"
                  >
                    상태 전환
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="웹훅 신호 모니터">
          <div className="flex items-center gap-3 mb-3">
            <select
              value={signalStrategy}
              onChange={(e) => setSignalStrategy(e.target.value)}
              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded"
            >
              {(overview?.strategies || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
            <button
              onClick={() => fetchSignals(signalStrategy)}
              className="px-3 py-2 bg-gray-700 rounded hover:bg-gray-600"
            >
              새로고침
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2 text-sm">
            {signals.length === 0 ? (
              <div className="text-gray-500">표시할 신호가 없습니다.</div>
            ) : (
              signals.map((signal) => (
                <div key={signal.id} className="bg-black/40 border border-gray-700 rounded px-3 py-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{new Date(signal.timestamp).toLocaleString()}</span>
                    <span>{signal.status}</span>
                  </div>
                  <div className="text-sm font-semibold">
                    {strategyNameMap.get(signal.strategyId || '') || signal.strategyId || '---'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {signal.symbol || '---'} · {signal.action} {signal.side} · size={signal.size ?? '-'} · leverage={signal.leverage ?? '-'}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="승인 대기 사용자" className="space-y-3">
          {pendingUsers.length === 0 ? (
            <div className="text-sm text-gray-500">대기 중인 사용자가 없습니다.</div>
          ) : (
            pendingUsers.map((user) => (
              <div key={user.uid} className="bg-black/40 border border-gray-700 rounded px-3 py-3 space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold">UID: {user.uid}</div>
                    <div className="text-xs text-gray-500">요청 전략: {(user.requestedStrategies || []).join(', ') || '-'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveUser(user.uid)}
                      className="px-3 py-1 bg-gate-primary text-black rounded hover:bg-green-500 transition"
                    >
                      승인
                    </button>
                    <button
                      onClick={() => denyUser(user.uid)}
                      className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                    >
                      거절
                    </button>
                  </div>
                </div>
                <div className="text-xs text-gray-400">전략 선택:</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {(overview?.strategies || []).map((strategy) => (
                    <label
                      key={`${user.uid}-${strategy.id}`}
                      className="flex items-center gap-1 bg-gray-900 border border-gray-700 px-2 py-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={(selectionMap[user.uid] || []).includes(strategy.id)}
                        onChange={() => toggleSelection(user.uid, strategy.id)}
                      />
                      {strategy.name}
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </Card>

        <div className="space-y-6">
          <Card title="승인된 사용자" className="space-y-2 max-h-64 overflow-y-auto">
            {approvedUsers.length === 0 ? (
              <div className="text-sm text-gray-500">승인된 사용자가 없습니다.</div>
            ) : (
              approvedUsers.map((user) => (
                <div key={user.uid} className="bg-black/40 border border-gray-700 rounded px-3 py-2">
                  <div className="font-semibold">{user.uid}</div>
                  <div className="text-xs text-gray-400">접근 키: {user.accessKey || '-'}</div>
                  <div className="text-xs text-gray-500">전략: {(user.approvedStrategies || []).join(', ') || '-'}</div>
                  {user.approvedAt && (
                    <div className="text-xs text-gray-600">승인일: {new Date(user.approvedAt).toLocaleString()}</div>
                  )}
                </div>
              ))
            )}
          </Card>

          <Card title="거절된 사용자" className="space-y-2 max-h-64 overflow-y-auto">
            {deniedUsers.length === 0 ? (
              <div className="text-sm text-gray-500">거절된 사용자가 없습니다.</div>
            ) : (
              deniedUsers.map((user) => (
                <div key={user.uid} className="bg-black/40 border border-gray-700 rounded px-3 py-2">
                  <div className="font-semibold">{user.uid}</div>
                  <div className="text-xs text-gray-500">최근 상태 변경: {user.updatedAt ? new Date(user.updatedAt).toLocaleString() : '-'}</div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminApp;
