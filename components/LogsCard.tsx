import React, { useState, useEffect, useRef } from 'react';
import Card from './Card';

interface LogEntry {
  id: string | number;
  timestamp: string;
  message: string;
  level: string;
}

const LogsCard: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // API에서 로그 가져오기
  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/logs');
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      }
    } catch (error) {
      console.error('로그 가져오기 실패:', error);
    }
  };

  // 자동 스크롤 (로그 컨테이너 내에서만)
  const scrollToBottom = () => {
    if (isAutoScroll && logsEndRef.current) {
      const logContainer = logsEndRef.current.parentElement;
      if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    }
  };

  // 컴포넌트 마운트 시 로그 가져오기 및 주기적 갱신
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000); // 2초마다 갱신

    return () => clearInterval(interval);
  }, []);

  // 로그가 업데이트될 때마다 스크롤
  useEffect(() => {
    scrollToBottom();
  }, [logs, isAutoScroll]);

  // 로그 클리어
  const clearLogs = () => {
    setLogs([]);
  };

  // 시간 포맷팅
  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('ko-KR', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
    } catch {
      return timestamp;
    }
  };

  // 로그 메시지 색상 결정
  const getLogColor = (message: string) => {
    if (message.includes('WEBHOOK') || message.includes('웹훅')) {
      return 'text-blue-400';
    }
    if (message.includes('ERROR') || message.includes('오류') || message.includes('실패')) {
      return 'text-red-400';
    }
    if (message.includes('성공') || message.includes('완료')) {
      return 'text-green-400';
    }
    if (message.includes('API') || message.includes('인증')) {
      return 'text-yellow-400';
    }
    return 'text-gray-300';
  };

  return (
    <Card title="실시간 로그" className="h-96">
      <div className="flex flex-col h-full">
        {/* 제어 버튼 */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400">
              총 {logs.length}개 로그
            </span>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-400">실시간</span>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setIsAutoScroll(!isAutoScroll)}
              className={`px-2 py-1 text-xs rounded ${
                isAutoScroll 
                  ? 'bg-gate-primary text-white' 
                  : 'bg-gray-600 text-gray-300'
              }`}
            >
              자동스크롤
            </button>
            <button
              onClick={clearLogs}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
            >
              클리어
            </button>
            <button
              onClick={fetchLogs}
              className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              새로고침
            </button>
          </div>
        </div>

        {/* 로그 표시 영역 */}
        <div className="flex-1 bg-black rounded-lg p-3 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              아직 로그가 없습니다.
              <br />
              웹훅을 전송하거나 API를 호출해보세요.
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className="flex space-x-2">
                  <span className="text-gray-500 shrink-0">
                    {formatTime(log.timestamp)}
                  </span>
                  <span className={`break-all ${getLogColor(log.message)}`}>
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

        {/* 상태 표시 */}
        <div className="mt-2 text-xs text-gray-500 text-center">
          마지막 업데이트: {new Date().toLocaleTimeString('ko-KR')}
        </div>
      </div>
    </Card>
  );
};

export default LogsCard;