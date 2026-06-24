import { useState, useEffect, useRef } from 'react';

export function useAutoSave<T>(
  data: T,
  saveFn: (latestData: T) => Promise<void>,
  delay = 1500
) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const isFirstRender = useRef(true);
  const saveFnRef = useRef(saveFn);

  // Keep saveFn fresh
  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  useEffect(() => {
    // Skip auto-save on initial mount
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const projectData = data as any;
    if (
      projectData &&
      ('topic' in projectData) &&
      (!projectData.topic || projectData.topic.trim().length < 3)
    ) {
      return;
    }

    setStatus('saving');

    const handler = setTimeout(async () => {
      try {
        await saveFnRef.current(data);
        setStatus('saved');
        
        // Reset to idle after 2 seconds to let the badge fade away
        const fadeHandler = setTimeout(() => {
          setStatus('idle');
        }, 2000);

        return () => clearTimeout(fadeHandler);
      } catch (err) {
        console.error('Auto-save failed:', err);
        setStatus('error');
      }
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [data, delay]);

  return status;
}
export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
