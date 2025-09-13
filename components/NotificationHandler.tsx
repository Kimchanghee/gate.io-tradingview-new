
import React, { useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Notification } from '../types';

const NotificationItem: React.FC<{ notification: Notification; onDismiss: (id: number) => void }> = ({ notification, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss(notification.id);
        }, 5000);
        return () => clearTimeout(timer);
    }, [notification.id, onDismiss]);

    const baseClasses = 'p-4 rounded-xl shadow-lg text-white mb-3 transition-all duration-500';
    const typeClasses = {
        success: 'bg-green-500 border-l-4 border-green-300',
        error: 'bg-red-500 border-l-4 border-red-300',
        warning: 'bg-yellow-500 border-l-4 border-yellow-300',
        info: 'bg-blue-500 border-l-4 border-blue-300',
    };

    return (
        <div className={`${baseClasses} ${typeClasses[notification.type]} animate-[slide-in-right_0.5s_ease-out]`}>
            {notification.message}
        </div>
    );
};

const NotificationHandler: React.FC = () => {
    const { state, dispatch } = useAppContext();

    const handleDismiss = (id: number) => {
        dispatch({ type: 'REMOVE_NOTIFICATION', payload: id });
    };

    return (
        <div className="fixed top-5 right-5 w-80 z-50">
            {state.notifications.map(n => (
                <NotificationItem key={n.id} notification={n} onDismiss={handleDismiss} />
            ))}
        </div>
    );
};

export default NotificationHandler;
