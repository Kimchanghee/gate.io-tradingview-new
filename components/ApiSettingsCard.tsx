import React, { useState } from 'react';
import Card from './Card';

interface FuturesAccountInfo {
  total: number;
  available: number;
  positionMargin: number;
  orderMargin: number;
  unrealisedPnl: number;
  currency: string;
}

interface SpotBalance {
  currency: string;
  available: number;
  locked: number;
  total: number;
}

interface MarginBalance {
  currencyPair: string;
  base: {
    currency: string;
    available: number;
    locked: number;
    borrowed: number;
    interest: number;
  };
  quote: {
    currency: string;
    available: number;
    locked: number;
    borrowed: number;
    interest: number;
  };
  risk: number;
}

interface OptionsAccountInfo {
  total: number;
  available: number;
  positionValue: number;
  orderMargin: number;
  unrealisedPnl: number;
}

interface AllAccounts {
  futures: FuturesAccountInfo | null;
  spot: SpotBalance[];
  margin: MarginBalance[];
  options: OptionsAccountInfo | null;
  totalEstimatedValue: number;
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
  const [isTestnet, setIsTestnet] = useState(false); // 메인넷 기본
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [accounts, setAccounts] = useState<AllAccounts | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [activeTab, setActiveTab] = useState<'futures' | 'spot' | 'margin' | 'options'>('futures');

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
        setAccounts(result.accounts);
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
    setAccounts(null);
    setPositions([]);
    setApiKey('');
    setApiSecret('');
  };

  const refreshAccounts = async () => {
    try {
      const response = await fetch('/api/accounts/all');
      const data = await response.json();
      if (data.futures || data.spot) {
        setAccounts(data);
      }
    } catch (error) {
      console.error('계정 정보 새로고침 실패:', error);
    }
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
              테스트넷 사용 (메인넷 권장)
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
        // 연결 성공 후 통합 계정 정보 화면
        <div className="space-y-4">
          {/* 연결 상태 */}
          <div className="flex items-center justify-between p-3 bg-green-900/30 border border-green-500/50 rounded-lg">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-green-400 font-medium">
                {state.network === Network.Testnet ? 'Testnet' : 'Mainnet'} 연결됨
              </span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={refreshAccounts}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                새로고침
              </button>
              <button
                onClick={handleDisconnect}
                className="text-xs text-red-400 hover:text-red-300"
              >
                연결 해제
              </button>
            </div>
          </div>

          {/* 총 자산 요약 */}
          {accounts && (
            <div className="p-3 bg-gate-primary/20 rounded-lg border border-gate-primary/50">
              <div className="text-sm text-gray-400">전체 추정 자산 (USDT)</div>
              <div className="text-xl font-bold text-gate-primary">
                {formatCurrency(accounts.totalEstimatedValue)}
              </div>
            </div>
          )}

          {/* 탭 메뉴 */}
          <div className="flex space-x-2 border-b border-gray-600">
            <button
              onClick={() => setActiveTab('futures')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'futures'
                  ? 'text-gate-primary border-b-2 border-gate-primary'
                  : 'text-gray-400 hover:text-gate-text'
              }`}
            >
              선물 (Futures)
            </button>
            <button
              onClick={() => setActiveTab('spot')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'spot'
                  ? 'text-gate-primary border-b-2 border-gate-primary'
                  : 'text-gray-400 hover:text-gate-text'
              }`}
            >
              현물 (Spot)
            </button>
            <button
              onClick={() => setActiveTab('margin')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'margin'
                  ? 'text-gate-primary border-b-2 border-gate-primary'
                  : 'text-gray-400 hover:text-gate-text'
              }`}
            >
              마진 (Margin)
            </button>
            <button
              onClick={() => setActiveTab('options')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'options'
                  ? 'text-gate-primary border-b-2 border-gate-primary'
                  : 'text-gray-400 hover:text-gate-text'
              }`}
            >
              옵션 (Options)
            </button>
          </div>

          {/* 탭 콘텐츠 */}
          <div className="min-h-[200px]">
            {/* 선물 계정 */}
            {activeTab === 'futures' && accounts?.futures && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gate-text">선물 계정 현황</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-2 bg-gate-secondary rounded">
                    <div className="text-gray-400">총 자산</div>
                    <div className="font-semibold text-gate-text">
                      {formatCurrency(accounts.futures.total)}
                    </div>
                  </div>
                  <div className="p-2 bg-gate-secondary rounded">
                    <div className="text-gray-400">사용 가능</div>
                    <div className="font-semibold text-gate-text">
                      {formatCurrency(accounts.futures.available)}
                    </div>
                  </div>
                  <div className="p-2 bg-gate-secondary rounded">
                    <div className="text-gray-400">포지션 마진</div>
                    <div className="font-semibold text-gate-text">
                      {formatCurrency(accounts.futures.positionMargin)}
                    </div>
                  </div>
                  <div className="p-2 bg-gate-secondary rounded">
                    <div className="text-gray-400">미실현 손익</div>
                    <div className={`font-semibold ${
                      accounts.futures.unrealisedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {formatCurrency(accounts.futures.unrealisedPnl)}
                    </div>
                  </div>
                </div>

                {/* 포지션 정보 */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gate-text border-b border-gray-600 pb-1">
                    활성 포지션 ({positions.length})
                  </h4>
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

            {/* 현물 계정 */}
            {activeTab === 'spot' && accounts?.spot && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gate-text">현물 계정 잔고</h3>
                {accounts.spot.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-4">
                    현물 계정에 자산이 없습니다
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {accounts.spot.map((balance, index) => (
                      <div key={index} className="p-2 bg-gate-secondary rounded">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-sm">{balance.currency}</span>
                          <span className="text-sm text-gate-text">
                            {formatNumber(balance.total)}
                          </span>
                        </div>
                        {(balance.available > 0 || balance.locked > 0) && (
                          <div className="text-xs text-gray-400 mt-1 grid grid-cols-2 gap-2">
                            <div>사용가능: {formatNumber(balance.available)}</div>
                            {balance.locked > 0 && (
                              <div>잠김: {formatNumber(balance.locked)}</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 마진 계정 */}
            {activeTab === 'margin' && accounts?.margin && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gate-text">마진 계정</h3>
                {accounts.margin.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-4">
                    마진 계정에 포지션이 없습니다
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {accounts.margin.map((margin, index) => (
                      <div key={index} className="p-2 bg-gate-secondary rounded">
                        <div className="font-semibold text-sm mb-2">{margin.currencyPair}</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className="text-gray-400">Base ({margin.base.currency})</div>
                            <div>가용: {formatNumber(margin.base.available)}</div>
                            {margin.base.borrowed > 0 && (
                              <div className="text-red-400">대출: {formatNumber(margin.base.borrowed)}</div>
                            )}
                          </div>
                          <div>
                            <div className="text-gray-400">Quote ({margin.quote.currency})</div>
                            <div>가용: {formatNumber(margin.quote.available)}</div>
                            {margin.quote.borrowed > 0 && (
                              <div className="text-red-400">대출: {formatNumber(margin.quote.borrowed)}</div>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 text-xs">
                          <span className="text-gray-400">리스크 레벨: </span>
                          <span className={`font-semibold ${
                            margin.risk < 0.5 ? 'text-green-400' : 
                            margin.risk < 0.8 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {(margin.risk * 100).toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 옵션 계정 */}
            {activeTab === 'options' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gate-text">옵션 계정</h3>
                {accounts?.options ? (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-2 bg-gate-secondary rounded">
                      <div className="text-gray-400">총 자산</div>
                      <div className="font-semibold text-gate-text">
                        {formatCurrency(accounts.options.total)}
                      </div>
                    </div>
                    <div className="p-2 bg-gate-secondary rounded">
                      <div className="text-gray-400">사용 가능</div>
                      <div className="font-semibold text-gate-text">
                        {formatCurrency(accounts.options.available)}
                      </div>
                    </div>
                    <div className="p-2 bg-gate-secondary rounded">
                      <div className="text-gray-400">포지션 가치</div>
                      <div className="font-semibold text-gate-text">
                        {formatCurrency(accounts.options.positionValue)}
                      </div>
                    </div>
                    <div className="p-2 bg-gate-secondary rounded">
                      <div className="text-gray-400">미실현 손익</div>
                      <div className={`font-semibold ${
                        accounts.options.unrealisedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(accounts.options.unrealisedPnl)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-400 text-sm py-4">
                    옵션 계정이 활성화되지 않았습니다
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export default ApiSettingsCard;