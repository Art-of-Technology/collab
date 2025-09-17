"use client";

import { useEffect, useRef } from 'react';

interface UseViewTrackingOptions {
  itemType: string;
  itemId?: string;
  enabled?: boolean;
}

export function useViewTracking({ itemType, itemId, enabled = true }: UseViewTrackingOptions) {
  const lastTrackedRef = useRef<{ itemId: string; timestamp: number } | null>(null);

  useEffect(() => {
    if (!enabled || !itemId) {
      return;
    }

    const now = Date.now();
    const lastTracked = lastTrackedRef.current;
    
    // Rate limiting: don't track the same item more than once per 10 seconds
    if (lastTracked && lastTracked.itemId === itemId && (now - lastTracked.timestamp) < 10000) {
      return;
    }

    const trackView = async () => {
      try {
        const response = await fetch(`/api/board-items/${itemType}/${itemId}/view`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.activity) {
            console.log('View tracked successfully:', data.activity);
          }
          // Update last tracked info
          lastTrackedRef.current = {
            itemId,
            timestamp: now,
          };
        } else {
          console.warn('Failed to track view:', response.statusText);
        }
      } catch (error) {
        console.error('Error tracking view:', error);
      }
    };

    // Track after a small delay to ensure the page is loaded
    const timeoutId = setTimeout(trackView, 1000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [itemType, itemId, enabled]);
}
