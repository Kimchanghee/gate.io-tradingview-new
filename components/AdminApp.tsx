import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from './Card';
import LogsCard from './LogsCard';

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
  indicator?: string;
}

interface AdminWebhookDelivery {
  id: string;
  timestamp: string;
  indicator?: string;
  symbol?: string;
  action?: string;
  side?: string;
  strategyId?: string;
  strategyName?: string;
  delivered: number;
  autoTradingDelivered?: number;
  recipients: Array<{
    uid: string;
    status: string;
    autoTradingEnabled: boolean;
    approved: boolean;
  }>;
}

interface AdminWebhookInfo {
  url: string;
  secret?: string;
  createdAt?: string;
  updatedAt?: string;
  alreadyExists?: boolean;
}

interface AdminRealtimeMetrics {
  visitors: {
    active: number;
    totalSessions: number;
    lastVisitAt: string | null;
  };
  signalRecipients: {
    active: number;
    lastSignalAt: string | null;
    lastDeliveredCount: number;
  };
  webhook: {
    ready: boolean;
    issues: string[];
    routes: string[];
    lastSignal: {
      timestamp: string;
      indicator?: string;
      symbol?: string;
      action?: string;
      side?: string;
      delivered: number;
      autoTradingDelivered?: number;
      strategyId?: string;
      strategyName?: string;
      recipients?: string[];
    } | null;
  };
  googleSheets: {
    configured: boolean;
    lastStatus: string;
    lastSyncAt: string | null;
    lastError: string | null;
  };
}

