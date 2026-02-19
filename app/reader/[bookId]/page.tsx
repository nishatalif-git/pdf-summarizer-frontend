'use client';

import { useState, useEffect, useRef, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { bookApi } from '@/lib/api';
import { useReaderStore } from '@/lib/store';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { useScrollSync } from '@/lib/scroll-sync';
import PDFViewer, { PDFViewerRef } from '@/components/PDFViewer';
import SummaryPanel from '@/components/SummaryPanel';
import SplitPane from '@/components/SplitPane';
import type { Book, Highlight } from '@/types';

export default function ReaderPage({ params }: { params: Promise<{ bookId: string }> }) {
  const router = useRouter();
  const { bookId } = use(params);
  const id = parseInt(bookId);
  const [book, setBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    setCurrentBook,
    currentPage,
    setCurrentPage,
    highlightedRegion,
    setHighlightedRegion,
    activeSummary,
    setActiveSummary,
  } = useReaderStore();

  const { progress, saveProgress, loadProgress } = useReadingProgress(id);

  const summaryRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const pdfViewerRef = useRef<PDFViewerRef>(null);

  const { handleLeftScroll, handleRightScroll } = useScrollSync(
    summaryRef,
    pdfRef,
    { enabled: true }
  );

  useEffect(() => {
    const loadBook = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const bookData = await bookApi.getById(id);
        setBook(bookData);
        setCurrentBook(bookData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load book');
        console.error('Error loading book:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadBook();
  }, [id, setCurrentBook]);

  useEffect(() => {
    if (book) {
      loadProgress().then((progressData) => {
        if (progressData && progressData.current_page) {
          setCurrentPage(progressData.current_page);
        }
      });
    }
  }, [book, loadProgress, setCurrentPage]);

  useEffect(() => {
    if (book && currentPage) {
      saveProgress(currentPage, 0);
    }
  }, [book, currentPage, saveProgress]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    setHighlightedRegion(null);
    // Don't clear activeSummary here - let navigation complete handle it
    // This allows summary to stay visible during navigation
  }, [setCurrentPage, setHighlightedRegion]);

  const handleNavigationComplete = useCallback((page: number) => {
    // Navigation completed - clear highlights and let SummaryPanel auto-select summary
    setHighlightedRegion(null);
    // The SummaryPanel will auto-select the appropriate summary based on currentPage
  }, [setHighlightedRegion]);

  const handleSummaryClick = useCallback((summary: any) => {
    setActiveSummary(summary);

    if (summary.page_start) {
      // Clear active states first
      setHighlightedRegion(null);
      setActiveSummary(null);

      // Use PDFViewer's navigation method (it will call onPageChange)
      pdfViewerRef.current?.navigateToPage(summary.page_start);
    }

    if (summary.highlights && summary.highlights.length > 0) {
      setHighlightedRegion(summary.highlights[0]);
    }
  }, [setActiveSummary, setHighlightedRegion]);

  const handlePDFScroll = useCallback(() => {
    handleRightScroll();
  }, [handleRightScroll]);

  const handleSummaryScrollEvent = useCallback(() => {
    handleLeftScroll();
  }, [handleLeftScroll]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!book) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          if (currentPage > 1) handlePageChange(currentPage - 1);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          if (currentPage < book.total_pages) handlePageChange(currentPage + 1);
          break;
        case 'Home':
          handlePageChange(1);
          break;
        case 'End':
          handlePageChange(book.total_pages);
          break;
        case 'Escape':
          setHighlightedRegion(null);
          setActiveSummary(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [book, currentPage, handlePageChange, setHighlightedRegion, setActiveSummary]);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-secondary)'
      }}>
        <div className="spinner" />
      </div>
    );
  }

  if (error || !book) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-secondary)',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '3rem', opacity: 0.5 }}>⚠️</div>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
          {error || 'Book not found'}
        </p>
        <button onClick={() => router.push('/')} className="btn btn-primary">
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1rem',
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => router.push('/')}
            className="btn btn-ghost"
            style={{ padding: '0.375rem 0.5rem' }}
          >
            ←
          </button>
          <div>
            <h1 style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '300px'
            }}>
              {book.title}
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Page {currentPage} of {book.total_pages}
            </p>
          </div>
        </div>

        {progress && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.25rem 0.75rem',
            background: 'var(--bg-secondary)',
            borderRadius: '1rem',
            fontSize: '0.75rem',
            color: 'var(--text-muted)'
          }}>
            <span>📖</span>
            <span>{new Date(progress.last_read).toLocaleDateString()}</span>
          </div>
        )}
      </header>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <SplitPane
          left={
            <div ref={summaryRef} style={{ height: '100%' }}>
              <SummaryPanel
                bookId={id}
                totalPages={book.total_pages}
                currentPage={currentPage}
                activeSummary={activeSummary}
                onSummaryClick={handleSummaryClick}
                onScroll={handleSummaryScrollEvent}
              />
            </div>
          }
          right={
            <div ref={pdfRef} style={{ height: '100%' }}>
              <PDFViewer
                ref={pdfViewerRef}
                bookId={id}
                totalPages={book.total_pages}
                currentPage={currentPage}
                onPageChange={handlePageChange}
                onNavigationComplete={handleNavigationComplete}
                onScroll={handlePDFScroll}
                highlightedRegion={highlightedRegion}
              />
            </div>
          }
        />
      </div>
    </div>
  );
}
