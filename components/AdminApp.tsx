import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [selectionMap, setSelectionMap] = useState<Record<string, string[]>>({});
  const [overviewUpdatedAt, setOverviewUpdatedAt] = useState<number | null>(null);

  const initialTargets = loadInitialWebhookTargets();
  const [webhookTargets, setWebhookTargets] = useState<string[]>(initialTargets.list);
  const webhookTargetsLoadedFromStorage = useRef(initialTargets.fromStorage);

  const [webhookInfo, setWebhookInfo] = useState<AdminWebhookInfo | null>(null);
  const [webhookStatus, setWebhookStatus] = useState('');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [webhookSaving, setWebhookSaving] = useState(false);

  const [editingUser, setEditingUser] = useState<string | null>(null);
  const editingUidRef = useRef<string | null>(null);
  const [savingUser, setSavingUser] = useState<string | null>(null);

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
    editingUidRef.current = editingUser;
  }, [editingUser]);

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
    setSelectionMap({});
    setSignalStrategy('');
    setOverviewUpdatedAt(null);
    setWebhookInfo(null);
    setWebhookStatus('');
    setWebhookLoading(false);
    setWebhookCopied(false);
    setWebhookSaving(false);
    setEditingUser(null);
    editingUidRef.current = null;
    setSavingUser(null);
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
          setError('The admin token is no longer valid.');
          resetAdminState();
          return null;
        }
        if (!res.ok) {
          setError('Failed to load the latest admin data.');
          return null;
        }
        const data: OverviewResponse = await res.json();
        setOverview(data);
        setOverviewUpdatedAt(Date.now());

        const nextSelection: Record<string, string[]> = {};
        data.users.forEach((user) => {
          const base = user.approvedStrategies && user.approvedStrategies.length
            ? user.approvedStrategies
            : user.requestedStrategies || [];
          nextSelection[user.uid] = base.slice();
        });
        setSelectionMap((prev) => {
          const merged: Record<string, string[]> = { ...prev };
          Object.entries(nextSelection).forEach(([uid, strategies]) => {
            if (editingUidRef.current === uid) {
              return;
            }
            merged[uid] = strategies;
          });
          return merged;
        });
        return data;
      } catch (err) {
        console.error(err);
        setError('An unexpected error occurred while loading admin data.');
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
          setError('The admin token is no longer valid.');
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

  const fetchWebhookInfo = useCallback(
    async (overrideToken?: string): Promise<AdminWebhookInfo | null> => {
      const authToken = overrideToken ?? token;
      if (!authToken) return null;
      try {
        setWebhookLoading(true);
        setWebhookStatus('');
        const res = await fetch(buildAdminUrl('/webhook'), { headers: buildHeaders(authToken) });
        if (res.status === 401) {
          setError('The admin token is no longer valid.');
          resetAdminState();
          return null;
        }
        if (res.status === 404) {
          setWebhookInfo(null);
          setWebhookStatus('No webhook is registered yet. Generate a new one below.');
          return null;
        }
        if (!res.ok) {
          setWebhookStatus('Unable to load the webhook details.');
          return null;
        }
        const data: AdminWebhookInfo = await res.json();
        setWebhookInfo(data);
        return data;
      } catch (err) {
        console.error(err);
        setWebhookStatus('Unable to load the webhook details.');
        return null;
      } finally {
        setWebhookLoading(false);
      }
    },
    [token, buildAdminUrl, buildHeaders, resetAdminState],
  );

  const generateWebhook = useCallback(async () => {
    if (!token) return;
    try {
      setWebhookLoading(true);
      setWebhookStatus('');
      const res = await fetch(buildAdminUrl('/webhook'), {
        method: 'POST',
        headers: buildHeaders(),
      });
      if (res.status === 401) {
        setError('The admin token is no longer valid.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setWebhookStatus('Failed to generate the webhook URL.');
        return;
      }
      const data: AdminWebhookInfo = await res.json();
      setWebhookInfo(data);
      setActionMessage('Generated a new webhook URL.');
    } catch (err) {
      console.error(err);
      setWebhookStatus('Failed to generate the webhook URL.');
    } finally {
      setWebhookLoading(false);
    }
  }, [token, buildAdminUrl, buildHeaders, resetAdminState]);

  const copyWebhookUrl = useCallback(async () => {
    if (!webhookInfo?.url) return;
    try {
      await navigator.clipboard.writeText(webhookInfo.url);
      setWebhookCopied(true);
      setActionMessage('Webhook URL copied to clipboard.');
      if (typeof window !== 'undefined') {
        window.setTimeout(() => setWebhookCopied(false), 1500);
      }
    } catch (err) {
      console.error(err);
      setWebhookStatus('Clipboard copy failed.');
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
        setError('The admin token is no longer valid.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setWebhookStatus('Could not save the selected strategies.');
        return;
      }
      setWebhookStatus('Webhook route selection saved.');
      setActionMessage('Updated webhook delivery targets.');
    } catch (err) {
      console.error(err);
      setWebhookStatus('Could not save the selected strategies.');
    } finally {
      setWebhookSaving(false);
    }
  };
  const toggleSelection = (uid: string, strategyId: string) => {
    setSelectionMap((prev) => {
      const current = new Set(prev[uid] || []);
      if (current.has(strategyId)) {
        current.delete(strategyId);
      } else {
        current.add(strategyId);
      }
      return { ...prev, [uid]: Array.from(current) };
    });
  };

  const approveUser = async (uid: string) => {
    const selected = selectionMap[uid] || [];
    if (selected.length === 0) {
      setError('Select at least one strategy before approving a user.');
      return;
    }
    try {
      setError('');
      const res = await fetch(buildAdminUrl('/users/approve'), {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ uid, strategies: selected }),
      });
      if (res.status === 401) {
        setError('The admin token is no longer valid.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('Failed to approve the user.');
        return;
      }
      setActionMessage('User approved.');
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('An error occurred while approving the user.');
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
        setError('The admin token is no longer valid.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('Failed to deny the user.');
        return;
      }
      setActionMessage('User denied.');
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('An error occurred while denying the user.');
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
        setError('The admin token is no longer valid.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('Failed to add the strategy.');
        return;
      }
      setNewStrategyName('');
      setNewStrategyDesc('');
      setActionMessage('Strategy added.');
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('An error occurred while adding the strategy.');
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
        setError('The admin token is no longer valid.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('Failed to change the strategy state.');
        return;
      }
      setActionMessage('Strategy state updated.');
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('An error occurred while changing the strategy state.');
    }
  };

  const startEditingUser = (user: AdminUser) => {
    setSelectionMap((prev) => ({
      ...prev,
      [user.uid]: user.approvedStrategies?.slice() || [],
    }));
    setEditingUser(user.uid);
  };

  const cancelEditingUser = () => {
    if (editingUser) {
      const snapshot = overview?.users.find((candidate) => candidate.uid === editingUser);
      if (snapshot) {
        setSelectionMap((prev) => ({
          ...prev,
          [editingUser]: snapshot.approvedStrategies?.slice() || [],
        }));
      }
    }
    setEditingUser(null);
  };

  const saveUserStrategies = async (uid: string) => {
    const selected = selectionMap[uid] || [];
    if (selected.length === 0) {
      setError('Select at least one strategy before saving changes.');
      return;
    }
    try {
      setSavingUser(uid);
      setError('');
      const res = await fetch(buildAdminUrl(`/users/${encodeURIComponent(uid)}/strategies`), {
        method: 'PATCH',
        headers: buildHeaders(),
        body: JSON.stringify({ strategies: selected }),
      });
      if (res.status === 401) {
        setError('The admin token is no longer valid.');
        resetAdminState();
        return;
      }
      if (!res.ok) {
        setError('Could not update the user strategies.');
        return;
      }
      setActionMessage('User strategies updated.');
      setEditingUser(null);
      await fetchOverview();
    } catch (err) {
      console.error(err);
      setError('An error occurred while updating the user strategies.');
    } finally {
      setSavingUser(null);
    }
  };
  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputToken.trim()) {
      setError('Enter the administrator token before signing in.');
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
  };

  const handleLogout = () => {
    resetAdminState();
  };

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
    if (signalStrategy && strategies.some((strategy) => strategy.id === signalStrategy)) {
      return;
    }
    setSignalStrategy(strategies[0].id);
  }, [overview, signalStrategy]);
  if (!authorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gate-dark to-black text-gate-text p-6">
        <div className="max-w-md mx-auto">
          <Card title="Admin sign-in">
            <div className="bg-black/30 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 space-y-2 mb-4">
              <p>Add <span className="text-gate-primary">/admin</span> to the front-end URL, sign in with the administrator token, and manage UID approvals plus signal delivery from a single console.</p>
              <p>Webhook configuration is no longer exposed to members. Decide which strategies receive webhook updates right here.</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm mb-1">Administrator token</label>
                <input
                  type="password"
                  value={inputToken}
                  onChange={(event) => setInputToken(event.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
                  placeholder="ADMIN_SECRET value"
                />
              </div>
              {error && <div className="text-sm text-red-400">{error}</div>}
              <button
                type="submit"
                className="w-full py-2 bg-gate-primary text-black rounded font-semibold hover:bg-green-500 transition"
              >
                Sign in
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
        <h1 className="text-2xl font-bold">Admin Console</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchOverview()}
            className="px-3 py-1 bg-gate-primary text-black rounded hover:bg-green-500 transition"
            disabled={loading}
          >
            Refresh
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
          >
            Log out
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="mb-4 text-sm text-gate-text bg-gate-primary/10 border border-gate-primary/40 rounded px-3 py-2">
          {actionMessage}
        </div>
      )}

      {error && <div className="mb-4 text-sm text-red-400">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card title="Registered users" className="text-center">
          <div className="text-3xl font-bold text-gate-primary">{totalUsers}</div>
          <div className="text-xs text-gray-400 mt-2">Total users</div>
        </Card>
        <Card title="Pending approvals" className="text-center">
          <div className="text-3xl font-bold text-yellow-300">{pendingCount}</div>
          <div className="text-xs text-gray-400 mt-2">Waiting for review</div>
        </Card>
        <Card title="Approved users" className="text-center">
          <div className="text-3xl font-bold text-green-300">{approvedCount}</div>
          <div className="text-xs text-gray-400 mt-2">
            {overviewUpdatedAt ? `Updated ${new Date(overviewUpdatedAt).toLocaleString()}` : 'No update timestamp'}
          </div>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card title="Unique webhook URL" className="space-y-3">
          <p className="text-sm text-gray-300">
            Use this URL inside TradingView alerts. It is only valid while the administrator token is active.
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
                  {webhookCopied ? 'Copied' : 'Copy URL'}
                </button>
              </div>
              {webhookInfo.secret && (
                <div className="text-xs text-gray-500">Secret: {webhookInfo.secret}</div>
              )}
              {webhookInfo.updatedAt && (
                <div className="text-xs text-gray-500">Last changed: {new Date(webhookInfo.updatedAt).toLocaleString()}</div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-400 bg-black/30 border border-gray-700 rounded px-3 py-2">
              A webhook has not been generated yet. Use the button below to create one.
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
              Generate new URL
            </button>
            <button
              onClick={() => fetchWebhookInfo()}
              disabled={webhookLoading}
              className={`px-4 py-2 rounded text-sm border border-gray-600 hover:bg-gray-800 transition ${
                webhookLoading ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              Reload status
            </button>
          </div>
          {webhookStatus && <div className="text-xs text-gray-300">{webhookStatus}</div>}
        </Card>

        <Card title="Select strategies for webhook delivery" className="space-y-3">
          <p className="text-sm text-gray-300">
            Only the strategies checked here will be forwarded through the webhook feed. Use this list to control who receives indicator signals.
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
              <div className="text-gray-500">No strategies are registered yet.</div>
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
            Save selection
          </button>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Strategy catalog" className="space-y-4">
          <form onSubmit={addStrategy} className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              value={newStrategyName}
              onChange={(event) => setNewStrategyName(event.target.value)}
              placeholder="Strategy name"
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded"
            />
            <input
              type="text"
              value={newStrategyDesc}
              onChange={(event) => setNewStrategyDesc(event.target.value)}
              placeholder="Description (optional)"
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded"
            />
            <button
              type="submit"
              disabled={addingStrategy}
              className="px-3 py-2 bg-gate-primary text-black rounded hover:bg-green-500 transition disabled:opacity-60"
            >
              Add
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
                    {strategy.active !== false ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => toggleStrategyActive(strategy)}
                    className="text-xs px-2 py-1 border border-gray-500 rounded hover:bg-gray-700"
                  >
                    Toggle
                  </button>
                </div>
              </div>
            ))}
            {(overview?.strategies || []).length === 0 && (
              <div className="text-sm text-gray-500">No strategies found.</div>
            )}
          </div>
        </Card>

        <Card title="Webhook signal monitor">
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
              Reload
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2 text-sm">
            {signals.length === 0 ? (
              <div className="text-gray-500">No webhook signals yet.</div>
            ) : (
              signals.map((signal) => (
                <div key={signal.id} className="bg-black/40 border border-gray-700 rounded px-3 py-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{new Date(signal.timestamp).toLocaleString()}</span>
                    <span>{signal.status}</span>
                  </div>
                  <div className="text-sm font-semibold">
                    {strategyNameMap.get(signal.strategyId || '') || signal.strategyId || 'Unknown strategy'}
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
        <Card title="Pending UID requests" className="space-y-3">
          {pendingUsers.length === 0 ? (
            <div className="text-sm text-gray-500">No users waiting for approval.</div>
          ) : (
            pendingUsers.map((user) => (
              <div key={user.uid} className="bg-black/40 border border-gray-700 rounded px-3 py-3 space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold">UID: {user.uid}</div>
                    <div className="text-xs text-gray-500">Requested strategies: {(user.requestedStrategies || []).join(', ') || '-'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveUser(user.uid)}
                      className="px-3 py-1 bg-gate-primary text-black rounded hover:bg-green-500 transition"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => denyUser(user.uid)}
                      className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                    >
                      Deny
                    </button>
                  </div>
                </div>
                <div className="text-xs text-gray-400">Select strategies:</div>
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
          <Card title="Approved users" className="space-y-2 max-h-64 overflow-y-auto">
            {approvedUsers.length === 0 ? (
              <div className="text-sm text-gray-500">No approved users yet.</div>
            ) : (
              approvedUsers.map((user) => {
                const isEditing = editingUser === user.uid;
                const currentSelection = selectionMap[user.uid] || [];
                return (
                  <div
                    key={user.uid}
                    className={`bg-black/40 border border-gray-700 rounded px-3 py-2 space-y-2 ${
                      isEditing ? 'border-gate-primary/60' : ''
                    }`}
                  >
                    <div className="font-semibold">{user.uid}</div>
                    <div className="text-xs text-gray-400">Access key: {user.accessKey || '-'}</div>
                    <div className="text-xs text-gray-500">Strategies: {(user.approvedStrategies || []).join(', ') || '-'}</div>
                    {user.approvedAt && (
                      <div className="text-xs text-gray-600">Approved: {new Date(user.approvedAt).toLocaleString()}</div>
                    )}

                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-400">Select strategies:</div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {(overview?.strategies || []).map((strategy) => (
                            <label
                              key={`${user.uid}-edit-${strategy.id}`}
                              className="flex items-center gap-1 bg-gray-900 border border-gray-700 px-2 py-1 rounded"
                            >
                              <input
                                type="checkbox"
                                checked={currentSelection.includes(strategy.id)}
                                onChange={() => toggleSelection(user.uid, strategy.id)}
                              />
                              {strategy.name}
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveUserStrategies(user.uid)}
                            disabled={savingUser === user.uid}
                            className={`px-3 py-1 bg-gate-primary text-black rounded text-xs font-semibold ${
                              savingUser === user.uid ? 'opacity-60 cursor-not-allowed' : 'hover:bg-green-500 transition'
                            }`}
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEditingUser}
                            className="px-3 py-1 border border-gray-600 rounded text-xs hover:bg-gray-800 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditingUser(user)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Edit strategies
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </Card>

          <Card title="Denied users" className="space-y-2 max-h-64 overflow-y-auto">
            {deniedUsers.length === 0 ? (
              <div className="text-sm text-gray-500">No denied users.</div>
            ) : (
              deniedUsers.map((user) => (
                <div key={user.uid} className="bg-black/40 border border-gray-700 rounded px-3 py-2">
                  <div className="font-semibold">{user.uid}</div>
                  <div className="text-xs text-gray-500">Last status update: {user.updatedAt ? new Date(user.updatedAt).toLocaleString() : '-'}</div>
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
