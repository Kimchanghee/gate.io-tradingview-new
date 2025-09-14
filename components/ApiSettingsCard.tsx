import React, { useState } from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';
import { Network } from '../types';

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
  const { state, translate } = useAppContext();
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [accounts, setAccounts] = useState<AllAccounts | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [activeTab, setActiveTab] = useState<'futures' | 'spot' | 'margin' | 'options'>('futures');

  const handleConnect = async () => {
    if (!apiKey || !apiSecret) {
      setConnectionStatus(translate('enterApiCredentials'));
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
          isTestnet: state.network === Network.Testnet,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        setIsConnected(true);
        setConnectionStatus(translate('connectionSuccess'));
        setAccounts(result.accounts);
        setPositions(result.positions || []);
      } else {
        setIsConnected(false);
        setConnectionStatus(translate('connectionFailed'));
      }
    } catch (error) {
      setIsConnected(false);
      setConnectionStatus(translate('connectionError'));
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
      
      const posResponse = await fetch('/api/positions');
      if (posResponse.ok) {
        const posData = await posResponse.json();
        setPositions(posData.positions || []);
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

  const getDetailText = (key: string) => {
    const texts: any = {
      totalFuturesAssets: {
        ko: '전체 선물 자산',
        en: 'Total Futures Assets',
        ja: '先物総資産'
      },
      availableForTrading: {
        ko: '거래 가능',
        en: 'Available for Trading',
        ja: '取引可能'
      },
      positionMarginDetail: {
        ko: '포지션 증거금',
        en: 'Position Margin',
        ja: 'ポジション証拠金'
      },
      unrealizedPnlDetail: {
        ko: '미실현 손익',
        en: 'Unrealized P&L',
        ja: '未実現損益'
      },
      assetFormula: {
        ko: '총 자산 = 사용가능 + 포지션 증거금 + 미실현 손익',
        en: 'Total = Available + Position Margin + Unrealized P&L',
        ja: '総資産 = 利用可能 + ポジション証拠金 + 未実現損益'
      },
      assetBreakdown: {
        ko: '선물 + 현물 USDT + 마진 순자산 + 옵션',
        en: 'Futures + Spot USDT + Margin Net + Options',
        ja: '先物 + 現物USDT + マージン純資産 + オプション'
      },
      unableToLoadFutures: {
        ko: '선물 계정 정보를 불러올 수 없습니다.',
        en: 'Unable to load futures account information.',
        ja: '先物アカウント情報を読み込めません。'
      },
      noFundsInFutures: {
        ko: '선물 계정에 자금이 없는 경우,',
        en: 'If there are no funds in futures account,',
        ja: '先物アカウントに資金がない場合、'
      },
      transferFromSpot: {
        ko: '현물에서 선물로 자금을 이체해주세요.',
        en: 'please transfer funds from spot to futures.',
        ja: '現物から先物に資金を振り替えてください。'
      }
    };
    
    return texts[key]?.[state.language] || texts[key]?.ko || '';
  };

  return (
    <Card title={translate('apiSettings')} className="space-y-4">
      {!isConnected ? (
        // API 설정 화면
        <div className="space-y-4">
          {/* 현재 네트워크 표시 */}
          <div className="p-3 bg-gate-secondary rounded-lg border border-gray-600">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">{translate('currentNetwork')}</span>
              <span className={`text-sm font-bold ${
                state.network === Network.Testnet ? 'text-yellow-400' : 'text-gate-primary'
              }`}>
                {state.network === Network.Testnet ? translate('testnet') : translate('mainnet')}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {translate('networkHint')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gate-text mb-2">
              {translate('apiKey')}
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 bg-gate-secondary border border-gray-600 rounded-lg text-gate-text focus:ring-2 focus:ring-gate-primary focus:border-transparent"
              placeholder={`Gate.io ${translate('apiKey')}`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gate-text mb-2">
              {translate('apiSecret')}
            </label>
            <input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              className="w-full px-3 py-2 bg-gate-secondary border border-gray-600 rounded-lg text-gate-text focus:ring-2 focus:ring-gate-primary focus:border-transparent"
              placeholder={`Gate.io ${translate('apiSecret')}`}
            />
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
            {isConnecting ? translate('connecting') : translate('connect')}
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
                {state.network === Network.Testnet ? translate('testnet') : translate('mainnet')} {translate('connected')}
              </span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={refreshAccounts}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {translate('refresh')}
              </button>
              <button
                onClick={handleDisconnect}
                className="text-xs text-red-400 hover:text-red-300"
              >
                {translate('disconnect')}
              </button>
            </div>
          </div>

          {/* 총 자산 요약 */}
          {accounts && (
            <div className="p-3 bg-gate-primary/20 rounded-lg border border-gate-primary/50">
              <div className="text-sm text-gray-400">{translate('totalEstimatedAssets')}</div>
              <div className="text-xl font-bold text-gate-primary">
                {formatCurrency(accounts.totalEstimatedValue)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                ({getDetailText('assetBreakdown')})
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
              {translate('futuresAccount')}
            </button>
            <button
              onClick={() => setActiveTab('spot')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'spot'
                  ? 'text-gate-primary border-b-2 border-gate-primary'
                  : 'text-gray-400 hover:text-gate-text'
              }`}
            >
              {translate('spotAccount')}
            </button>
            <button
              onClick={() => setActiveTab('margin')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'margin'
                  ? 'text-gate-primary border-b-2 border-gate-primary'
                  : 'text-gray-400 hover:text-gate-text'
              }`}
            >
              {translate('marginAccount')}
            </button>
            <button
              onClick={() => setActiveTab('options')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === 'options'
                  ? 'text-gate-primary border-b-2 border-gate-primary'
                  : 'text-gray-400 hover:text-gate-text'
              }`}
            >
              {translate('optionsAccount')}
            </button>
          </div>

          {/* 탭 콘텐츠 */}
          <div className="min-h-[200px]">
            {/* 선물 계정 */}
            {activeTab === 'futures' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gate-text">{translate('futuresAccountStatus')}</h3>
                {accounts?.futures !== undefined && accounts?.futures !== null ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-2 bg-gate-secondary rounded">
                        <div className="text-gray-400">{translate('totalAssets')}</div>
                        <div className="font-semibold text-gate-text">
                          {formatCurrency(accounts.futures.total || 0)}
                        </div>
                        <div className="text-xs text-gray-500">({getDetailText('totalFuturesAssets')})</div>
                      </div>
                      <div className="p-2 bg-gate-secondary rounded">
                        <div className="text-gray-400">{translate('available')}</div>
                        <div className="font-semibold text-gate-text">
                          {formatCurrency(accounts.futures.available || 0)}
                        </div>
                        <div className="text-xs text-gray-500">({getDetailText('availableForTrading')})</div>
                      </div>
                      <div className="p-2 bg-gate-secondary rounded">
                        <div className="text-gray-400">{translate('positionMargin')}</div>
                        <div className="font-semibold text-gate-text">
                          {formatCurrency(accounts.futures.positionMargin || 0)}
                        </div>
                        <div className="text-xs text-gray-500">({getDetailText('positionMarginDetail')})</div>
                      </div>
                      <div className="p-2 bg-gate-secondary rounded">
                        <div className="text-gray-400">{translate('unrealizedPnl')}</div>
                        <div className={`font-semibold ${
                          (accounts.futures.unrealisedPnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {formatCurrency(accounts.futures.unrealisedPnl || 0)}
                        </div>
                        <div className="text-xs text-gray-500">({getDetailText('unrealizedPnlDetail')})</div>
                      </div>
                    </div>
                    
                    {/* 계산 공식 표시 */}
                    <div className="text-xs text-gray-500 p-2 bg-gate-secondary/50 rounded">
                      💡 {getDetailText('assetFormula')}
                    </div>

                    {/* 포지션 정보 */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-gate-text border-b border-gray-600 pb-1">
                        {translate('activePositions')} ({positions.length})
                      </h4>
                      {positions.length === 0 ? (
                        <div className="text-center text-gray-400 text-sm py-4">
                          {translate('noActivePositions')}
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
                                  {position.side === 'long' ? translate('long') : translate('short')} {position.leverage}x
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-gray-400">
                                <div>{translate('quantity')}: {formatNumber(Math.abs(position.size))}</div>
                                <div>{translate('entryPrice')}: ${formatNumber(position.entryPrice)}</div>
                                <div>{translate('currentPrice')}: ${formatNumber(position.markPrice)}</div>
                                <div className={position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                                  {translate('pnl')}: {formatNumber(position.pnlPercentage)}%
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center text-gray-400 text-sm py-8">
                    <div className="mb-2">{getDetailText('unableToLoadFutures')}</div>
                    <div className="text-xs">
                      {getDetailText('noFundsInFutures')}<br />
                      {getDetailText('transferFromSpot')}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 현물 계정 */}
            {activeTab === 'spot' && accounts?.spot && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gate-text">{translate('spotAccountBalance')}</h3>
                {accounts.spot.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-4">
                    {translate('noAssets')}
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
                            <div>{translate('available')}: {formatNumber(balance.available)}</div>
                            {balance.locked > 0 && (
                              <div>{translate('locked')}: {formatNumber(balance.locked)}</div>
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
                <h3 className="text-sm font-semibold text-gate-text">{translate('marginAccountInfo')}</h3>
                {accounts.margin.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-4">
                    {translate('noPositions')}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {accounts.margin.map((margin, index) => (
                      <div key={index} className="p-2 bg-gate-secondary rounded">
                        <div className="font-semibold text-sm mb-2">{margin.currencyPair}</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className="text-gray-400">Base ({margin.base.currency})</div>
                            <div>{translate('available')}: {formatNumber(margin.base.available)}</div>
                            {margin.base.borrowed > 0 && (
                              <div className="text-red-400">{translate('borrowed')}: {formatNumber(margin.base.borrowed)}</div>
                            )}
                          </div>
                          <div>
                            <div className="text-gray-400">Quote ({margin.quote.currency})</div>
                            <div>{translate('available')}: {formatNumber(margin.quote.available)}</div>
                            {margin.quote.borrowed > 0 && (
                              <div className="text-red-400">{translate('borrowed')}: {formatNumber(margin.quote.borrowed)}</div>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 text-xs">
                          <span className="text-gray-400">{translate('riskLevel')}: </span>
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
                <h3 className="text-sm font-semibold text-gate-text">{translate('optionsAccountInfo')}</h3>
                {accounts?.options ? (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-2 bg-gate-secondary rounded">
                      <div className="text-gray-400">{translate('totalAssets')}</div>
                      <div className="font-semibold text-gate-text">
                        {formatCurrency(accounts.options.total)}
                      </div>
                    </div>
                    <div className="p-2 bg-gate-secondary rounded">
                      <div className="text-gray-400">{translate('available')}</div>
                      <div className="font-semibold text-gate-text">
                        {formatCurrency(accounts.options.available)}
                      </div>
                    </div>
                    <div className="p-2 bg-gate-secondary rounded">
                      <div className="text-gray-400">{translate('positionValue')}</div>
                      <div className="font-semibold text-gate-text">
                        {formatCurrency(accounts.options.positionValue)}
                      </div>
                    </div>
                    <div className="p-2 bg-gate-secondary rounded">
                      <div className="text-gray-400">{translate('unrealizedPnl')}</div>
                      <div className={`font-semibold ${
                        accounts.options.unrealisedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(accounts.options.unrealisedPnl)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-400 text-sm py-4">
                    {translate('optionsNotActivated')}
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