import { useCallback, useState } from 'react';

export function useChartWidth(designWidth: number) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const ref = useCallback((element: HTMLDivElement | null) => {
    if (!element || typeof window.ResizeObserver !== 'function') return;

    // Measure the container so a scrollable chart's minimum width cannot feed back into the measurement.
    const observer = new window.ResizeObserver(([entry]) => {
      setAvailableWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [Math.max(designWidth, availableWidth), ref] as const;
}
