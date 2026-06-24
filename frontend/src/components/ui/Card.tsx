import React from 'react';
import { cn } from '../../utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className, hoverable = false, ...props }) => {
  return (
    <div
      className={cn(
        'bg-[#111118] border border-[#2A2A38] rounded-xl p-5 relative overflow-hidden transition-all duration-300',
        hoverable ? 'hover:border-[#6C63FF]/50 hover:shadow-lg hover:shadow-[#6C63FF]/5 hover:-translate-y-0.5' : '',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
export default Card;
