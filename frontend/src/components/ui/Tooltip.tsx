import React, { useState } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  disabled?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, disabled = false }) => {
  const [show, setShow] = useState(false);

  if (disabled) return children;

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-[#1A1A24] border border-[#2A2A38] text-gray-300 text-xs rounded shadow-lg text-center font-medium pointer-events-none">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-[#2A2A38]" />
        </div>
      )}
    </div>
  );
};
export default Tooltip;
