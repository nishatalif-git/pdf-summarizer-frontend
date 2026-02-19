'use client';

import { useEffect, useRef, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { Highlight } from '@/types';
import { bookApi } from '@/lib/api';

// Set up worker - match the version exactly with the correct path
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs';
}

// Export ref type for parent components
export interface PDFViewerRef {
  navigateToPage: (page: number) => void;
}

interface PDFViewerProps {
  bookId: number;
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onScroll?: (scrollTop: number, scrollHeight: number) => void;
  onNavigationComplete?: (page: number) => void;
  highlightedRegion?: Highlight | null;
  scale?: number;
}

const PAGE_BUFFER = 5;
const SPACER_HEIGHT = 800;

// Helper functions for localStorage
const getScrollKey = (bookId: number) => `pdf-scroll-${bookId}`;
const getPageKey = (bookId: number) => `pdf-page-${bookId}`;

const PDFViewer = forwardRef<PDFViewerRef, PDFViewerProps>(function PDFViewer({
  bookId,
  totalPages,
  currentPage,
  onPageChange,
  onScroll,
  onNavigationComplete,
  highlightedRegion,
  scale = 1.0,
}, ref) {
  // === REFS ===
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLElement>>(new Map());
  const pageHeights = useRef<Map<number, number>>(new Map());

  // Ref for displayPage to avoid stale closures in setTimeout
  const displayPageRef = useRef(currentPage);

  // Navigation state refs
  const isNavigatingRef = useRef(false);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedPageRef = useRef(0);
  const lastSummaryPageRef = useRef(0);
  const saveScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedPagesRef = useRef<Set<number>>(new Set([1]));

  // === STATE ===
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [numPages, setNumPages] = useState<number>(totalPages);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [pageInput, setPageInput] = useState<string>(currentPage.toString());
  const [isEditing, setIsEditing] = useState(false);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set([1]));
  const [viewportRange, setViewportRange] = useState<{ start: number; end: number }>({ start: 1, end: 1 });
  const [scrollRatio, setScrollRatio] = useState<number>(0);
  const [displayPage, setDisplayPage] = useState<number>(currentPage);

  // === SYNC displayPage WITH currentPage PROP ===
  useEffect(() => {
    // Only update displayPage from prop if we're not in the middle of navigation
    if (!isNavigatingRef.current && displayPageRef.current !== currentPage) {
      displayPageRef.current = currentPage;
      setDisplayPage(currentPage);
      // Also update page input immediately
      if (!isEditing) {
        setPageInput(currentPage.toString());
      }
    }
  }, [currentPage, isEditing]);

  // Keep displayPageRef in sync with state
  useEffect(() => {
    displayPageRef.current = displayPage;
  }, [displayPage]);

  // Keep loadedPagesRef in sync with state (separate effect to avoid dependency issues)
  useEffect(() => {
    loadedPagesRef.current = loadedPages;
  }, [loadedPages]);

  // === INITIALIZE ===
  useEffect(() => {
    setPdfUrl(bookApi.getFileUrl(bookId));
    return () => {
      // Cleanup all timeouts
      if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current);
      if (pageLoadTimeoutRef.current) clearTimeout(pageLoadTimeoutRef.current);
      if (summaryTimeoutRef.current) clearTimeout(summaryTimeoutRef.current);
      if (saveScrollTimeoutRef.current) clearTimeout(saveScrollTimeoutRef.current);
    };
  }, [bookId]);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Update page input display
  useEffect(() => {
    if (!isEditing) {
      setPageInput(displayPage.toString());
    }
  }, [displayPage, isEditing]);

  // Save to localStorage (debounced)
  const saveToLocalStorage = useCallback((scrollTop: number, page: number) => {
    localStorage.setItem(getScrollKey(bookId), scrollTop.toString());
    localStorage.setItem(getPageKey(bookId), page.toString());
  }, [bookId]);

  // Save current page to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pageKey = getPageKey(bookId);
    localStorage.setItem(pageKey, currentPage.toString());
  }, [bookId, currentPage]);

  // === LOAD PAGES AROUND TARGET ===
  const loadPagesAround = useCallback((targetPage: number) => {
    const startPage = Math.max(1, targetPage - PAGE_BUFFER);
    const endPage = Math.min(numPages, targetPage + PAGE_BUFFER);

    // Read from ref to avoid dependency on state
    const currentLoadedPages = loadedPagesRef.current;
    const newLoadedPages = new Set<number>();

    // Keep existing loaded pages
    for (const page of currentLoadedPages) {
      newLoadedPages.add(page);
    }
    // Add new range
    for (let i = startPage; i <= endPage; i++) {
      newLoadedPages.add(i);
    }

    setLoadedPages(newLoadedPages);
    setViewportRange({ start: startPage, end: endPage });
  }, [numPages]);

  // === FIND PAGE CLOSEST TO VIEWPORT CENTER ===
  const findPageAtViewportCenter = useCallback((scrollTop: number, viewportHeight: number): number => {
    const containerCenter = scrollTop + viewportHeight / 2;
    let closestPage = 1;
    let minDistance = Infinity;

    // Read from ref to avoid dependency on state
    const currentLoadedPages = loadedPagesRef.current;

    for (const pageNum of currentLoadedPages) {
      const pageEl = pageRefs.current.get(pageNum);
      if (pageEl) {
        const pageCenter = pageEl.offsetTop + (pageEl.offsetHeight || SPACER_HEIGHT) / 2;
        const distance = Math.abs(pageCenter - containerCenter);
        if (distance < minDistance) {
          minDistance = distance;
          closestPage = pageNum;
        }
      }
    }

    return closestPage;
  }, []);

  // === SCROLL TO PAGE ===
  const scrollToPage = useCallback((page: number) => {
    if (!containerRef.current) return;

    const pageEl = pageRefs.current.get(page);

    if (page === 1) {
      containerRef.current.scrollTop = 0;
    } else if (page === numPages) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    } else if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // Page not loaded - estimate position
      const getPageOffset = (pageNum: number) => {
        let offset = 0;
        for (let i = 1; i < pageNum; i++) {
          offset += pageHeights.current.get(i) || SPACER_HEIGHT;
        }
        return offset;
      };
      containerRef.current.scrollTop = getPageOffset(page);
    }
  }, [numPages]);

  // === SINGLE UNIFIED SCROLL HANDLER ===
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const viewportHeight = container.clientHeight;

      // Consistent scroll ratio calculation
      const ratio = scrollHeight > viewportHeight
        ? scrollTop / (scrollHeight - viewportHeight)
        : 0;

      // Calculate estimated page from scroll position
      const estimatedPage = Math.min(numPages, Math.max(1, Math.ceil(ratio * (numPages - 1)) + 1));

      // IMMEDIATE: Update UI state (aggressive)
      setScrollRatio(ratio);
      displayPageRef.current = estimatedPage;
      setDisplayPage(estimatedPage);

      // If navigating, don't process further
      if (isNavigatingRef.current) {
        return;
      }

      // Debounced page loading (200ms)
      if (pageLoadTimeoutRef.current) clearTimeout(pageLoadTimeoutRef.current);
      pageLoadTimeoutRef.current = setTimeout(() => {
        const currentDisplayPage = displayPageRef.current;

        // Only load if page changed
        if (currentDisplayPage !== lastLoadedPageRef.current) {
          lastLoadedPageRef.current = currentDisplayPage;

          // Load pages around current position
          loadPagesAround(currentDisplayPage);

          // Find actual page at viewport center
          const actualPage = findPageAtViewportCenter(scrollTop, viewportHeight);

          // Only notify parent if page changed
          if (actualPage !== currentPage) {
            onPageChange(actualPage);
          }
        }

        // Call onScroll callback
        if (onScroll) {
          onScroll(scrollTop, scrollHeight - viewportHeight);
        }

        // Debounced save to localStorage (500ms)
        if (saveScrollTimeoutRef.current) clearTimeout(saveScrollTimeoutRef.current);
        saveScrollTimeoutRef.current = setTimeout(() => {
          saveToLocalStorage(scrollTop, displayPageRef.current);
        }, 500);
      }, 200);

      // Debounced summary loading (800ms) - only when scroll truly stops
      if (summaryTimeoutRef.current) clearTimeout(summaryTimeoutRef.current);
      summaryTimeoutRef.current = setTimeout(() => {
        const currentDisplayPage = displayPageRef.current;

        // Only trigger summary if page changed
        if (currentDisplayPage !== lastSummaryPageRef.current) {
          lastSummaryPageRef.current = currentDisplayPage;
          onNavigationComplete?.(currentDisplayPage);
        }
      }, 800);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (pageLoadTimeoutRef.current) clearTimeout(pageLoadTimeoutRef.current);
      if (summaryTimeoutRef.current) clearTimeout(summaryTimeoutRef.current);
      if (saveScrollTimeoutRef.current) clearTimeout(saveScrollTimeoutRef.current);
    };
  }, [numPages, currentPage, loadPagesAround, findPageAtViewportCenter, onPageChange, onScroll, onNavigationComplete, saveToLocalStorage]);

  // === RESTORE SCROLL POSITION ON MOUNT ===
  useEffect(() => {
    const restorePosition = () => {
      if (!containerRef.current) return;

      const savedScrollTop = localStorage.getItem(getScrollKey(bookId));
      const savedPage = localStorage.getItem(getPageKey(bookId));

      if (savedPage) {
        const pageNum = parseInt(savedPage, 10);
        displayPageRef.current = pageNum;
        setDisplayPage(pageNum);
        loadPagesAround(pageNum);
      }

      if (savedScrollTop) {
        containerRef.current.scrollTop = parseInt(savedScrollTop, 10);
      }
    };

    // Try immediately
    restorePosition();

    // Also try after a delay (for document load)
    const timeoutId = setTimeout(restorePosition, 100);

    return () => clearTimeout(timeoutId);
  }, [bookId, loadPagesAround]);

  // === DOCUMENT LOAD HANDLER ===
  const onDocumentLoadSuccess = useCallback(({ numPages: pages }: { numPages: number }) => {
    setNumPages(pages);

    // Load initial pages
    const savedPage = localStorage.getItem(getPageKey(bookId));
    const targetPage = savedPage ? parseInt(savedPage, 10) : 1;

    loadPagesAround(targetPage);

    // Restore position after pages render
    setTimeout(() => {
      if (containerRef.current) {
        const savedScrollTop = localStorage.getItem(getScrollKey(bookId));
        if (savedScrollTop) {
          containerRef.current.scrollTop = parseInt(savedScrollTop, 10);
        }

        if (savedPage) {
          const pageNum = parseInt(savedPage, 10);
          displayPageRef.current = pageNum;
          setDisplayPage(pageNum);
          onPageChange(pageNum);
        }
      }
    }, 500);
  }, [bookId, loadPagesAround, onPageChange]);

  // === PAGE LOAD HANDLERS ===
  const handlePageLoadSuccess = useCallback((pageNum: number) => {
    return () => {
      const pageEl = pageRefs.current.get(pageNum);
      if (pageEl) {
        pageHeights.current.set(pageNum, pageEl.offsetHeight);
      }
    };
  }, []);

  const handleRenderError = useCallback((error: Error) => {
    if (error?.name === 'AbortException' || error?.message?.includes('aborted')) {
      return;
    }
    console.error('PDF render error:', error);
  }, []);

  // === PAGE INPUT HANDLERS ===
  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const page = parseInt(pageInput);
      if (!isNaN(page) && page >= 1 && page <= numPages) {
        setIsEditing(false);
        navigateToPage(page);
      } else {
        setPageInput(displayPage.toString());
        setIsEditing(false);
      }
    } else if (e.key === 'Escape') {
      setPageInput(displayPage.toString());
      setIsEditing(false);
    }
  };

  const handlePageInputFocus = () => {
    setIsEditing(true);
  };

  const handlePageInputBlur = () => {
    const page = parseInt(pageInput);
    if (!isNaN(page) && page >= 1 && page <= numPages) {
      navigateToPage(page);
    } else {
      setPageInput(displayPage.toString());
    }
    setIsEditing(false);
  };

  // === CORE NAVIGATION FUNCTION ===
  const navigateToPage = useCallback((page: number) => {
    if (page < 1 || page > numPages) return;

    console.log(`[navigateToPage] Navigating to page ${page}`);

    // Set navigating flag (blocks scroll handler processing)
    isNavigatingRef.current = true;

    // Clear any existing navigation timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }

    // IMMEDIATE: Update UI state
    const pageRatio = numPages > 1 ? (page - 1) / (numPages - 1) : 0;
    setScrollRatio(pageRatio);
    displayPageRef.current = page;
    setDisplayPage(page);

    // Load pages around target
    loadPagesAround(page);

    // Notify parent of page change
    onPageChange(page);

    // Scroll to the page
    scrollToPage(page);

    // Clear navigating flag and trigger navigation complete after scroll
    navigationTimeoutRef.current = setTimeout(() => {
      isNavigatingRef.current = false;
      onNavigationComplete?.(page);
    }, 1000); // Give smooth scroll time to complete
  }, [numPages, loadPagesAround, onPageChange, scrollToPage, onNavigationComplete]);

  // Expose navigation method to parent
  useImperativeHandle(ref, () => ({
    navigateToPage: navigateToPage,
  }), [navigateToPage]);

  // === CALCULATIONS ===
  const totalHeight = useMemo(() => {
    let height = 0;
    for (let i = 1; i <= numPages; i++) {
      height += pageHeights.current.get(i) || SPACER_HEIGHT;
    }
    return height;
  }, [numPages]);

  const getPageOffset = useCallback((pageNum: number) => {
    let offset = 0;
    for (let i = 1; i < pageNum; i++) {
      offset += pageHeights.current.get(i) || SPACER_HEIGHT;
    }
    return offset;
  }, []);

  // === RENDER ===
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-secondary)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1rem',
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => navigateToPage(Math.max(1, displayPage - 1))}
            disabled={displayPage <= 1}
            className="btn btn-ghost"
            style={{ padding: '0.375rem 0.5rem' }}
          >
            ←
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.25rem 0.5rem',
            background: isEditing ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
            borderRadius: '0.5rem',
            borderWidth: isEditing ? '1px' : '1px',
            borderStyle: 'solid',
            borderColor: isEditing ? 'var(--accent-color)' : 'transparent',
            transition: 'all 0.15s ease',
          }}>
            <input
              type="text"
              value={pageInput}
              onChange={handlePageInputChange}
              onKeyDown={handlePageInputKeyDown}
              onFocus={handlePageInputFocus}
              onBlur={handlePageInputBlur}
              style={{
                width: '40px',
                fontSize: '0.875rem',
                color: 'var(--text-primary)',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                textAlign: 'center',
                fontFamily: 'ui-monospace, monospace',
                fontWeight: 600,
              }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              / {numPages}
            </span>
          </div>

          <button
            onClick={() => navigateToPage(Math.min(numPages, displayPage + 1))}
            disabled={displayPage >= numPages}
            className="btn btn-ghost"
            style={{ padding: '0.375rem 0.5rem' }}
          >
            →
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => navigateToPage(1)}
            className="btn btn-ghost"
            style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem' }}
          >
            First
          </button>
          <button
            onClick={() => navigateToPage(numPages)}
            className="btn btn-ghost"
            style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem' }}
          >
            Last
          </button>
        </div>
      </div>

      {/* PDF Container */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
        {pdfUrl ? (
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<div className="spinner" />}
          >
            <div style={{ position: 'relative', minWidth: '100%' }}>
              {/* Top spacer */}
              {viewportRange.start > 1 && (
                <div style={{ height: getPageOffset(viewportRange.start), minWidth: '100%' }} />
              )}

              {/* Loaded pages */}
              {Array.from(loadedPages).sort((a, b) => a - b).map((pageNum) => (
                <div
                  key={pageNum}
                  ref={(el) => {
                    if (el) pageRefs.current.set(pageNum, el);
                    else pageRefs.current.delete(pageNum);
                  }}
                  data-page={pageNum}
                  style={{ position: 'relative', marginBottom: '1rem' }}
                >
                  <Page
                    pageNumber={pageNum}
                    scale={scale}
                    width={Math.min(containerWidth - 32, 800)}
                    renderTextLayer={true}
                    renderAnnotationLayer={false}
                    onRenderSuccess={handlePageLoadSuccess(pageNum)}
                    onRenderError={handleRenderError}
                    loading={<div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading page {pageNum}...</div>}
                  />

                  {highlightedRegion && highlightedRegion.page_number === pageNum && highlightedRegion.bounding_box && (
                    <div
                      style={{
                        position: 'absolute',
                        top: `${highlightedRegion.bounding_box.y}px`,
                        left: `${highlightedRegion.bounding_box.x}px`,
                        width: `${highlightedRegion.bounding_box.width}px`,
                        height: `${highlightedRegion.bounding_box.height}px`,
                        background: 'rgba(59, 130, 246, 0.3)',
                        border: '2px solid #3b82f6',
                        borderRadius: '2px',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </div>
              ))}

              {/* Bottom spacer */}
              {viewportRange.end < numPages && (
                <div style={{ height: getPageOffset(numPages + 1) - getPageOffset(viewportRange.end + 1), minWidth: '100%' }} />
              )}
            </div>
          </Document>
        ) : (
          <div className="spinner" />
        )}
      </div>

      {/* Page Scrollbar */}
      <div style={{
        padding: '0.75rem 1rem',
        background: 'var(--bg-primary)',
        borderTop: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Page</span>

          <div
            style={{
              flex: 1,
              position: 'relative',
              height: '8px',
              background: 'var(--bg-tertiary)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const targetPage = Math.max(1, Math.min(numPages, Math.round(percentage * (numPages - 1)) + 1));
              navigateToPage(targetPage);
            }}
          >
            {/* Progress bar */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${scrollRatio * 100}%`,
              background: 'var(--accent-color)',
              borderRadius: '4px',
              transition: 'width 0.1s ease',
            }} />

            {/* Draggable thumb */}
            <div
              style={{
                position: 'absolute',
                left: `${scrollRatio * 100}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '16px',
                height: '16px',
                background: 'var(--accent-color)',
                border: '2px solid var(--bg-primary)',
                borderRadius: '50%',
                cursor: 'grab',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                transition: 'transform 0.1s ease',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                if (!rect) return;

                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const percentage = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
                  setScrollRatio(percentage);
                  const targetPage = Math.max(1, Math.min(numPages, Math.ceil(percentage * (numPages - 1)) + 1));
                  displayPageRef.current = targetPage;
                  setDisplayPage(targetPage);
                };

                const handleMouseUp = () => {
                  const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const targetPage = Math.max(1, Math.min(numPages, Math.round(percentage * (numPages - 1)) + 1));
                  navigateToPage(targetPage);
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            />
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', minWidth: '60px', textAlign: 'right' }}>
            {displayPage}/{numPages}
          </span>
        </div>
      </div>
    </div>
  );
});

export default PDFViewer;
