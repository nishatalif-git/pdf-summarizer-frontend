import { useState, useEffect, useCallback } from 'react';
import { summaryApi } from '@/lib/api';
import type { Summary, SummaryStatus } from '@/types';
import axios from 'axios';

// Get user-friendly error message (standalone utility function)
const getErrorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as { error?: string; message?: string; detail?: string };

    if (status === 500) {
      return data?.error || data?.message || data?.detail || 'Server error. Please try again later.';
    }
    if (status === 404) {
      return 'Service not found. Please check if the summary service is running.';
    }
    if (status === 401) {
      return 'Unauthorized. Please log in again.';
    }
    if (data?.error) {
      return data.error;
    }
    if (data?.message) {
      return data.message;
    }
    if (data?.detail) {
      return data.detail;
    }
    return err.message || 'An error occurred';
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'An unexpected error occurred';
};

export function useSummaries(bookId: number | null) {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [status, setStatus] = useState<SummaryStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all summaries for the book
  const loadSummaries = useCallback(async () => {
    if (!bookId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await summaryApi.getByBook(bookId);
      setSummaries(data);
    } catch (err) {
      setError(getErrorMessage(err));
      console.error('Error loading summaries:', err);
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  // Load summary status
  const loadStatus = useCallback(async () => {
    if (!bookId) return;

    try {
      const data = await summaryApi.getStatus(bookId);
      setStatus(data);
    } catch (err) {
      console.error('Error loading summary status:', err);
    }
  }, [bookId]);

  // Generate a new summary
  const generateSummary = useCallback(
    async (startPage: number, endPage: number, includeHighlights = true) => {
      if (!bookId) {
        setError('No book selected');
        return;
      }

      setIsGenerating(true);
      setError(null);

      try {
        const result = await summaryApi.generate(bookId, startPage, endPage, includeHighlights);

        // Reload summaries after generation
        await loadSummaries();
        await loadStatus();

        return result;
      } catch (err) {
        const errorMessage = getErrorMessage(err);
        setError(errorMessage);
        // Don't throw - let the component handle the error state
        console.error('Error generating summary:', err);
      } finally {
        setIsGenerating(false);
      }
    },
    [bookId, loadSummaries, loadStatus]
  );

  // Generate summaries for the entire book
  const generateAll = useCallback(
    async (batchSize = 1) => {
      if (!bookId) {
        setError('No book selected');
        return;
      }

      try {
        await summaryApi.generateBatch(bookId, batchSize);

        // Reload summaries after a delay
        setTimeout(() => {
          loadSummaries();
          loadStatus();
        }, 1000);
      } catch (err) {
        const errorMessage = getErrorMessage(err);
        setError(errorMessage);
        // Don't throw - let the component handle the error state
        console.error('Error generating summaries:', err);
      }
    },
    [bookId, loadSummaries, loadStatus]
  );

  // Update a summary
  const updateSummary = useCallback(async (summaryId: number, summaryText: string) => {
    try {
      const updated = await summaryApi.update(summaryId, summaryText);
      setSummaries(prev =>
        prev.map(s => (s.id === summaryId ? { ...s, ...updated } : s))
      );
      return updated;
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Error updating summary:', err);
      throw err;
    }
  }, []);

  // Delete a summary
  const deleteSummary = useCallback(async (summaryId: number) => {
    try {
      await summaryApi.delete(summaryId);
      setSummaries(prev => prev.filter(s => s.id !== summaryId));
      await loadStatus();
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Error deleting summary:', err);
      throw err;
    }
  }, [loadStatus]);

  // Get summaries for a specific page
  const getSummariesForPage = useCallback(
    (pageNumber: number): Summary[] => {
      return summaries.filter(
        s => pageNumber >= s.page_start && pageNumber <= s.page_end
      );
    },
    [summaries]
  );

  // Get summary for a page range
  const getSummaryForRange = useCallback(
    (startPage: number, endPage: number): Summary | undefined => {
      return summaries.find(
        s => s.page_start === startPage && s.page_end === endPage
      );
    },
    [summaries]
  );

  // Load summaries when bookId changes
  useEffect(() => {
    if (bookId) {
      loadSummaries();
      loadStatus();
    } else {
      setSummaries([]);
      setStatus(null);
    }
  }, [bookId, loadSummaries, loadStatus]);

  return {
    summaries,
    status,
    isLoading,
    isGenerating,
    error,
    loadSummaries,
    loadStatus,
    generateSummary,
    generateAll,
    updateSummary,
    deleteSummary,
    getSummariesForPage,
    getSummaryForRange,
  };
}
