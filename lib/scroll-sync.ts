import { useRef, useCallback, useEffect, useState } from 'react';

interface ScrollSyncOptions {
  enabled?: boolean;
  syncThreshold?: number; // Minimum scroll distance to trigger sync (pixels)
  debounceMs?: number; // Debounce delay for scroll events
}

interface ScrollSyncState {
  isSyncing: boolean;
  syncSource: 'left' | 'right' | null;
}

/**
 * Custom hook for synchronized scrolling between two elements
 */
export function useScrollSync(
  leftRef: React.RefObject<HTMLDivElement>,
  rightRef: React.RefObject<HTMLDivElement>,
  options: ScrollSyncOptions = {}
) {
  const {
    enabled = true,
    syncThreshold = 10,
    debounceMs = 50,
  } = options;

  const [state, setState] = useState<ScrollSyncState>({
    isSyncing: false,
    syncSource: null,
  });

  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear any pending sync timeout
  const clearSyncTimeout = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
  }, []);

  // Calculate relative scroll position (0 to 1)
  const getScrollRatio = (element: HTMLElement): number => {
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight - element.clientHeight;
    return scrollHeight > 0 ? scrollTop / scrollHeight : 0;
  };

  // Handle scroll on left element
  const handleLeftScroll = useCallback(() => {
    if (!enabled || state.syncSource === 'left' || !leftRef.current || !rightRef.current) {
      return;
    }

    const leftElement = leftRef.current;
    const rightElement = rightRef.current;

    const leftRatio = getScrollRatio(leftElement);
    const rightScrollTop = leftRatio * (rightElement.scrollHeight - rightElement.clientHeight);

    // Only sync if scroll distance exceeds threshold
    const currentScroll = rightElement.scrollTop;
    if (Math.abs(rightScrollTop - currentScroll) < syncThreshold) {
      return;
    }

    setState({ isSyncing: true, syncSource: 'left' });
    rightElement.scrollTop = rightScrollTop;

    clearSyncTimeout();
    syncTimeoutRef.current = setTimeout(() => {
      setState({ isSyncing: false, syncSource: null });
    }, debounceMs);
  }, [enabled, state.syncSource, leftRef, rightRef, syncThreshold, debounceMs, clearSyncTimeout]);

  // Handle scroll on right element
  const handleRightScroll = useCallback(() => {
    if (!enabled || state.syncSource === 'right' || !leftRef.current || !rightRef.current) {
      return;
    }

    const rightElement = rightRef.current;
    const leftElement = leftRef.current;

    const rightRatio = getScrollRatio(rightElement);
    const leftScrollTop = rightRatio * (leftElement.scrollHeight - leftElement.clientHeight);

    // Only sync if scroll distance exceeds threshold
    const currentScroll = leftElement.scrollTop;
    if (Math.abs(leftScrollTop - currentScroll) < syncThreshold) {
      return;
    }

    setState({ isSyncing: true, syncSource: 'right' });
    leftElement.scrollTop = leftScrollTop;

    clearSyncTimeout();
    syncTimeoutRef.current = setTimeout(() => {
      setState({ isSyncing: false, syncSource: null });
    }, debounceMs);
  }, [enabled, state.syncSource, leftRef, rightRef, syncThreshold, debounceMs, clearSyncTimeout]);

  // Manually trigger sync from left to right
  const syncLeftToRight = useCallback(() => {
    if (!leftRef.current || !rightRef.current) return;
    handleLeftScroll();
  }, [leftRef, rightRef, handleLeftScroll]);

  // Manually trigger sync from right to left
  const syncRightToLeft = useCallback(() => {
    if (!leftRef.current || !rightRef.current) return;
    handleRightScroll();
  }, [leftRef, rightRef, handleRightScroll]);

  // Scroll to a specific ratio on both elements
  const scrollToRatio = useCallback((ratio: number) => {
    if (!leftRef.current || !rightRef.current) return;

    const leftElement = leftRef.current;
    const rightElement = rightRef.current;

    const leftScrollTop = ratio * (leftElement.scrollHeight - leftElement.clientHeight);
    const rightScrollTop = ratio * (rightElement.scrollHeight - rightElement.clientHeight);

    leftElement.scrollTop = leftScrollTop;
    rightElement.scrollTop = rightScrollTop;
  }, [leftRef, rightRef]);

  // Scroll to a percentage on both elements
  const scrollToPercent = useCallback((percent: number) => {
    scrollToRatio(percent / 100);
  }, [scrollToRatio]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      clearSyncTimeout();
    };
  }, [clearSyncTimeout]);

  return {
    isSyncing: state.isSyncing,
    syncSource: state.syncSource,
    handleLeftScroll,
    handleRightScroll,
    syncLeftToRight,
    syncRightToLeft,
    scrollToRatio,
    scrollToPercent,
    setEnabled: (enabled: boolean) => {
      // You can add state management for enabled if needed
    },
  };
}

/**
 * Calculate page number from scroll position
 */
export function getPageFromScroll(
  element: HTMLElement,
  totalPages: number,
  pageHeight?: number
): number {
  if (pageHeight) {
    return Math.min(totalPages, Math.max(1, Math.ceil(element.scrollTop / pageHeight)));
  }

  // If we don't know page height, estimate based on scroll ratio
  const ratio = getScrollRatio(element);
  return Math.min(totalPages, Math.max(1, Math.ceil(ratio * totalPages)));
}

/**
 * Calculate scroll position from page number
 */
export function getScrollFromPage(
  pageNumber: number,
  totalPages: number,
  elementHeight: number
): number {
  const ratio = (pageNumber - 1) / totalPages;
  return ratio * elementHeight;
}

function getScrollRatio(element: HTMLElement): number {
  const scrollTop = element.scrollTop;
  const scrollHeight = element.scrollHeight - element.clientHeight;
  return scrollHeight > 0 ? scrollTop / scrollHeight : 0;
}
