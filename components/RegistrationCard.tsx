import React, { useEffect, useMemo, useState } from 'react';
import Card from './Card';

interface Strategy {
  id: string;
  name: string;
  description?: string;
  active?: boolean;
}

interface UserStatusResponse {
  status: 'not_registered' | 'pending' | 'approved' | 'denied' | string;
  requestedStrategies?: { id: string; name: string }[];
  approvedStrategies?: { id: string; name: string }[];
  accessKey?: string;
}

const RegistrationCard: React.FC = () => {
  const [uid, setUid] = useState(() => localStorage.getItem('user_uid') || '');
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
  const [loading, setLoading] = useState(false);

  const accessKey = useMemo(() => (statusInfo?.status === 'approved' ? statusInfo.accessKey : null), [statusInfo]);

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
    if (!uid) return;
    let stopped = false;
    const poll = async () => {
      try {
        const url = `/api/user/status?uid=${encodeURIComponent(uid)}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data: UserStatusResponse = await res.json();
        if (!stopped) {
          setStatusInfo(data);
          if (data.status === 'approved' && data.accessKey) {
            localStorage.setItem('user_access_key', data.accessKey);
          }
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
  }, [uid]);

  useEffect(() => {
    if (uid) {
      localStorage.setItem('user_uid', uid);
    }
  }, [uid]);

  useEffect(() => {
    localStorage.setItem('user_requested_strategies', JSON.stringify(selected));
  }, [selected]);

  const submitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (!uid.trim()) {
      setMessage('UID를 입력해주세요.');
      return;
    }
    if (!selected.length) {
      setMessage('최소 한 개 이상의 전략을 선택해주세요.');
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: uid.trim(), strategies: selected })
      });
      if (!res.ok) {
        setMessage('등록에 실패했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      const data = await res.json();
      if (data && data.status) {
        setStatusInfo((prev) => ({ ...(prev || {}), status: data.status }));
      }
      setMessage('등록 요청을 전송했습니다. 승인을 기다려주세요.');
    } catch (err) {
      console.error(err);
      setMessage('요청 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const toggleStrategy = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      return [...prev, id];
    });
  };

  const statusLabel = (() => {
    switch (statusInfo?.status) {
      case 'approved':
        return '승인됨';
      case 'pending':
        return '승인 대기 중';
      case 'denied':
        return '거절됨';
      case 'not_registered':
        return '등록되지 않음';
      default:
        return statusInfo?.status || '미등록';
    }
  })();

  return (
    <Card title="사용자 등록" className="mb-5">
      <form onSubmit={submitRegistration} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">UID</label>
          <input
            type="text"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            placeholder="Gate.io UID"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-2">구독할 전략 선택</label>
          <div className="flex flex-wrap gap-2">
            {strategies.map((strategy) => (
              <label
                key={strategy.id}
                className={`px-3 py-2 border rounded cursor-pointer text-sm flex items-center gap-2 ${
                  selected.includes(strategy.id) ? 'border-gate-primary bg-gate-primary/10' : 'border-gray-700'
                }`}
              >
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
              <div className="text-xs text-gray-500">등록 가능한 전략이 없습니다.</div>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-gate-primary text-black rounded hover:bg-green-500 transition disabled:opacity-60"
        >
          등록 요청
        </button>
        {message && <div className="text-sm text-gray-300">{message}</div>}
      </form>
      <div className="mt-4 text-sm">
        <div>현재 상태: <span className="font-semibold">{statusLabel}</span></div>
        {accessKey && (
          <div className="text-xs text-gray-400 mt-1">접근 키: {accessKey}</div>
        )}
        {statusInfo?.approvedStrategies && statusInfo.approvedStrategies.length > 0 && (
          <div className="text-xs text-gray-400 mt-1">
            승인된 전략: {statusInfo.approvedStrategies.map((s) => s.name).join(', ')}
          </div>
        )}
      </div>
    </Card>
  );
};

export default RegistrationCard;
