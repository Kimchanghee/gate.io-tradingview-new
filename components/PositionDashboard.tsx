import React, { useState, useEffect } from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';

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
  value?: number;
}

const PositionDashboard: React.FC = () => {
  const { translate } = useAppContext();
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalPnl, setTotalPnl] = useState(0);
  const [totalInvestment, setTotalInvestment] = useState(0);

  // 포지션 데이터 가져오기
  const fetchPositions = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/positions');
      if (response.ok) {
        const data = await response.json();
        const positionsData = data.positions || [];
        
        // 포지션 가치 계산
        const enhancedPositions = positionsData.map((pos: Position) => ({
          ...pos,
          value: Math.abs(pos.size) * pos.markPrice
        }));
        
        setPositions(enhancedPositions);
        
        // 총 손익 및 투자금 계산
        const totalPnl = enhancedPositions.reduce((sum: number, pos: Position) => sum + pos.pnl, 0);
        const totalInvestment = enhancedPositions.reduce((sum: number, pos: Position) => sum + pos.margin, 0);
        
        setTotalPnl(totalPnl);
        setTotalInvestment(totalInvestment);
      }
    } catch (error) {
      console.error('포지션 조회 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 컴포넌트 마운트 시 한 번만 조회
  useEffect(() => {
    fetchPositions();
    // 자동 새로고침 제거 - 수동 새로고침만 사용
  }, []);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
  };

  const formatCurrency = (num: number) => {
    return `$${formatNumber(Math.abs(num))}`;
  };

  const getCoinName = (contract: string) => {
    // Gate.io 형식의 심볼에서 코인 이름 추출
    // BTC_USDT -> BTC, ETH_USD -> ETH
    return contract.replace('_USDT', '').replace('_USD', '').replace('USDT', '');
  };

  return (
    <Card title={translate('positionDashboard')} className="space-y-4">
      {/* 총 요약 */}
      <div className="grid grid-cols-3 gap-2 p-3 bg-gate-dark rounded-lg">
        <div className="text-center">
          <div className="text-xs text-gray-400">{translate('totalPositions')}</div>
          <div className="text-lg font-bold text-gate-text">{positions.length}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">{translate('totalInvestment')}</div>
          <div className="text-lg font-bold text-gate-text">{formatCurrency(totalInvestment)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400">{translate('totalPnl')}</div>
          <div className={`text-lg font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
          </div>
        </div>
      </div>

      {/* 포지션 목록 */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-8 text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gate-primary mx-auto"></div>
            <div className="mt-2 text-sm">{translate('loading')}</div>
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-sm">{translate('noActivePositions')}</div>
          </div>
        ) : (
          positions.map((position, index) => (
            <div key={index} className="p-3 bg-gate-secondary rounded-lg border border-gray-700 hover:border-gate-primary transition-colors">
              {/* 헤더 */}
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gate-text">{getCoinName(position.contract)}</span>
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    position.side === 'long' 
                      ? 'bg-green-900/50 text-green-400' 
                      : 'bg-red-900/50 text-red-400'
                  }`}>
                    {position.side === 'long' ? '🔼 LONG' : '🔽 SHORT'}
                  </span>
                  <span className="text-xs text-gray-400">{position.leverage}x</span>
                </div>
                <div className={`text-sm font-bold ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {position.pnl >= 0 ? '+' : ''}{formatNumber(position.pnlPercentage)}%
                </div>
              </div>

              {/* 상세 정보 */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">{translate('investmentAmount')}:</span>
                  <span className="text-gate-text">{formatCurrency(position.margin)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{translate('currentValue')}:</span>
                  <span className="text-gate-text">{formatCurrency(position.value || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{translate('entryPrice')}:</span>
                  <span className="text-gate-text">{formatCurrency(position.entryPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{translate('currentPrice')}:</span>
                  <span className="text-gate-text">{formatCurrency(position.markPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{translate('quantity')}:</span>
                  <span className="text-gate-text">{formatNumber(Math.abs(position.size))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{translate('profit')}:</span>
                  <span className={position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {position.pnl >= 0 ? '+' : ''}{formatCurrency(position.pnl)}
                  </span>
                </div>
              </div>

              {/* 진행 바 */}
              <div className="mt-2">
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${
                      position.pnl >= 0 ? 'bg-green-400' : 'bg-red-400'
                    }`}
                    style={{
                      width: `${Math.min(Math.abs(position.pnlPercentage), 100)}%`
                    }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 새로고침 버튼 */}
      <button
        onClick={fetchPositions}
        disabled={isLoading}
        className="w-full py-1.5 px-3 bg-gate-dark text-gate-text text-sm rounded hover:bg-gate-secondary transition-colors disabled:opacity-50"
      >
        {isLoading ? translate('loading') : translate('refresh')} 🔄
      </button>
    </Card>
  );
};

export default PositionDashboard;