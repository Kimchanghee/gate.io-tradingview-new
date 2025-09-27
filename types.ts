
export interface Settings {
    apiKey: string;
    apiSecret: string;
    symbol: string;
    investmentAmount: number;
    leverage: number;
}

export type UserStatus = 'not_registered' | 'pending' | 'approved' | 'denied' | string;

export interface UserStrategy {
    id: string;
    name: string;
}

export interface UserState {
    uid: string;
    status: UserStatus;
    accessKey: string | null;
    isLoggedIn: boolean;
    approvedStrategies: UserStrategy[];
    autoTradingEnabled: boolean;
}

export interface Position {
    contract: string;
    size: number;
    entry_price: string;
    mark_price: string;
    unrealised_pnl: string;
    margin: string;
}

export enum LogType {
    Info = 'info',
    Success = 'success',
    Warning = 'warning',
    Error = 'error',
}

export interface LogEntry {
    id: number;
    timestamp: string;
    message: string;
    type: LogType;
}

export interface Notification {
    id: number;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
}

export enum Network {
    Testnet = 'testnet',
    Mainnet = 'mainnet'
}

export interface AccountSummary {
    futuresAvailable: number;
    network: Network;
    isConnected: boolean;
    lastUpdated: string | null;
}

export type Language = 'ko' | 'en' | 'ja';
