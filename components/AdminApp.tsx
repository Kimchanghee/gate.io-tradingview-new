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

const AdminApp: React.FC = () => {
  const [token, setToken] = useState(() => localStorage.getItem('admin_token') || '');
  const [inputToken, setInputToken] = useState('');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signalStrategy, setSignalStrategy] = useState('default');
  const [signals, setSignals] = useState<AdminSignal[]>([]);
  const [addingStrategy, setAddingStrategy] = useState(false);
  const [newStrategyName, setNewStrategyName] = useState('');
  const [newStrategyDesc, setNewStrategyDesc] = useState('');
  const [selectionMap, setSelectionMap] = useState<Record<string, string[]>>({});

  const authorized = useMemo(() => Boolean(token), [token]);

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

  const fetchOverview = useCallback(
    async (overrideToken?: string): Promise<OverviewResponse | null> => {
      const authToken = overrideToken ?? token;
      if (!authToken) return null;
      try {
        setLoading(true);
        setError('');
        const res = await fetch('/api/admin/overview', { headers: buildHeaders(authToken) });
        if (res.status === 401) {
          setError('관리자 토큰이 유효하지 않습니다.');
          setToken('');
          localStorage.removeItem('admin_token');
          setOverview(null);
          setSignals([]);
          setSelectionMap({});
          return null;
        }
        if (!res.ok) {
          setError('관리자 데이터를 불러오지 못했습니다.');
          return null;
        }
        const data: OverviewResponse = await res.json();
        setOverview(data);
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
    [token, buildHeaders]
  );

  const fetchSignals = useCallback(
    async (strategyId: string, overrideToken?: string): Promise<void> => {
      const authToken = overrideToken ?? token;
      if (!authToken || !strategyId) return;
      try {
        const url = `/api/admin/signals?strategy=${encodeURIComponent(strategyId)}`;
        const res = await fetch(url, { headers: buildHeaders(authToken) });
        if (res.status === 401) {
          setError('세션이 만료되었습니다. 다시 로그인해주세요.');
          setToken('');
          localStorage.removeItem('admin_token');
          setOverview(null);
          setSignals([]);
          setSelectionMap({});
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setSignals(Array.isArray(data.signals) ? data.signals.slice().reverse() : []);
        }
      } catch (err) {
        console.error(err);
      }
    },
    [token, buildHeaders]
  );

  useEffect(() => {
    if (!token) return;
    fetchOverview();
    const id = window.setInterval(fetchOverview, 15000);
    return () => window.clearInterval(id);
  }, [token, fetchOverview]);

  useEffect(() => {
    if (token) fetchSignals(signalStrategy);
  }, [token, signalStrategy, fetchSignals]);

  useEffect(() => {
    if (!overview?.strategies?.length) return;
    const exists = overview.strategies.some((s) => s.id === signalStrategy);
    if (!exists) {
      setSignalStrategy(overview.strategies[0].id);
    }
  }, [overview, signalStrategy]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputToken.trim()) {
      setError('토큰을 입력해주세요.');
      return;
    }
    const authToken = inputToken.trim();
    localStorage.setItem('admin_token', authToken);
    setToken(authToken);
    setInputToken('');
    const latestOverview = await fetchOverview(authToken);
    const strategies = latestOverview?.strategies || overview?.strategies || [];
    if (strategies.length) {
      const nextStrategy = strategies.some((s) => s.id === signalStrategy)
        ? signalStrategy
        : strategies[0].id;
      setSignalStrategy(nextStrategy);
      await fetchSignals(nextStrategy, authToken);
    } else {
      await fetchSignals(signalStrategy, authToken);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setToken('');
    setOverview(null);
    setSignals([]);
    setSelectionMap({});
    setSignalStrategy('default');
    setError('');
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
      const res = await fetch('/api/admin/users/approve', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ uid, strategies: selected })
      });
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
      const res = await fetch('/api/admin/users/deny', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ uid })
      });
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
      const res = await fetch('/api/admin/strategies', {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ name: newStrategyName.trim(), description: newStrategyDesc.trim() })
      });
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
      const res = await fetch(`/api/admin/strategies/${strategy.id}`, {
        method: 'PATCH',
        headers: buildHeaders(),
        body: JSON.stringify({ active: strategy.active === false })
      });
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

  const pendingUsers = (overview?.users || []).filter((u) => u.status === 'pending');
  const approvedUsers = (overview?.users || []).filter((u) => u.status === 'approved');
  const deniedUsers = (overview?.users || []).filter((u) => u.status === 'denied');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gate-dark to-black text-gate-text p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">관리자 콘솔</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchOverview}
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

      {error && <div className="mb-4 text-red-400 text-sm">{error}</div>}

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
                  <div className="text-sm font-semibold">{signal.symbol || '---'} ({signal.strategyId})</div>
                  <div className="text-xs text-gray-500">
                    {signal.action} {signal.side} size={signal.size ?? '-'} leverage={signal.leverage ?? '-'}
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
