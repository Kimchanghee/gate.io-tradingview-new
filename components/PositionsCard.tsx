
import React from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';
import { Position, LogType } from '../types';
import { BACKEND_URL } from '../config';

const PositionItem: React.FC<{ position: Position }> = ({ position }) => {
    const { state, dispatch, translate } = useAppContext();

    const side = position.size > 0 ? 'long' : 'short';
    const pnl = parseFloat(position.unrealised_pnl);
    const pnlColor = pnl >= 0 ? 'text-gate-success' : 'text-gate-danger';
    const pnlPercent = (pnl / parseFloat(position.margin)) * 100;
    const uid = state.user.uid;
    const accessKey = state.user.accessKey;

    const handleClosePosition = async () => {
        if (!uid || !accessKey) {
            dispatch({ type: 'ADD_LOG', payload: { message: translate('uidAuthRequired'), type: LogType.Warning } });
            return;
        }
        if (!window.confirm(`Close position for ${position.contract}?`)) return;

        try {
             // This fetch call uses the dynamic backend URL
            const response = await fetch(`${BACKEND_URL}/api/positions/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contract: position.contract, uid, accessKey, network: state.network }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to close position');

            dispatch({ type: 'ADD_LOG', payload: { message: `${translate('positionClosed')}: ${position.contract}`, type: LogType.Success } });
        } catch (error) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Failed to close position: ${(error as Error).message}`, type: LogType.Error } });
        }
    };

    return (
        <div className="bg-gate-dark border border-gate-border rounded-xl p-4 mb-3 transition-all hover:border-gate-primary hover:shadow-lg">
            <div className="flex justify-between items-center mb-3">
                <span className={`px-3 py-1 text-xs font-bold rounded-full ${side === 'long' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {side === 'long' ? translate('long') : translate('short')}
                </span>
                <span className="font-mono text-sm">{position.contract}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gate-text-secondary">{translate('entryPrice')}:</span><span>${parseFloat(position.entry_price).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gate-text-secondary">{translate('markPrice')}:</span><span>${parseFloat(position.mark_price).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gate-text-secondary">{translate('pnl')}:</span><span className={pnlColor}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gate-text-secondary">{translate('pnlPercent')}:</span><span className={pnlColor}>{pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span className="text-gate-text-secondary">{translate('size')}:</span><span>{Math.abs(position.size)}</span></div>
                <div className="flex justify-between"><span className="text-gate-text-secondary">{translate('margin')}:</span><span>${parseFloat(position.margin).toFixed(2)}</span></div>
            </div>
            <div className="mt-3">
                <button onClick={handleClosePosition} className="w-full text-center text-xs py-2 bg-gate-danger text-white rounded-lg hover:bg-red-500 transition-colors">{translate('closePosition')}</button>
            </div>
        </div>
    );
}

const PositionsCard: React.FC = () => {
    const { state, translate } = useAppContext();

    return (
        <Card title={translate('currentPositions')}>
            <div className="max-h-[400px] overflow-y-auto pr-2">
                {state.isConnected && state.positions.length > 0 ? (
                    state.positions.map(pos => <PositionItem key={pos.contract} position={pos} />)
                ) : (
                    <div className="text-center py-10 text-gate-text-secondary">{translate('noPositions')}</div>
                )}
            </div>
        </Card>
    );
};

export default PositionsCard;
