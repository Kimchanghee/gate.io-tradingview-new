import React, { useState, useEffect } from 'react';
import Card from './Card';

const GlobalTradingSettingsCard: React.FC = () => {
  const [investmentAmount, setInvestmentAmount] = useState<number>(100);
  const [defaultLeverage, setDefaultLeverage] = useState<number>(10);
  const [riskPerTrade, setRiskPerTrade] = useState<number>(2); // %
  const [autoTrading, setAutoTrading] = useState<boolean>(false);
  const [maxDailyLoss, setMaxDailyLoss] = useState<number>(10); // %
  const [emergencyStop, setEmergencyStop] = useState<boolean>(false);

  // 로컬 스토리지에서 설정 불러오기
  useEffect(() => {
    const savedSettings = localStorage.getItem('globalTradingSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setInvestmentAmount(settings.investmentAmount || 100);
      setDefaultLeverage(settings.defaultLeverage || 10);
      setRiskPerTrade(settings.riskPerTrade || 2);
      setAutoTrading(settings.autoTrading || false);
      setMaxDailyLoss(settings.maxDailyLoss || 10);
      setEmergencyStop(settings.emergencyStop || false);
    }
  }, []);

  // 설정 저장
  const saveSettings = () => {
    const settings = {
      investmentAmount,
      defaultLeverage,
      riskPerTrade,
      autoTrading,
      maxDailyLoss,
      emergencyStop
    };
    localStorage.setItem('globalTradingSettings', JSON.stringify(settings));
    
    // 성공 메시지 표시 (간단한 방법)
    const button = document.getElementById('save-button');
    if (button) {
      const originalText = button.textContent;
      button.textContent = '저장됨!';
      button.className = button.className.replace('bg-gate-primary', 'bg-green-600');
      setTimeout(() => {
        button.textContent = originalText;
        button.className = button.className.replace('bg-green-600', 'bg-gate-primary');
      }, 2000);
    }
  };

  const calculatePositionSize = () => {
    return (investmentAmount * riskPerTrade / 100).toFixed(2);
  };

  return (
    <Card title="통합 거래 설정" className="space-y-4">
      {/* 자동 거래 토글 */}
      <div className="p-3 bg-gate-secondary rounded-lg border border-gray-600">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gate-text">자동 거래</h3>
            <p className="text-sm text-gray-400">웹훅 신호로 자동 거래 실행</p>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="autoTrading"
              checked={autoTrading}
              onChange={(e) => setAutoTrading(e.target.checked)}
              className="w-5 h-5 text-gate-primary bg-gate-secondary border-gray-600 rounded focus:ring-gate-primary"
            />
            <label htmlFor="autoTrading" className={`font-medium ${
              autoTrading ? 'text-green-400' : 'text-gray-400'
            }`}>
              {autoTrading ? 'ON' : 'OFF'}
            </label>
          </div>
        </div>
      </div>

      {/* 기본 투자 설정 */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gate-text mb-2">
            기본 투자 금액 (USDT)
          </label>
          <input
            type="number"
            value={investmentAmount}
            onChange={(e) => setInvestmentAmount(Number(e.target.value))}
            className="w-full px-3 py-2 bg-gate-secondary border border-gray-600 rounded-lg text-gate-text focus:ring-2 focus:ring-gate-primary focus:border-transparent"
            min="1"
            step="1"
          />
          <p className="text-xs text-gray-400 mt-1">각 신호당 기본 투자할 금액</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gate-text mb-2">
            기본 레버리지 (배)
          </label>
          <input
            type="number"
            value={defaultLeverage}
            onChange={(e) => setDefaultLeverage(Number(e.target.value))}
            className="w-full px-3 py-2 bg-gate-secondary border border-gray-600 rounded-lg text-gate-text focus:ring-2 focus:ring-gate-primary focus:border-transparent"
            min="1"
            max="125"
            step="1"
          />
          <p className="text-xs text-gray-400 mt-1">신호에 레버리지가 없을 때 사용</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gate-text mb-2">
            거래당 리스크 (%)
          </label>
          <input
            type="number"
            value={riskPerTrade}
            onChange={(e) => setRiskPerTrade(Number(e.target.value))}
            className="w-full px-3 py-2 bg-gate-secondary border border-gray-600 rounded-lg text-gate-text focus:ring-2 focus:ring-gate-primary focus:border-transparent"
            min="0.1"
            max="10"
            step="0.1"
          />
          <p className="text-xs text-gray-400 mt-1">
            예상 손실: {calculatePositionSize()} USDT ({riskPerTrade}%)
          </p>
        </div>
      </div>

      {/* 리스크 관리 */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gate-text border-b border-gray-600 pb-2">
          리스크 관리
        </h3>
        
        <div>
          <label className="block text-sm font-medium text-gate-text mb-2">
            일일 최대 손실 한도 (%)
          </label>
          <input
            type="number"
            value={maxDailyLoss}
            onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
            className="w-full px-3 py-2 bg-gate-secondary border border-gray-600 rounded-lg text-gate-text focus:ring-2 focus:ring-gate-primary focus:border-transparent"
            min="1"
            max="50"
            step="1"
          />
          <p className="text-xs text-gray-400 mt-1">
            한도 도달시 자동 거래 중지
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="emergencyStop"
            checked={emergencyStop}
            onChange={(e) => setEmergencyStop(e.target.checked)}
            className="w-4 h-4 text-red-500 bg-gate-secondary border-gray-600 rounded focus:ring-red-500"
          />
          <label htmlFor="emergencyStop" className={`text-sm ${
            emergencyStop ? 'text-red-400 font-medium' : 'text-gray-400'
          }`}>
            긴급 정지 모드 (모든 자동 거래 중지)
          </label>
        </div>
      </div>

      {/* 현재 설정 요약 */}
      <div className="p-3 bg-gate-dark rounded-lg border border-gray-700">
        <h4 className="text-sm font-semibold text-gate-text mb-2">현재 설정 요약</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-gray-400">자동 거래:</div>
          <div className={autoTrading ? 'text-green-400' : 'text-red-400'}>
            {autoTrading && !emergencyStop ? '활성' : '비활성'}
          </div>
          
          <div className="text-gray-400">투자 금액:</div>
          <div className="text-gate-text">{investmentAmount} USDT</div>
          
          <div className="text-gray-400">기본 레버리지:</div>
          <div className="text-gate-text">{defaultLeverage}x</div>
          
          <div className="text-gray-400">리스크:</div>
          <div className="text-gate-text">{riskPerTrade}%</div>
        </div>
      </div>

      {/* 저장 버튼 */}
      <button
        id="save-button"
        onClick={saveSettings}
        className="w-full py-2 px-4 bg-gate-primary text-white font-medium rounded-lg hover:bg-opacity-90 transition-colors"
      >
        설정 저장
      </button>
    </Card>
  );
};

export default GlobalTradingSettingsCard;