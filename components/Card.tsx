
import React from 'react';

interface CardProps {
    title: string;
    children: React.ReactNode;
    className?: string;
}

const Card: React.FC<CardProps> = ({ title, children, className = '' }) => {
    return (
        <div className={`bg-gate-card rounded-2xl p-6 shadow-2xl transition-transform duration-300 hover:-translate-y-1 ${className}`}>
            <h2 className="text-lg font-semibold mb-5 text-gate-primary flex items-center gap-2">
                <span className="text-sm">▶</span>
                {title}
            </h2>
            {children}
        </div>
    );
};

export default Card;
