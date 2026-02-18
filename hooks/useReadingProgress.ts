import { useState, useEffect, useCallback, useRef } from 'react';
import { progressApi } from '@/lib/api';
import type { ReadingProgress } from '@/types';
import axios from 'axios';

interface UseReadingProgressOptions {
  autoSave?: boolean;
  saveDelay?: number; // Delay in ms before saving (debounce)
}

export function useReadingProgress(
  bookId: number | null,
  options: UseReadingProgressOptions = {}
) {
  const { autoSave = true, saveDelay = 2000 } = options;

  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load progress for the book
  const loadProgress = useCallback(async () => {
    if (!bookId) return null;

    setIsLoading(true);
    setError(null);

    try {
      const data = await progressApi.getByBook(bookId);
      setProgress(data);
      return data;
    } catch (err) {
      // 404 is expected if no progress exists yet - treat as null progress
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setProgress(null);
        return null;
      }
      setError(err instanceof Error ? err.message : 'Failed to load progress');
      console.error('Error loading reading progress:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  // Save progress (debounced)
  const saveProgress = useCallback(
    async (currentPage: number, scrollPosition: number) => {
      if (!bookId || !autoSave) return;

      // Clear any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Schedule a new save
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const data = await progressApi.update(bookId, currentPage, scrollPosition);
          setProgress(data);
        } catch (err) {
          // Ignore 404 errors - they mean no progress record exists yet
          if (!axios.isAxiosError(err) || err.response?.status !== 404) {
            console.error('Error saving reading progress:', err);
          }
        }
      }, saveDelay);
    },
    [bookId, autoSave, saveDelay]
  );

  // Update current page
  const updatePage = useCallback(
    async (currentPage: number) => {
      if (!bookId) return;

      try {
        const data = await progressApi.updatePage(bookId, currentPage);
        setProgress(data);
      } catch (err) {
        // Ignore 404 errors - they mean no progress record exists yet
        if (!axios.isAxiosError(err) || err.response?.status !== 404) {
          console.error('Error updating page:', err);
        }
      }
    },
    [bookId]
  );

  // Update scroll position
  const updateScroll = useCallback(
    async (scrollPosition: number) => {
      if (!bookId) return;

      try {
        const data = await progressApi.updateScroll(bookId, scrollPosition);
        setProgress(data);
      } catch (err) {
        // Ignore 404 errors - they mean no progress record exists yet
        if (!axios.isAxiosError(err) || err.response?.status !== 404) {
          console.error('Error updating scroll:', err);
        }
      }
    },
    [bookId]
  );

  // Reset progress for the current book
  const resetProgress = useCallback(async () => {
    if (!bookId) return;

    try {
      await progressApi.delete(bookId);
      setProgress(null);
    } catch (err) {
      // Ignore 404 errors - progress doesn't exist anyway
      if (!axios.isAxiosError(err) || err.response?.status !== 404) {
        console.error('Error resetting progress:', err);
      } else {
        // Progress was already null/doesn't exist
        setProgress(null);
      }
    }
  }, [bookId]);

  // Load progress when bookId changes
  useEffect(() => {
    if (bookId) {
      loadProgress();
    } else {
      setProgress(null);
    }
  }, [bookId, loadProgress]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    progress,
    isLoading,
    error,
    saveProgress,
    updatePage,
    updateScroll,
    resetProgress,
    loadProgress,
  };
}
