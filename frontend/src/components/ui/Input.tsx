import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, type = 'text', ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
            {label}
          </label>
        )}
        <input
          ref={ref}
          type={type}
          className={cn(
            'w-full px-4 py-2.5 bg-[#0A0A0F] border border-[#2A2A38] rounded-lg text-sm text-white focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF] transition-all placeholder-gray-600 disabled:opacity-50 disabled:cursor-not-allowed',
            error ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' : '',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-rose-500 font-semibold">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
export default Input;
