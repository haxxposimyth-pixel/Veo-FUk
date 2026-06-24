import React from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'gray' | 'blue' | 'purple' | 'amber' | 'green' | 'emerald' | 'danger' | 'brand';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'gray', className }) => {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border shrink-0',
        {
          'bg-gray-500/10 text-gray-400 border-gray-500/20': variant === 'gray',
          'bg-blue-500/10 text-blue-400 border-blue-500/20': variant === 'blue',
          'bg-purple-500/10 text-purple-400 border-purple-500/20': variant === 'purple',
          'bg-amber-500/10 text-amber-400 border-amber-500/20': variant === 'amber',
          'bg-green-500/10 text-green-400 border-green-500/20': variant === 'green',
          'bg-emerald-500/10 text-emerald-450 border-emerald-500/20': variant === 'emerald',
          'bg-rose-500/10 text-rose-450 border-rose-500/20': variant === 'danger',
          'bg-[#6C63FF]/10 text-[#6C63FF] border-[#6C63FF]/20': variant === 'brand',
        },
        className
      )}
    >
      {children}
    </span>
  );
};
export default Badge;
