import React, { createContext, useReducer, useContext, ReactNode, Dispatch, useCallback, useEffect } from 'react';
import { Settings, Position, LogEntry, Notification, Network, Language, LogType, UserState, UserStatus } from '../types';
import { TRANSLATIONS, TranslationKeys } from '../locales';
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
    user: UserState;
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
    | { type: 'SET_WEBHOOK_STATUS'; payload: boolean }
    | { type: 'SET_USER'; payload: Partial<UserState> }
    | { type: 'RESET_USER' };

// Initial State
const initialUserState: UserState = {
    uid: '',
    status: 'not_registered',
    accessKey: null,
    isLoggedIn: false,
    approvedStrategies: [],
};

const initialState: AppState = {
    isConnected: false,
    isConnecting: false,
    network: Network.Mainnet,  // ← Testnet에서 Mainnet으로 변경
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
    user: initialUserState,
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
        case 'SET_USER': {
            const nextUser: UserState = {
                ...state.user,
                ...action.payload,
            };

            if (action.payload.uid !== undefined) {
                nextUser.uid = action.payload.uid;
                nextUser.isLoggedIn = Boolean(action.payload.uid);

                if (!action.payload.uid) {
                    nextUser.status = 'not_registered';
                    nextUser.accessKey = null;
                    nextUser.approvedStrategies = [];
                }
            }

            if (action.payload.isLoggedIn !== undefined) {
                nextUser.isLoggedIn = action.payload.isLoggedIn;
            }

            return { ...state, user: nextUser };
        }
        case 'RESET_USER':
            return { ...state, user: initialUserState };
        default:
            return state;
    }
};

// Context
const AppContext = createContext<{
    state: AppState;
    dispatch: Dispatch<Action>;
    translate: (key: TranslationKeys) => string;
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

            // 저장된 언어 설정 불러오기
            const savedLanguage = localStorage.getItem('gateio_language');
            if (savedLanguage && ['ko', 'en', 'ja'].includes(savedLanguage)) {
                dispatch({ type: 'SET_LANGUAGE', payload: savedLanguage as Language });
            }

            // 저장된 네트워크 설정 불러오기
            const savedNetwork = localStorage.getItem('gateio_network') as Network | null;
            if (savedNetwork === Network.Mainnet || savedNetwork === Network.Testnet) {
                dispatch({ type: 'SET_NETWORK', payload: savedNetwork });
            }

            // 저장된 사용자 정보 불러오기
            const storedUid = localStorage.getItem('user_uid') || '';
            const storedStatus = (localStorage.getItem('user_status') as UserStatus | null) || 'not_registered';
            const storedAccessKey = localStorage.getItem('user_access_key');
            const storedStrategiesRaw = localStorage.getItem('user_approved_strategies');

            let storedStrategies: UserState['approvedStrategies'] = [];
            if (storedStrategiesRaw) {
                try {
                    const parsed = JSON.parse(storedStrategiesRaw);
                    if (Array.isArray(parsed)) {
                        storedStrategies = parsed
                            .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
                            .map((item) => ({ id: item.id, name: item.name }));
                    }
                } catch (parseError) {
                    console.error('Failed to parse stored strategies', parseError);
                }
            }

            if (storedUid || storedAccessKey || storedStrategies.length || storedStatus !== 'not_registered') {
                dispatch({
                    type: 'SET_USER',
                    payload: {
                        uid: storedUid,
                        status: storedStatus,
                        accessKey: storedAccessKey ?? null,
                        approvedStrategies: storedStrategies,
                        isLoggedIn: Boolean(storedUid),
                    },
                });
            }
        } catch (error) {
            console.error("Failed to load settings from localStorage", error);
        }
    }, []);

    // 사용자 정보 변경 시 localStorage에 저장
    useEffect(() => {
        try {
            if (state.user.uid) {
                localStorage.setItem('user_uid', state.user.uid);
            } else {
                localStorage.removeItem('user_uid');
            }

            localStorage.setItem('user_status', state.user.status || 'not_registered');

            if (state.user.accessKey) {
                localStorage.setItem('user_access_key', state.user.accessKey);
            } else {
                localStorage.removeItem('user_access_key');
            }

            if (state.user.approvedStrategies && state.user.approvedStrategies.length > 0) {
                localStorage.setItem('user_approved_strategies', JSON.stringify(state.user.approvedStrategies));
            } else {
                localStorage.removeItem('user_approved_strategies');
            }
        } catch (error) {
            console.error('Failed to persist user info', error);
        }
    }, [state.user]);

    // 언어 변경 시 localStorage에 저장
    useEffect(() => {
        localStorage.setItem('gateio_language', state.language);
    }, [state.language]);
    
    // 네트워크 변경 시 localStorage에 저장
    useEffect(() => {
        localStorage.setItem('gateio_network', state.network);
    }, [state.network]);

    const translate = useCallback((key: TranslationKeys): string => {
        return TRANSLATIONS[state.language][key] || key;
    }, [state.language]);
    
    // Mock WebSocket connection to backend (필요시)
    useEffect(() => {
        if (!state.isConnected || !WEBSOCKET_URL) return;

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