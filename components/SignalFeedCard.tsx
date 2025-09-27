import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';
import { LogType } from '../types';

interface SignalItem {
  id: string;
  timestamp: string;
  action?: string;
  side?: string;
  symbol?: string;
  price?: number;
  size?: number;
  leverage?: number;
  status?: string;
  strategyId?: string;
  strategyName?: string;
  indicator?: string;
  autoTradingExecuted?: boolean;
}

type SignalError = 'none' | 'forbidden' | 'generic';

const SignalFeedCard: React.FC = () => {
  const { state, translate, dispatch } = useAppContext();
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [error, setError] = useState<SignalError>('none');
  const processedSignalIds = useRef<Set<string>>(new Set());
  const autoTradeStartRef = useRef<number>(Date.now());
  const autoTradeInFlightRef = useRef(false);

  const uid = state.user.uid;
  const accessKey = state.user.accessKey || '';
  const uidReady = state.user.isLoggedIn;
  const isApproved = state.user.status === 'approved';
  const allowedStrategies = useMemo(() => state.user.approvedStrategies || [], [state.user.approvedStrategies]);
  const autoTradingEnabled = state.user.autoTradingEnabled;
  const investmentAmount = state.settings.investmentAmount;
  const configuredLeverage = state.settings.leverage;
  const configuredSymbol = state.settings.symbol;
  const accountSummary = state.accountSummary;

  const handleUserAccessGuard = useCallback(
    (code?: string): SignalError => {
      switch (code) {
        case 'uid_not_found':
        case 'uid_credentials_mismatch':
          dispatch({ type: 'RESET_USER' });
          setSignals([]);
          return 'forbidden';
        case 'uid_not_approved':
        case 'missing_credentials':
          setSignals([]);
          return 'forbidden';
        default:
          return 'none';
      }
    },
    [dispatch, setSignals],
  );

  useEffect(() => {
    if (!uid || !accessKey || !isApproved) {
      setSignals([]);
      setError('none');
      return;
    }
    let stopped = false;
    const fetchSignals = async () => {
      try {
        const url = `/api/user/signals?uid=${encodeURIComponent(uid)}&key=${encodeURIComponent(accessKey)}`;
        const res = await fetch(url);
        const raw = await res.text();
        let data: any = null;
        if (raw) {
          try {
            data = JSON.parse(raw);
          } catch (parseError) {
            console.error('Failed to parse signals payload', parseError);
          }
        }
        if (res.status === 403) {
          const guardResult = handleUserAccessGuard(data?.code);
          if (!stopped && guardResult !== 'none') {
            setError(guardResult);
          }
          if (!stopped && guardResult === 'none') {
            setError('forbidden');
          }
          return;
        }
        if (!res.ok) {
          if (!stopped) setError('generic');
          return;
        }
        if (!stopped) {
          setError('none');
          if (Array.isArray(data?.signals)) {
            const nextSignals = data.signals.slice().reverse().slice(0, 100);
            setSignals(nextSignals);
          } else {
            setSignals([]);
          }
        }
      } catch (err) {
        console.error(err);
        if (!stopped) setError('generic');
      }
    };
    fetchSignals();
    const id = window.setInterval(fetchSignals, 6000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [accessKey, handleUserAccessGuard, isApproved, uid]);

  useEffect(() => {
    processedSignalIds.current.clear();
    if (autoTradingEnabled) {
      autoTradeStartRef.current = Date.now();
    }
  }, [autoTradingEnabled, state.network, configuredSymbol]);

  const executeAutoTrade = useCallback(
    async (signal: SignalItem) => {
      if (!autoTradingEnabled) {
        return;
      }
      if (autoTradeInFlightRef.current) {
        return;
      }
      if (!uidReady || !uid || !accessKey || !isApproved) {
        return;
      }
      if (!accountSummary.isConnected) {
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: { message: translate('autoTradeRequiresConnection'), type: 'warning' },
        });
        return;
      }
      if (!investmentAmount || investmentAmount <= 0) {
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: { message: translate('autoTradeAmountRequired'), type: 'warning' },
        });
        return;
      }

      const signalSymbol = signal.symbol || configuredSymbol;
      if (!signalSymbol) {
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: { message: translate('autoTradeExecutionFailed'), type: 'error' },
        });
        return;
      }

      if (configuredSymbol && signal.symbol && configuredSymbol !== signal.symbol) {
        dispatch({
          type: 'ADD_LOG',
          payload: {
            message: `${translate('autoTradeSymbolMismatch')} (${signal.symbol} → ${configuredSymbol})`,
            type: LogType.Warning,
          },
        });
        return;
      }

      autoTradeInFlightRef.current = true;

      try {
        const response = await fetch('/api/trading/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid,
            key: accessKey,
            network: state.network,
            symbol: signalSymbol,
            action: signal.action || signal.side || 'buy',
            leverage: configuredLeverage,
            investmentAmount,
            price: typeof signal.price === 'number' ? signal.price : null,
          }),
        });

        const raw = await response.text();
        let result: any = null;
        if (raw) {
          try {
            result = JSON.parse(raw);
          } catch (parseError) {
            console.error('자동 거래 응답 파싱 실패', parseError);
          }
        }

        if (response.status === 403 && result?.code) {
          handleUserAccessGuard(result.code);
          return;
        }

        if (!response.ok) {
          const code = result?.code;
          if (code === 'insufficient_funds') {
            dispatch({
              type: 'ADD_NOTIFICATION',
              payload: { message: translate('autoTradeInsufficientFunds'), type: 'warning' },
            });
            return;
          }
          if (code === 'invalid_leverage') {
            dispatch({
              type: 'ADD_NOTIFICATION',
              payload: { message: translate('autoTradeInvalidLeverage'), type: 'warning' },
            });
            return;
          }
          const message = result?.message || raw || translate('autoTradeExecutionFailed');
          dispatch({
            type: 'ADD_NOTIFICATION',
            payload: { message, type: 'error' },
          });
          dispatch({
            type: 'ADD_LOG',
            payload: { message, type: LogType.Error },
          });
          return;
        }

        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: {
            message: `${signalSymbol} ${translate('autoTradeExecuted')}`,
            type: 'success',
          },
        });
        dispatch({
          type: 'ADD_LOG',
          payload: {
            message: `${signalSymbol} ${translate('autoTradeExecuted')}`,
            type: LogType.Success,
          },
        });

        if (result?.accounts?.futures) {
          dispatch({
            type: 'SET_ACCOUNT_SUMMARY',
            payload: {
              futuresAvailable: Number(result.accounts.futures.available) || 0,
              network: state.network,
              isConnected: true,
              lastUpdated: new Date().toISOString(),
            },
          });
        }

        setSignals((prev) =>
          prev.map((item) =>
            item.id === signal.id ? { ...item, status: 'executed', autoTradingExecuted: true } : item,
          ),
        );

        window.dispatchEvent(new CustomEvent('refresh-positions'));
      } catch (error) {
        console.error('자동 거래 실행 실패', error);
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: { message: translate('autoTradeExecutionFailed'), type: 'error' },
        });
      } finally {
        autoTradeInFlightRef.current = false;
      }
    },
    [
      accessKey,
      autoTradingEnabled,
      configuredLeverage,
      configuredSymbol,
      dispatch,
      handleUserAccessGuard,
      investmentAmount,
      isApproved,
      accountSummary,
      state.network,
      translate,
      uid,
      uidReady,
    ],
  );

  useEffect(() => {
    if (!autoTradingEnabled) {
      return;
    }
    if (!uidReady || !uid || !accessKey || !isApproved) {
      return;
    }
    if (!investmentAmount || investmentAmount <= 0) {
      return;
    }
    if (!accountSummary.isConnected) {
      return;
    }

    const run = async () => {
      for (const signal of signals) {
        if (!signal?.id) {
          continue;
        }
        if (processedSignalIds.current.has(signal.id)) {
          continue;
        }
        const timestamp = Date.parse(signal.timestamp || '');
        if (Number.isFinite(timestamp) && timestamp < autoTradeStartRef.current) {
          processedSignalIds.current.add(signal.id);
          continue;
        }
        processedSignalIds.current.add(signal.id);
        await executeAutoTrade(signal);
      }
    };

    void run();
  }, [
    accessKey,
    accountSummary,
    autoTradingEnabled,
    executeAutoTrade,
    investmentAmount,
    isApproved,
    signals,
    uid,
    uidReady,
  ]);

  const errorMessage = error === 'forbidden'
    ? translate('signalErrorForbidden')
    : error === 'generic'
      ? translate('signalErrorGeneric')
      : '';

  return (
    <Card title={translate('signalFeedTitle')} className="mb-5">
      <div className="space-y-3 text-sm">
        {!uidReady && (
          <div className="text-gray-400">{translate('signalLoginRequired')}</div>
        )}

        {uidReady && state.user.status === 'pending' && (
          <div className="text-yellow-200">{translate('signalPendingMessage')}</div>
        )}

        {state.user.status === 'denied' && (
          <div className="text-red-300">{translate('signalDeniedMessage')}</div>
        )}

        <div className="text-xs text-gray-400 uppercase tracking-wider">
          {translate('signalStrategiesTitle')}
        </div>
        {allowedStrategies.length > 0 ? (
          <ul className="text-xs text-gray-300 list-disc list-inside space-y-1">
            {allowedStrategies.map((strategy) => (
              <li key={strategy.id}>{strategy.name}</li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-gray-500">{translate('signalNoStrategies')}</div>
        )}

        {errorMessage && <div className="text-xs text-red-400">{errorMessage}</div>}

        {uidReady && accessKey && isApproved && (
          <div className="max-h-72 overflow-y-auto space-y-2 text-sm">
            {signals.length === 0 ? (
              <div className="text-gray-500">{translate('signalEmpty')}</div>
            ) : (
              signals.map((signal) => (
                <div key={signal.id} className="bg-black/40 border border-gray-700 rounded px-3 py-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>{signal.indicator || signal.strategyId || '-'}</span>
                    <span>{new Date(signal.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="text-sm font-semibold text-gate-text">
                    {signal.symbol || '---'} ({signal.action || '-'} {signal.side || '-'})
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div>
                      status: {signal.status || '-'}
                      {signal.autoTradingExecuted !== undefined && (
                        <span className={`ml-2 ${signal.autoTradingExecuted ? 'text-green-400' : 'text-gray-400'}`}>
                          {signal.autoTradingExecuted ? translate('autoTrading') : translate('inactive')}
                        </span>
                      )}
                    </div>
                    <div>size={signal.size ?? '-'} | leverage={signal.leverage ?? '-'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default SignalFeedCard;
