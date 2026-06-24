import React from 'react';
import { cn } from '../../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading,
  disabled,
  ...props
}) => {
  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        {
          'bg-[#6C63FF] hover:bg-[#5b52eb] text-white shadow-lg shadow-[#6C63FF]/20': variant === 'primary',
          'bg-[#111118] hover:bg-[#1A1A24] text-gray-200 border border-[#2A2A38]': variant === 'secondary',
          'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20': variant === 'danger',
          'hover:bg-white/5 text-gray-400 hover:text-white': variant === 'ghost',
          'border border-[#2A2A38] hover:border-gray-500 text-gray-300': variant === 'outline',
          'px-3 py-1.5 text-xs': size === 'sm',
          'px-4.5 py-2.5 text-sm': size === 'md',
          'px-6 py-3.5 text-base': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : null}
      {children}
    </button>
  );
};
export default Button;
