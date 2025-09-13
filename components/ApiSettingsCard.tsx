import React, { useState } from 'react';
import Card from './Card';

interface AccountInfo {
  total: number;
  available: number;
  positionMargin: number;
  orderMargin: number;
  unrealisedPnl: number;
  currency: string;
}

interface Position {
  contract: string;
  size: number;
  side: string;
  leverage: number;
  margin: number;
  pnl: number;
  pnlPercentage: number;
  entryPrice: number;
  markPrice: number;
}

const ApiSettingsCard: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isTestnet, setIsTestnet] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);

  const handleConnect = async () => {
    if (!apiKey || !apiSecret) {
      setConnectionStatus('API 키와 시크릿을 입력해주세요');
      return;
    }

    setIsConnecting(true);
    setConnectionStatus('');

    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          apiSecret,
          isTestnet,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        setIsConnected(true);
        setConnectionStatus(result.message);
        setAccount(result.account);
        setPositions(result.positions || []);
      } else {
        setIsConnected(false);
        setConnectionStatus(result.message);
      }
    } catch (error) {
      setIsConnected(false);
      setConnectionStatus('연결 중 오류가 발생했습니다');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setConnectionStatus('');
    setAccount(null);
    setPositions([]);
    setApiKey('');
    setApiSecret('');
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(num);
  };

  const formatCurrency = (num: number, currency = 'USDT') => {
    return `${formatNumber(num)} ${currency}`;
  };

  return (
    <Card title="Gate.io API 설정" className="space-y-4">
      {!isConnected ? (
        // API 설정 화면
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gate-text mb-2">
              API Key
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 bg-gate-secondary border border-gray-600 rounded-lg text-gate-text focus:ring-2 focus:ring-gate-primary focus:border-transparent"
              placeholder="Gate.io API Key를 입력하세요"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gate-text mb-2">
              API Secret
            </label>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              className="w-full px-3 py-2 bg-gate-secondary border border-gray-600 rounded-lg text-gate-text focus:ring-2 focus:ring-gate-primary focus:border-transparent"
              placeholder="Gate.io API Secret을 입력하세요"
            />
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="testnet"
              checked={isTestnet}
              onChange={(e) => setIsTestnet(e.target.checked)}
              className="w-4 h-4 text-gate-primary bg-gate-secondary border-gray-600 rounded focus:ring-gate-primary"
            />
            <label htmlFor="testnet" className="text-sm text-gate-text">
              테스트넷 사용
            </label>
          </div>

          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
              isConnecting
                ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                : 'bg-gate-primary text-white hover:bg-opacity-90'
            }`}
          >
            {isConnecting ? '연결 중...' : 'API 연결'}
          </button>

          {connectionStatus && (
            <div className="text-sm text-center p-2 bg-gate-secondary rounded-lg">
              {connectionStatus}
            </div>
          )}
        </div>
      ) : (
        // 연결 성공 후 계정 정보 화면
        <div className="space-y-4">
          {/* 연결 상태 */}
          <div className="flex items-center justify-between p-3 bg-green-900/30 border border-green-500/50 rounded-lg">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-green-400 font-medium">
                {isTestnet ? 'Testnet' : 'Mainnet'} 연결됨
              </span>
            </div>
            <button
              onClick={handleDisconnect}
              className="text-xs text-red-400 hover:text-red-300"
            >
              연결 해제
            </button>
          </div>

          {/* 계정 정보 */}
          {account && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gate-text border-b border-gray-600 pb-2">
                계정 현황
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-2 bg-gate-secondary rounded">
                  <div className="text-gray-400">총 자산</div>
                  <div className="font-semibold text-gate-text">
                    {formatCurrency(account.total)}
                  </div>
                </div>
                <div className="p-2 bg-gate-secondary rounded">
                  <div className="text-gray-400">사용 가능</div>
                  <div className="font-semibold text-gate-text">
                    {formatCurrency(account.available)}
                  </div>
                </div>
                <div className="p-2 bg-gate-secondary rounded">
                  <div className="text-gray-400">포지션 마진</div>
                  <div className="font-semibold text-gate-text">
                    {formatCurrency(account.positionMargin)}
                  </div>
                </div>
                <div className="p-2 bg-gate-secondary rounded">
                  <div className="text-gray-400">미실현 손익</div>
                  <div className={`font-semibold ${
                    account.unrealisedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatCurrency(account.unrealisedPnl)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 포지션 정보 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gate-text border-b border-gray-600 pb-2">
              활성 포지션 ({positions.length})
            </h3>
            {positions.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">
                활성 포지션이 없습니다
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {positions.map((position, index) => (
                  <div key={index} className="p-2 bg-gate-secondary rounded text-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-semibold">{position.contract}</span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        position.side === 'long' 
                          ? 'bg-green-900/50 text-green-400' 
                          : 'bg-red-900/50 text-red-400'
                      }`}>
                        {position.side.toUpperCase()} {position.leverage}x
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-gray-400">
                      <div>수량: {formatNumber(Math.abs(position.size))}</div>
                      <div>진입: ${formatNumber(position.entryPrice)}</div>
                      <div>현재: ${formatNumber(position.markPrice)}</div>
                      <div className={position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                        손익: {formatNumber(position.pnlPercentage)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export default ApiSettingsCard;