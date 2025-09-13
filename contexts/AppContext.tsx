
import React, { createContext, useReducer, useContext, ReactNode, Dispatch, useCallback, useEffect } from 'react';
import { Settings, Position, LogEntry, Notification, Network, Language, LogType } from '../types';
import { TRANSLATIONS } from '../constants';
import { WEBSOCKET_URL } from '../config';

// State Interface
interface AppState {
    isConnected: boolean;
    isConnecting: boolean;
    network: Network;
    language: Language;
    settings: Settings;
    positions: Position[];
    logs: LogEntry[];
    notifications: Notification[];
    webhookActive: boolean;
}

// Action Types
type Action =
    | { type: 'SET_CONNECTION_STATUS'; payload: { status: boolean; isConnecting: boolean } }
    | { type: 'SET_NETWORK'; payload: Network }
    | { type: 'SET_LANGUAGE'; payload: Language }
    | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> }
    | { type: 'SET_POSITIONS'; payload: Position[] }
    | { type: 'ADD_LOG'; payload: Omit<LogEntry, 'id' | 'timestamp'> }
    | { type: 'ADD_NOTIFICATION'; payload: Omit<Notification, 'id'> }
    | { type: 'REMOVE_NOTIFICATION'; payload: number }
    | { type: 'SET_WEBHOOK_STATUS'; payload: boolean };

// Initial State
const initialState: AppState = {
    isConnected: false,
    isConnecting: false,
    network: Network.Testnet,
    language: 'ko',
    settings: {
        apiKey: '',
        apiSecret: '',
        symbol: 'BTC_USDT',
        investmentAmount: 100,
        leverage: 10,
    },
    positions: [],
    logs: [],
    notifications: [],
    webhookActive: false,
};

// Reducer
const appReducer = (state: AppState, action: Action): AppState => {
    switch (action.type) {
        case 'SET_CONNECTION_STATUS':
            return { ...state, isConnected: action.payload.status, isConnecting: action.payload.isConnecting };
        case 'SET_NETWORK':
            return { ...state, network: action.payload, isConnected: false, positions: [], logs: [] };
        case 'SET_LANGUAGE':
            return { ...state, language: action.payload };
        case 'UPDATE_SETTINGS':
            return { ...state, settings: { ...state.settings, ...action.payload } };
        case 'SET_POSITIONS':
            return { ...state, positions: action.payload };
        case 'ADD_LOG':
            const newLog = { 
                ...action.payload, 
                id: Date.now(), 
                timestamp: new Date().toLocaleString() 
            };
            return { ...state, logs: [newLog, ...state.logs.slice(0, 99)] };
        case 'ADD_NOTIFICATION':
            const newNotification = { ...action.payload, id: Date.now() };
            return { ...state, notifications: [...state.notifications, newNotification] };
        case 'REMOVE_NOTIFICATION':
            return { ...state, notifications: state.notifications.filter(n => n.id !== action.payload) };
        case 'SET_WEBHOOK_STATUS':
            return { ...state, webhookActive: action.payload };
        default:
            return state;
    }
};

// Context
const AppContext = createContext<{
    state: AppState;
    dispatch: Dispatch<Action>;
    translate: (key: string) => string;
}>({
    state: initialState,
    dispatch: () => null,
    translate: () => '',
});

// Provider
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);

    useEffect(() => {
        try {
            const savedSettings = localStorage.getItem('gateio_settings');
            if (savedSettings) {
                dispatch({ type: 'UPDATE_SETTINGS', payload: JSON.parse(savedSettings) });
            }
        } catch (error) {
            console.error("Failed to load settings from localStorage", error);
        }
    }, []);

    const translate = useCallback((key: string): string => {
        return TRANSLATIONS[state.language][key] || key;
    }, [state.language]);
    
    // Mock WebSocket connection to backend
    useEffect(() => {
        if (!state.isConnected) return;

        const ws = new WebSocket(`${WEBSOCKET_URL}/ws`);

        ws.onopen = () => {
             dispatch({ type: 'ADD_LOG', payload: { message: 'Backend WebSocket connected.', type: LogType.Success } });
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'log') {
                    dispatch({ type: 'ADD_LOG', payload: data.payload });
                }
                if (data.type === 'positions') {
                    dispatch({ type: 'SET_POSITIONS', payload: data.payload });
                }
            } catch (error) {
                 dispatch({ type: 'ADD_LOG', payload: { message: 'Received non-JSON WebSocket message.', type: LogType.Warning } });
            }
        };

        ws.onerror = (error) => {
            dispatch({ type: 'ADD_LOG', payload: { message: 'Backend WebSocket error.', type: LogType.Error } });
        };
        
        ws.onclose = () => {
            dispatch({ type: 'ADD_LOG', payload: { message: 'Backend WebSocket disconnected.', type: LogType.Warning } });
        };

        return () => {
            ws.close();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.isConnected]);

    return (
        <AppContext.Provider value={{ state, dispatch, translate }}>
            {children}
        </AppContext.Provider>
    );
};

// Hook
export const useAppContext = () => useContext(AppContext);
