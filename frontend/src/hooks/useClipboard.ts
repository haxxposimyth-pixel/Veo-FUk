import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';

export function useClipboard() {
  const [hasCopied, setHasCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    if (!navigator.clipboard) {
      toast.error('Clipboard API not supported on this browser.');
      return false;
    }
    
    try {
      await navigator.clipboard.writeText(text);
      setHasCopied(true);
      toast.success('Copied to clipboard! ✓');
      
      setTimeout(() => {
        setHasCopied(false);
      }, 2000);
      
      return true;
    } catch (err) {
      console.error('Copy to clipboard failed:', err);
      toast.error('Failed to copy.');
      return false;
    }
  }, []);

  return { hasCopied, copy };
}
export type UseClipboardReturn = {
  hasCopied: boolean;
  copy: (text: string) => Promise<boolean>;
};