const loadInitialWebhookTargets = (): { list: string[]; fromStorage: boolean } => {
  if (typeof window === 'undefined') {
    return { list: [], fromStorage: false };
  }

  try {
    const raw = window.localStorage.getItem('admin_webhook_targets');
    if (!raw) {
      return { list: [], fromStorage: false };
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        list: parsed.filter((item): item is string => typeof item === 'string'),
        fromStorage: true,
      };
    }
  } catch (err) {
    console.error('Failed to load stored webhook targets', err);
  }

  return { list: [], fromStorage: false };
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
  const [actionMessage, setActionMessage] = useState('');
  const [signalStrategy, setSignalStrategy] = useState('');
  const [signals, setSignals] = useState<AdminSignal[]>([]);
  const [addingStrategy, setAddingStrategy] = useState(false);
  const [newStrategyName, setNewStrategyName] = useState('');
  const [newStrategyDesc, setNewStrategyDesc] = useState('');
  const [overviewUpdatedAt, setOverviewUpdatedAt] = useState<number | null>(null);

  const initialTargets = loadInitialWebhookTargets();
  const [webhookTargets, setWebhookTargets] = useState<string[]>(initialTargets.list);
  const webhookTargetsLoadedFromStorage = useRef(initialTargets.fromStorage);

  const [webhookInfo, setWebhookInfo] = useState<AdminWebhookInfo | null>(null);
  const [webhookStatus, setWebhookStatus] = useState('');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookBaseOverride, setWebhookBaseOverride] = useState('');
  const [metricsState, setMetricsState] = useState<AdminRealtimeMetrics | null>(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState<AdminWebhookDelivery[]>([]);

  const authorized = useMemo(() => Boolean(token), [token]);
  const pendingUsers = useMemo(
    () => (overview?.users || []).filter((user) => user.status === 'pending'),
    [overview],
  );
  const approvedUsers = useMemo(
    () => (overview?.users || []).filter((user) => user.status === 'approved'),
    [overview],
  );
  const deniedUsers = useMemo(
    () => (overview?.users || []).filter((user) => user.status === 'denied'),
    [overview],
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

  useEffect(() => {
    if (!actionMessage) return;
    const id = window.setTimeout(() => setActionMessage(''), 3200);
    return () => window.clearTimeout(id);
  }, [actionMessage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('admin_webhook_targets', JSON.stringify(webhookTargets));
    } catch (err) {
      console.error('Failed to persist admin webhook targets', err);
    }
  }, [webhookTargets]);

  useEffect(() => {
    if (webhookTargetsLoadedFromStorage.current) return;
    if (!overview?.strategies?.length) return;
    const defaults = overview.strategies
      .filter((strategy) => strategy.active !== false)
      .map((strategy) => strategy.id);
    setWebhookTargets(defaults);
    webhookTargetsLoadedFromStorage.current = true;
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
    setSignalStrategy('');
    setOverviewUpdatedAt(null);
    setWebhookInfo(null);
    setWebhookStatus('');
    setWebhookLoading(false);
    setWebhookCopied(false);
    setWebhookSaving(false);
    setWebhookBaseOverride('');
    setMetricsState(null);
    setWebhookDeliveries([]);
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
    [token],
  );

  const buildAdminUrl = useCallback(
    (
      path: string,
      params?: Record<string, string | number | boolean | null | undefined>,
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
    [],
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
          setError('관리자 토큰이 더 이상 유효하지 않습니다.');
          resetAdminState();
          return null;
        }
        if (!res.ok) {
          setError('최신 관리자 데이터를 불러오지 못했습니다.');
          return null;
        }
        const data: OverviewResponse = await res.json();
        setOverview(data);
        setOverviewUpdatedAt(Date.now());
        return data;
      } catch (err) {
        console.error(err);
        setError('관리자 데이터를 불러오는 중 예상치 못한 오류가 발생했습니다.');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token, overviewUrl, buildHeaders, resetAdminState],
  );

  const fetchSignals = useCallback(
    async (strategyId: string, overrideToken?: string): Promise<void> => {
      const authToken = overrideToken ?? token;
      if (!authToken || !strategyId) return;
      try {
        const res = await fetch(
          buildAdminUrl('/signals', { strategy: strategyId }),
          { headers: buildHeaders(authToken) },
        );
        if (res.status === 401) {
          setError('관리자 토큰이 더 이상 유효하지 않습니다.');
          resetAdminState();
          return;
        }
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        setSignals(Array.isArray(data.signals) ? data.signals.slice().reverse() : []);
      } catch (err) {
        console.error(err);
      }
    },
    [token, buildAdminUrl, buildHeaders, resetAdminState],
  );

  const fetchMetrics = useCallback(
    async (overrideToken?: string): Promise<AdminRealtimeMetrics | null> => {
      const authToken = overrideToken ?? token;
      if (!authToken) return null;
      try {
        const res = await fetch(buildAdminUrl('/metrics'), { headers: buildHeaders(authToken) });
        if (res.status === 401) {
          setError('관리자 토큰이 더 이상 유효하지 않습니다.');
          resetAdminState();
          return null;
        }
        if (!res.ok) {
          return null;
        }
        const data: AdminRealtimeMetrics = await res.json();
        setMetricsState(data);
        return data;
      } catch (err) {
        console.error(err);
        return null;
      }
    },
    [token, buildAdminUrl, buildHeaders, resetAdminState],
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
          setError('관리자 토큰이 더 이상 유효하지 않습니다.');
          resetAdminState();
          return null;
        }
        if (res.status === 404) {
          setWebhookInfo(null);
          setWebhookBaseOverride('');
          setWebhookStatus('등록된 웹훅이 없습니다. 아래 버튼으로 새 URL을 발급하세요.');
          return null;
        }
        if (!res.ok) {
          setWebhookStatus('웹훅 정보를 불러올 수 없습니다.');
          return null;
        }
        const data: AdminWebhookInfo = await res.json();
        setWebhookInfo(data);
        if (data?.baseUrl) {
          setWebhookBaseOverride(data.baseUrl);
        }
        return data;
      } catch (err) {
        console.error(err);
        setWebhookStatus('웹훅 정보를 불러올 수 없습니다.');
        return null;
      } finally {
        setWebhookLoading(false);
      }
    },
    [token, buildAdminUrl, buildHeaders, resetAdminState],
  );

  const fetchWebhookDeliveries = useCallback(
    async (overrideToken?: string): Promise<void> => {
      const authToken = overrideToken ?? token;
      if (!authToken) return;
      try {
        const res = await fetch(buildAdminUrl('/webhook/deliveries'), {
          headers: buildHeaders(authToken),
        });
        if (res.status === 401) {
          setError('관리자 토큰이 더 이상 유효하지 않습니다.');
          resetAdminState();
          return;
        }
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        setWebhookDeliveries(Array.isArray(data.deliveries) ? data.deliveries : []);
      } catch (err) {
        console.error(err);
      }
    },
    [token, buildAdminUrl, buildHeaders, resetAdminState],
  );

  const generateWebhook = useCallback(
    async (options?: { force?: boolean }) => {
      if (!token) return;
      const force = Boolean(options?.force);
      if (webhookInfo?.url && !force) {
        setWebhookStatus('이미 생성된 웹훅 URL이 있습니다. 도메인을 바꾸거나 새로 발급하려면 "URL 재발급"을 사용하세요.');
        return;
      }
      try {
        setWebhookLoading(true);
        setWebhookStatus('');
        const payload: Record<string, unknown> = {};
        const trimmedBase = webhookBaseOverride.trim();
        if (force) {
          payload.force = true;
        }
        if (trimmedBase) {
          payload.baseUrl = trimmedBase;
        }
        const res = await fetch(buildAdminUrl('/webhook'), {
          method: 'POST',
          headers: buildHeaders(),
          body: Object.keys(payload).length ? JSON.stringify(payload) : undefined,
        });
        if (res.status === 401) {
          setError('관리자 토큰이 더 이상 유효하지 않습니다.');
          resetAdminState();
          return;
        }
        if (res.status === 400) {
          setWebhookStatus('웹훅 기본 URL을 확인할 수 없어요. 환경 변수 또는 입력한 도메인을 다시 확인해주세요.');
          return;
        }
        if (!res.ok) {
          setWebhookStatus('웹훅 URL 생성에 실패했어요.');
          return;
        }
        const data: AdminWebhookInfo = await res.json();
        setWebhookInfo(data);
        if (data?.baseUrl) {
          setWebhookBaseOverride(data.baseUrl);
        }
        if (force) {
          setActionMessage('웹훅 URL을 다시 생성했어요.');
        } else if (data.alreadyExists) {
          setWebhookStatus('이미 생성된 웹훅 URL이 있어 기존 값을 불러왔어요.');
        } else {
          setActionMessage('새 웹훅 URL을 생성했어요.');
        }
      } catch (err) {
        console.error(err);
        setWebhookStatus('웹훅 URL 생성에 실패했어요.');
      } finally {
        setWebhookLoading(false);
      }
    },
    [token, buildAdminUrl, buildHeaders, resetAdminState, webhookInfo?.url, webhookBaseOverride],
  );

  const copyWebhookUrl = useCallback(async () => {
    if (!webhookInfo?.url) return;
    try {
      await navigator.clipboard.writeText(webhookInfo.url);
      setWebhookCopied(true);
      setActionMessage('웹훅 URL을 클립보드에 복사했습니다.');
      if (typeof window !== 'undefined') {
        window.setTimeout(() => setWebhookCopied(false), 1500);
      }
    } catch (err) {
      console.error(err);
      setWebhookStatus('클립보드 복사에 실패했습니다.');
    }
  }, [webhookInfo?.url]);

  const toggleWebhookTarget = (strategyId: string) => {
    setWebhookTargets((prev) => {
      const next = new Set(prev);
      if (next.has(strategyId)) {
        next.delete(strategyId);
      } else {
        next.add(strategyId);
      }
      return Array.from(next);
    });
  };

  const saveWebhookTargets = async () => {
    if (!token) return;
    try {
      setWebhookSaving(true);
      setWebhookStatus('');
      const res = await fetch(buildAdminUrl('/webhook/routes'), {
        method: 'PUT',
        headers: buildHeaders(),
        body: JSON.stringify({ strategies: webhookTargets }),
      });
      if (res.status === 401) {
        setError('관리자 토큰이 더 이상 유효하지 않습니다.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setWebhookStatus('선택한 전략을 저장하지 못했습니다.');
        return;
      }
      setWebhookStatus('웹훅 전달 대상이 저장되었습니다.');
      setActionMessage('웹훅 전달 대상을 갱신했습니다.');
    } catch (err) {
      console.error(err);
      setWebhookStatus('선택한 전략을 저장하지 못했습니다.');
    } finally {
      setWebhookSaving(false);
    }
  };
  const approveUser = async (uid: string) => {
    try {
      setError('');
      const res = await fetch(buildAdminUrl('/users/approve'), {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          uid,
        }),
      });
      if (res.status === 401) {
        setError('관리자 토큰이 더 이상 유효하지 않습니다.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('사용자 승인이 실패했습니다.');
        return;
      }
      setActionMessage('사용자를 승인했습니다.');
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('사용자를 승인하는 중 오류가 발생했습니다.');
    }
  };

  const denyUser = async (uid: string) => {
    try {
      setError('');
      const res = await fetch(buildAdminUrl('/users/deny'), {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ uid }),
      });
      if (res.status === 401) {
        setError('관리자 토큰이 더 이상 유효하지 않습니다.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('사용자 거절에 실패했습니다.');
        return;
      }
      setActionMessage('사용자를 거절했습니다.');
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('사용자를 거절하는 중 오류가 발생했습니다.');
    }
  };

  const deleteUser = async (uid: string) => {
    if (!uid) return;
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm('사용자를 삭제하면 승인 정보와 액세스 키가 모두 제거됩니다. 계속하시겠습니까?');
      if (!confirmed) {
        return;
      }
    }
    try {
      setError('');
      const res = await fetch(buildAdminUrl(`/users/${encodeURIComponent(uid)}`), {
        method: 'DELETE',
        headers: buildHeaders(),
      });
      if (res.status === 401) {
        setError('관리자 토큰이 더 이상 유효하지 않습니다.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('사용자 삭제에 실패했습니다.');
        return;
      }
      setActionMessage('사용자를 삭제했습니다.');
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('사용자를 삭제하는 중 오류가 발생했습니다.');
    }
  };

  const addStrategy = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newStrategyName.trim()) {
      return;
    }
    try {
      setAddingStrategy(true);
      setError('');
      const res = await fetch(buildAdminUrl('/strategies'), {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          name: newStrategyName.trim(),
          description: newStrategyDesc.trim(),
        }),
      });
      if (res.status === 401) {
        setError('관리자 토큰이 더 이상 유효하지 않습니다.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('전략 추가에 실패했습니다.');
        return;
      }
      setNewStrategyName('');
      setNewStrategyDesc('');
      setActionMessage('전략이 추가되었습니다.');
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('전략을 추가하는 중 오류가 발생했습니다.');
    } finally {
      setAddingStrategy(false);
    }
  };

  const toggleStrategyActive = async (strategy: AdminStrategy) => {
    try {
      setError('');
      const res = await fetch(buildAdminUrl(`/strategies/${strategy.id}`), {
        method: 'PATCH',
        headers: buildHeaders(),
        body: JSON.stringify({ active: strategy.active === false }),
      });
      if (res.status === 401) {
        setError('관리자 토큰이 더 이상 유효하지 않습니다.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('전략 상태 변경에 실패했습니다.');
        return;
      }
      setActionMessage('전략 상태를 업데이트했습니다.');
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('전략 상태를 변경하는 중 오류가 발생했습니다.');
    }
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputToken.trim()) {
      setError('관리자 토큰을 입력한 후 로그인하세요.');
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
    const latestOverview = await fetchOverview(authToken);
    const strategies = latestOverview?.strategies || overview?.strategies || [];
    if (strategies.length) {
      const nextStrategy = strategies.some((strategy) => strategy.id === signalStrategy)
        ? signalStrategy
        : strategies[0].id;
      setSignalStrategy(nextStrategy);
      await fetchSignals(nextStrategy, authToken);
    }
    await fetchWebhookInfo(authToken);
    await fetchMetrics(authToken);
  };

  const handleLogout = () => {
    resetAdminState();
  };

  const handleRefresh = useCallback(() => {
    fetchOverview();
    fetchWebhookInfo();
    fetchMetrics();
    fetchWebhookDeliveries();
  }, [fetchOverview, fetchWebhookInfo, fetchMetrics, fetchWebhookDeliveries]);

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
    if (!token) return;
    fetchMetrics();
    if (typeof window === 'undefined') return;
    const id = window.setInterval(() => {
      fetchMetrics();
    }, 10000);
    return () => window.clearInterval(id);
  }, [token, fetchMetrics]);

  useEffect(() => {
    if (!token) return;
    fetchWebhookDeliveries();
    if (typeof window === 'undefined') return;
    const id = window.setInterval(() => {
      fetchWebhookDeliveries();
    }, 8000);
    return () => window.clearInterval(id);
  }, [token, fetchWebhookDeliveries]);

  useEffect(() => {
    if (token && signalStrategy) {
      fetchSignals(signalStrategy);
    }
  }, [token, signalStrategy, fetchSignals]);

  useEffect(() => {
    const strategies = overview?.strategies || [];
    if (!strategies.length) return;
    if (signalStrategy && strategies.some((strategy) => strategy.id === signalStrategy)) {
      return;
    }
    setSignalStrategy(strategies[0].id);
  }, [overview, signalStrategy]);
  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gate-dark to-black text-gate-text p-6">
        <div className="max-w-md mx-auto">
          <Card title="관리자 로그인">
            <div className="bg-black/30 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 space-y-2 mb-4">
              <p>프론트엔드 주소 끝에 <span className="text-gate-primary">/admin</span>을 붙여 접속하면 UID 승인과 신호 전달을 한 화면에서 관리할 수 있습니다.</p>
              <p>웹훅 설정은 사용자에게 노출되지 않습니다. 어떤 전략에 웹훅을 보낼지 이 화면에서 결정하세요.</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">관리자 토큰</label>
                <input
                  type="password"
                  value={inputToken}
                  onChange={(event) => setInputToken(event.target.value)}
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
  const canGenerateWebhook = !webhookInfo?.url;
  const hasWebhook = Boolean(webhookInfo?.url);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gate-dark to-black text-gate-text p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <h1 className="text-2xl font-bold">관리자 콘솔</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
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

      {actionMessage && (
        <div className="mb-4 text-sm text-gate-text bg-gate-primary/10 border border-gate-primary/40 rounded px-3 py-2">
          {actionMessage}
        </div>
      )}

      {error && <div className="mb-4 text-sm text-red-400">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card title="등록된 사용자" className="text-center">
          <div className="text-3xl font-bold text-gate-primary">{totalUsers}</div>
          <div className="text-xs text-gray-400 mt-2">총 사용자 수</div>
        </Card>
        <Card title="승인 대기" className="text-center">
          <div className="text-3xl font-bold text-yellow-300">{pendingCount}</div>
          <div className="text-xs text-gray-400 mt-2">검토 대기</div>
        </Card>
        <Card title="승인 완료" className="text-center">
          <div className="text-3xl font-bold text-green-300">{approvedCount}</div>
          <div className="text-xs text-gray-400 mt-2">
            {overviewUpdatedAt ? `업데이트: ${new Date(overviewUpdatedAt).toLocaleString()}` : '업데이트 이력 없음'}
          </div>
        </Card>
        <Card title="실시간 상태" className="text-center space-y-2">
          <div>
            <div className="text-3xl font-bold text-blue-300">{metricsState?.visitors?.active ?? 0}</div>
            <div className="text-xs text-gray-400 mt-1">현재 접속자 수</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-purple-300">{metricsState?.signalRecipients?.active ?? 0}</div>
            <div className="text-xs text-gray-400 mt-1">신호 수신 중</div>
          </div>
          <div className="text-[11px] text-gray-500">
            최근 전달: {metricsState?.signalRecipients?.lastDeliveredCount ?? 0}명
          </div>
          <div
            className={`text-xs font-semibold ${
              metricsState?.webhook?.ready ? 'text-green-300' : 'text-red-300'
            }`}
          >
            {metricsState?.webhook?.ready ? '웹훅 대기 중' : '웹훅 준비 필요'}
          </div>
          {!metricsState?.webhook?.ready && metricsState?.webhook?.issues?.length ? (
            <ul className="text-[11px] text-gray-400 space-y-1">
              {metricsState.webhook?.issues?.map((issue) => (
                <li key={issue}>• {issue}</li>
              ))}
            </ul>
          ) : null}
          {metricsState?.googleSheets && (
            <div className="text-[11px] text-gray-500 space-y-1">
              <div>
                구글 시트:{' '}
                {metricsState.googleSheets.configured
                  ? metricsState.googleSheets.lastStatus
                  : '환경 변수 필요'}
              </div>
              {metricsState.googleSheets.lastSyncAt && (
                <div className="text-[10px] text-gray-600">
                  최근 기록: {new Date(metricsState.googleSheets.lastSyncAt).toLocaleString()}
                </div>
              )}
              {metricsState.googleSheets.lastError && (
                <div className="text-[10px] text-red-300 break-words">
                  {metricsState.googleSheets.lastError}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card title="트레이딩뷰 웹훅 URL" className="space-y-3">
          <p className="text-sm text-gray-300">
            트레이딩뷰 알림의 웹훅 주소로 사용하세요. 관리자 토큰이 유효한 동안만 동작합니다.
          </p>
          {webhookInfo?.url ? (
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  readOnly
                  value={webhookInfo.url}
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
                  {webhookCopied ? '복사됨' : 'URL 복사'}
                </button>
              </div>
              {webhookInfo.secret && (
                <div className="text-xs text-gray-500">비밀 키: {webhookInfo.secret}</div>
              )}
              {webhookInfo.updatedAt && (
                <div className="text-xs text-gray-500">마지막 변경: {new Date(webhookInfo.updatedAt).toLocaleString()}</div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-400 bg-black/30 border border-gray-700 rounded px-3 py-2">
              아직 웹훅이 생성되지 않았습니다. 아래 버튼을 눌러 새 URL을 발급하세요.
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs text-gray-400">웹훅 기본 도메인 (옵션)</label>
            <input
              type="text"
              value={webhookBaseOverride}
              onChange={(event) => setWebhookBaseOverride(event.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-xs font-mono"
              placeholder="https://your-domain.com"
            />
            <p className="text-[11px] text-gray-500">값을 입력하면 해당 도메인에 /webhook 경로를 붙여 URL을 발급합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => (canGenerateWebhook ? generateWebhook() : generateWebhook({ force: true }))}
              disabled={webhookLoading}
              className={`px-4 py-2 rounded text-sm font-semibold ${
                webhookLoading
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gate-primary text-black hover:bg-green-500 transition'
              }`}
            >
              {canGenerateWebhook ? 'URL 생성' : 'URL 재발급'}
            </button>
            <button
              onClick={() => fetchWebhookInfo()}
              disabled={webhookLoading}
              className={`px-4 py-2 rounded text-sm border border-gray-600 hover:bg-gray-800 transition ${
                webhookLoading ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              상태 새로고침
            </button>
          </div>
          {hasWebhook && (
            <div className="text-xs text-gray-400 bg-black/30 border border-gray-700 rounded px-3 py-2">
              도메인을 바꾸거나 새 URL이 필요하면 위 입력에 원하는 도메인을 적고 ‘URL 재발급’을 눌러주세요.
            </div>
          )}
          {webhookStatus && <div className="text-xs text-gray-300">{webhookStatus}</div>}
        </Card>

        <Card title="웹훅 전달 전략 선택" className="space-y-3">
          <p className="text-sm text-gray-300">
            체크된 전략만 웹훅으로 전달됩니다. 이 목록으로 지표 신호 수신 대상을 제어하세요.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            {(overview?.strategies || []).map((strategy) => {
              const checked = webhookTargets.includes(strategy.id);
              return (
                <label
                  key={strategy.id}
                  className={`flex items-center gap-2 px-3 py-2 border rounded cursor-pointer ${
                    checked ? 'border-gate-primary bg-gate-primary/10 text-gate-text' : 'border-gray-700 text-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-gate-primary"
                    checked={checked}
                    onChange={() => toggleWebhookTarget(strategy.id)}
                  />
                  {strategy.name}
                </label>
              );
            })}
            {(overview?.strategies || []).length === 0 && (
              <div className="text-gray-500">등록된 전략이 없습니다.</div>
            )}
          </div>
          <button
            onClick={saveWebhookTargets}
            disabled={webhookSaving}
            className={`px-4 py-2 rounded text-sm font-semibold ${
              webhookSaving
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gate-primary text-black hover:bg-green-500 transition'
            }`}
          >
            선택 저장
          </button>
        </Card>

        <Card title="최근 웹훅 전달 현황" className="space-y-3">
          <p className="text-sm text-gray-300">
            TradingView에서 들어온 최신 신호가 어떤 UID로 전달되었는지 확인할 수 있습니다.
          </p>
          {webhookDeliveries.length === 0 ? (
            <div className="text-xs text-gray-400 bg-black/30 border border-gray-700 rounded px-3 py-2">
              아직 저장된 웹훅 전달 기록이 없습니다. TradingView에서 웹훅을 호출하면 이곳에 표시됩니다.
            </div>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {webhookDeliveries.map((delivery) => (
                <div key={delivery.id} className="bg-black/40 border border-gray-700 rounded px-3 py-2 text-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-gray-400 gap-1">
                    <span>{new Date(delivery.timestamp).toLocaleString()}</span>
                    <span className="text-gray-300">전달 {delivery.delivered}명{typeof delivery.autoTradingDelivered === 'number' ? ` (AUTO ${delivery.autoTradingDelivered})` : ''}</span>
                  </div>
                  <div className="text-sm font-semibold text-gate-text mt-1">
                    {(delivery.indicator || delivery.strategyName || delivery.strategyId || '미지정 전략')}{' '}
                    · {delivery.symbol || '-'} · {(delivery.action || '-').toUpperCase()} {(delivery.side || '-').toUpperCase()}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {delivery.recipients.length === 0 ? (
                      <span className="text-xs text-gray-500">승인된 UID가 없어 전달되지 않았습니다.</span>
                    ) : (
                      delivery.recipients.map((recipient) => (
                        <span
                          key={`${delivery.id}-${recipient.uid}`}
                          className={`px-2 py-1 text-xs rounded border ${
                            recipient.approved
                              ? 'border-gate-primary text-gate-primary bg-gate-primary/5'
                              : 'border-gray-600 text-gray-300'
                          }`}
                        >
                          UID {recipient.uid}
                          <span className="ml-1 text-[10px] text-gray-400">({recipient.status})</span>
                          {recipient.autoTradingEnabled && (
                            <span className="ml-1 text-[10px] text-green-300">AUTO</span>
                          )}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="트레이딩뷰 웹훅 JSON 예시" className="space-y-3">
          <p className="text-sm text-gray-300">
            트레이딩뷰 알림 메시지에는 아래 형식의 JSON을 사용하면 서버가 지표, 심볼, 방향 정보를 정확히 파싱합니다.
          </p>
          <pre className="bg-black/40 border border-gray-700 rounded p-3 text-xs text-gray-200 overflow-x-auto">
{`{
  "indicator": "{{strategy.name}}",
  "symbol": "{{ticker}}",
  "action": "open",
  "side": "long"
}`}
          </pre>
          <div className="text-xs text-gray-400 space-y-1">
            <p>direction 조합 예시:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>롱 진입: <code className="bg-gray-900 px-1 py-0.5 rounded border border-gray-700">"action": "open", "side": "long"</code></li>
              <li>롱 청산: <code className="bg-gray-900 px-1 py-0.5 rounded border border-gray-700">"action": "close", "side": "long"</code></li>
              <li>숏 진입: <code className="bg-gray-900 px-1 py-0.5 rounded border border-gray-700">"action": "open", "side": "short"</code></li>
              <li>숏 청산: <code className="bg-gray-900 px-1 py-0.5 rounded border border-gray-700">"action": "close", "side": "short"</code></li>
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="전략 관리" className="space-y-4">
          <form onSubmit={addStrategy} className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={newStrategyName}
              onChange={(event) => setNewStrategyName(event.target.value)}
              placeholder="전략 이름"
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded"
            />
            <input
              type="text"
              value={newStrategyDesc}
              onChange={(event) => setNewStrategyDesc(event.target.value)}
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
                    전환
                  </button>
                </div>
              </div>
            ))}
            {(overview?.strategies || []).length === 0 && (
              <div className="text-sm text-gray-500">전략이 없습니다.</div>
            )}
          </div>
        </Card>

        <Card title="웹훅 신호 모니터">
          <div className="flex items-center gap-3 mb-3">
            <select
              value={signalStrategy}
              onChange={(event) => setSignalStrategy(event.target.value)}
              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded"
            >
              {(overview?.strategies || []).map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name} ({strategy.id})
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
          {metricsState?.webhook?.lastSignal && (
            <div className="mb-2 text-xs text-gray-400">
              마지막 웹훅: {new Date(metricsState.webhook.lastSignal.timestamp).toLocaleString()} ·{' '}
              {metricsState.webhook.lastSignal.indicator || metricsState.webhook.lastSignal.strategyName || '-'} ·{' '}
              {metricsState.webhook.lastSignal.symbol || '-'} ·{' '}
              {(metricsState.webhook.lastSignal.action || '-').toUpperCase()}{' '}
              {(metricsState.webhook.lastSignal.side || '-').toUpperCase()} · 전달{' '}
              {metricsState.webhook.lastSignal.delivered}명{typeof metricsState.webhook.lastSignal.autoTradingDelivered === 'number' ? ` (AUTO ${metricsState.webhook.lastSignal.autoTradingDelivered})` : ''}
            </div>
          )}
          <div className="max-h-64 overflow-y-auto space-y-2 text-sm">
            {signals.length === 0 ? (
              <div className="text-gray-500">아직 수신된 웹훅 신호가 없습니다.</div>
            ) : (
              signals.map((signal) => (
                <div key={signal.id} className="bg-black/40 border border-gray-700 rounded px-3 py-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{new Date(signal.timestamp).toLocaleString()}</span>
                    <span>{signal.status}</span>
                  </div>
                  <div className="text-sm font-semibold">
                    {strategyNameMap.get(signal.strategyId || '') || signal.strategyId || '알 수 없는 전략'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {signal.symbol || '---'} · {signal.action} {signal.side} · indicator={signal.indicator || '-'} · size=
                    {signal.size ?? '-'} · leverage={signal.leverage ?? '-'}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
        <div className="xl:col-span-2">
          <LogsCard />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="승인 대기 UID" className="space-y-3">
          {pendingUsers.length === 0 ? (
            <div className="text-sm text-gray-500">승인을 기다리는 사용자가 없습니다.</div>
          ) : (
            pendingUsers.map((user) => (
              <div key={user.uid} className="bg-black/40 border border-gray-700 rounded px-3 py-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="font-semibold break-all">UID: {user.uid}</div>
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
              </div>
            ))
          )}
        </Card>

        <div className="space-y-6">
          <Card title="승인된 사용자" className="space-y-2 max-h-64 overflow-y-auto">
            {approvedUsers.length === 0 ? (
              <div className="text-sm text-gray-500">승인된 사용자가 없습니다.</div>
            ) : (
              approvedUsers.map((user) => {
                const approvedSet = new Set(user.approvedStrategies || []);
                const receivingNames = (user.approvedStrategies || []).map(
                  (id) => strategyNameMap.get(id) ?? id,
                );
                const blockedNames = (overview?.strategies || [])
                  .filter((strategy) => !approvedSet.has(strategy.id))
                  .map((strategy) => strategy.name ?? strategy.id);
                return (
                  <div
                    key={user.uid}
                    className="bg-black/40 border border-gray-700 rounded px-3 py-2 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-semibold break-all">{user.uid}</div>
                        <div className="text-xs text-gray-400">액세스 키: {user.accessKey || '-'}</div>
                      </div>
                      <button
                        onClick={() => deleteUser(user.uid)}
                        className="px-3 py-1 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-500 transition"
                      >
                        사용자 삭제
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">
                      수신 중 전략:{' '}
                      <span className={receivingNames.length ? 'text-green-300' : 'text-gray-400'}>
                        {receivingNames.length ? receivingNames.join(', ') : '없음'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      차단된 전략:{' '}
                      <span className={blockedNames.length ? 'text-red-300' : 'text-gray-400'}>
                        {blockedNames.length ? blockedNames.join(', ') : '없음'}
                      </span>
                    </div>
                    {user.approvedAt && (
                      <div className="text-xs text-gray-600">승인 일시: {new Date(user.approvedAt).toLocaleString()}</div>
                    )}
                  </div>
                );
              })
            )}
          </Card>

          <Card title="거절된 사용자" className="space-y-2 max-h-64 overflow-y-auto">
            {deniedUsers.length === 0 ? (
              <div className="text-sm text-gray-500">거절된 사용자가 없습니다.</div>
            ) : (
              deniedUsers.map((user) => (
                <div key={user.uid} className="bg-black/40 border border-gray-700 rounded px-3 py-2">
                  <div className="font-semibold">{user.uid}</div>
                  <div className="text-xs text-gray-500">최종 상태 업데이트: {user.updatedAt ? new Date(user.updatedAt).toLocaleString() : '-'}</div>
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
