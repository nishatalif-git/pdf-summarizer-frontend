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
  highlightedRegion?: Highlight | null;
  scale?: number;
}

const PAGE_BUFFER = 5; // Number of pages to load before/after visible area (increased to reduce abort warnings)
const SPACER_HEIGHT = 800; // Estimated height for unloaded pages

const PDFViewer = forwardRef<PDFViewerRef, PDFViewerProps>(function PDFViewer({
  bookId,
  totalPages,
  currentPage,
  onPageChange,
  onScroll,
  highlightedRegion,
  scale = 1.0,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLElement>>(new Map());
  const pageHeights = useRef<Map<number, number>>(new Map());
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [numPages, setNumPages] = useState<number>(totalPages);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [pageInput, setPageInput] = useState<string>(currentPage.toString());
  const [isEditing, setIsEditing] = useState(false);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set([1]));
  const [viewportRange, setViewportRange] = useState<{ start: number; end: number }>({ start: 1, end: 1 });
  const isProgrammaticScrollRef = useRef(false); // Track programmatic scrolls
  const programmaticScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollEndTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const targetPageRef = useRef<number | null>(null); // Track the target page from programmatic navigation
  const loadedPagesRef = useRef<Set<number>>(new Set([1])); // Ref to loadedPages to avoid dependency issues
  const [isDraggingScrollbar, setIsDraggingScrollbar] = useState(false);
  const scrollbarTrackRef = useRef<HTMLDivElement>(null);

  // Keep the ref in sync with state
  useEffect(() => {
    loadedPagesRef.current = loadedPages;
  }, [loadedPages]);

  useEffect(() => {
    setPdfUrl(bookApi.getFileUrl(bookId));

    // Cleanup timeouts on unmount
    return () => {
      if (programmaticScrollTimeoutRef.current) {
        clearTimeout(programmaticScrollTimeoutRef.current);
      }
      if (scrollEndTimeoutRef.current) {
        clearTimeout(scrollEndTimeoutRef.current);
      }
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

  // Update page input when currentPage changes
  useEffect(() => {
    if (!isEditing) {
      setPageInput(currentPage.toString());
    }
  }, [currentPage, isEditing]);

  // Calculate which pages should be loaded based on scroll position
  const updateLoadedPages = useCallback(() => {
    if (!containerRef.current || numPages === 0) return;

    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;
    const scrollHeight = container.scrollHeight;

    // Calculate scroll ratio (0 to 1)
    const scrollRatio = scrollHeight > 0 ? scrollTop / scrollHeight : 0;

    // Estimate which page should be visible based on scroll ratio
    // This works even when pages aren't loaded yet
    const estimatedPage = Math.min(numPages, Math.max(1, Math.ceil(scrollRatio * numPages)));

    // Get current loaded pages as array from ref
    const currentLoadedPages = loadedPagesRef.current;
    const loadedPagesArray = Array.from(currentLoadedPages).sort((a, b) => a - b);

    // Find which LOADED page is closest to the viewport
    let currentViewportPage = estimatedPage;
    let minDistance = Infinity;

    if (loadedPagesArray.length > 0) {
      for (const pageNum of loadedPagesArray) {
        const pageEl = pageRefs.current.get(pageNum);
        if (pageEl) {
          const pageTop = pageEl.offsetTop;

          // Check if this page is in or near the viewport
          const distance = Math.abs(pageTop - scrollTop);
          if (distance < minDistance) {
            minDistance = distance;
            currentViewportPage = pageNum;
          }
        }
      }
    }

    // Calculate range of pages to keep loaded - limit the range
    const startPage = Math.max(1, currentViewportPage - PAGE_BUFFER);
    const endPage = Math.min(numPages, currentViewportPage + PAGE_BUFFER);

    // Calculate what we SHOULD have loaded
    const shouldLoad = new Set<number>();
    for (let i = startPage; i <= endPage; i++) {
      shouldLoad.add(i);
    }

    // Only update if the loaded pages are significantly different
    // This prevents unnecessary updates and loading loops
    const minDiffForUpdate = 2; // Only update if at least 2 pages differ

    let diffCount = 0;
    for (const page of shouldLoad) {
      if (!currentLoadedPages.has(page)) diffCount++;
    }
    for (const page of currentLoadedPages) {
      if (!shouldLoad.has(page)) diffCount++;
    }

    if (diffCount >= minDiffForUpdate) {
      setViewportRange({ start: startPage, end: endPage });
      setLoadedPages(shouldLoad);
    }

    // Skip updating page during programmatic scroll - let navigateToPage handle it
    if (isProgrammaticScrollRef.current) {
      return;
    }

    // If we have a target page from programmatic navigation, only update if we're close to it
    if (targetPageRef.current !== null) {
      // Only clear the target if we've reached it (within 1 page)
      const distanceToTarget = Math.abs(currentViewportPage - targetPageRef.current);
      if (distanceToTarget <= 1) {
        targetPageRef.current = null;
      }
      return; // Don't update page while target is set
    }

    // Update current page based on center of viewport
    const containerCenter = scrollTop + viewportHeight / 2;
    let closestPage = currentViewportPage;
    minDistance = Infinity;

    for (const pageNum of loadedPagesArray) {
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

    if (closestPage !== currentPage) {
      onPageChange(closestPage);
    }
  }, [currentPage, numPages, onPageChange]);

  // Debounced scroll handler
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleScroll = () => {
      // Skip if this is a programmatic scroll
      if (isProgrammaticScrollRef.current) {
        return;
      }

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        updateLoadedPages();

        if (containerRef.current && onScroll) {
          const scrollTop = containerRef.current.scrollTop;
          const scrollHeight = containerRef.current.scrollHeight - containerRef.current.clientHeight;
          onScroll(scrollTop, scrollHeight);
        }
      }, 100); // Increased debounce for smoother scrollbar dragging
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        container.removeEventListener('scroll', handleScroll);
        clearTimeout(timeoutId);
      };
    }
  }, [updateLoadedPages, onScroll]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoadedPages(new Set([1, 2, 3]));
  };

  // Track page heights
  const handlePageLoadSuccess = useCallback((pageNum: number) => {
    return () => {
      const pageEl = pageRefs.current.get(pageNum);
      if (pageEl) {
        const height = pageEl.offsetHeight;
        pageHeights.current.set(pageNum, height);
      }
    };
  }, []);

  // Handle render errors (suppress AbortException warnings from cancelled renders)
  const handleRenderError = useCallback((error: Error) => {
    // Ignore AbortException - it's expected when pages are unmounted during rendering
    if (error?.name === 'AbortException' || error?.message?.includes('aborted')) {
      return;
    }
    console.error('PDF render error:', error);
  }, []);

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const page = parseInt(pageInput);
      if (!isNaN(page) && page >= 1 && page <= numPages) {
        const startPage = Math.max(1, page - PAGE_BUFFER);
        const endPage = Math.min(numPages, page + PAGE_BUFFER);
        const newLoadedPages = new Set<number>();
        for (let i = startPage; i <= endPage; i++) {
          newLoadedPages.add(i);
        }
        setLoadedPages(newLoadedPages);
        onPageChange(page);
        setIsEditing(false);

        setTimeout(() => {
          scrollToPage(page);
        }, 100);
      } else {
        setPageInput(currentPage.toString());
        setIsEditing(false);
      }
    } else if (e.key === 'Escape') {
      setPageInput(currentPage.toString());
      setIsEditing(false);
    }
  };

  const handlePageInputFocus = () => {
    setIsEditing(true);
    setPageInput(currentPage.toString());
  };

  const handlePageInputBlur = () => {
    const page = parseInt(pageInput);
    if (!isNaN(page) && page >= 1 && page <= numPages) {
      onPageChange(page);
      scrollToPage(page);
    } else {
      setPageInput(currentPage.toString());
    }
    setIsEditing(false);
  };

  const scrollToPage = (page: number) => {
    const pageEl = pageRefs.current.get(page);
    if (pageEl && containerRef.current) {
      // Set flag to block scroll handler during programmatic scroll
      isProgrammaticScrollRef.current = true;

      // Clear any existing timeouts
      if (programmaticScrollTimeoutRef.current) {
        clearTimeout(programmaticScrollTimeoutRef.current);
      }
      if (scrollEndTimeoutRef.current) {
        clearTimeout(scrollEndTimeoutRef.current);
      }

      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Keep flag set during smooth scroll, then clear after a longer delay
      // Smooth scroll can take up to 2-3 seconds for large documents
      programmaticScrollTimeoutRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 3000);
    }
  };

  // Expose navigation method to parent component
  useImperativeHandle(ref, () => ({
    navigateToPage: (page: number) => {
      // Set the target page to prevent scroll-based updates from overriding it
      targetPageRef.current = page;

      // Load pages around the target - create a fresh set like manual input does
      const startPage = Math.max(1, page - PAGE_BUFFER);
      const endPage = Math.min(numPages, page + PAGE_BUFFER);

      const newLoadedPages = new Set<number>();
      for (let i = startPage; i <= endPage; i++) {
        newLoadedPages.add(i);
      }
      setLoadedPages(newLoadedPages);
      // Note: Don't set viewportRange manually - let scroll handler update it naturally

      // Update page state and scroll
      onPageChange(page);

      // Scroll to the page after a short delay to allow rendering
      setTimeout(() => scrollToPage(page), 100);
    },
  }), [numPages, onPageChange]);

  // Calculate total document height (known + estimated)
  const totalHeight = useMemo(() => {
    let height = 0;
    for (let i = 1; i <= numPages; i++) {
      height += pageHeights.current.get(i) || SPACER_HEIGHT;
    }
    return height;
  }, [numPages]);

  // Calculate offset for each page
  const getPageOffset = useCallback((pageNum: number) => {
    let offset = 0;
    for (let i = 1; i < pageNum; i++) {
      const height = pageHeights.current.get(i);
      offset += height || SPACER_HEIGHT;
    }
    return offset;
  }, []); // Empty deps - this will recalculate when pageHeights changes due to render

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
            onClick={() => {
              const newPage = Math.max(1, currentPage - 1);
              onPageChange(newPage);
              scrollToPage(newPage);
            }}
            disabled={currentPage <= 1}
            className="btn btn-ghost"
            style={{ padding: '0.375rem 0.5rem' }}
          >
            ←
          </button>

          {/* Page Input */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.25rem 0.5rem',
            background: isEditing
              ? 'var(--bg-secondary)'
              : 'var(--bg-tertiary)',
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
            <span style={{
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}>
              / {numPages}
            </span>
          </div>

          <button
            onClick={() => {
              const newPage = Math.min(numPages, currentPage + 1);
              onPageChange(newPage);
              scrollToPage(newPage);
            }}
            disabled={currentPage >= numPages}
            className="btn btn-ghost"
            style={{ padding: '0.375rem 0.5rem' }}
          >
            →
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => {
              onPageChange(1);
              scrollToPage(1);
            }}
            className="btn btn-ghost"
            style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem' }}
          >
            First
          </button>
          <button
            onClick={() => {
              onPageChange(numPages);
              scrollToPage(numPages);
            }}
            className="btn btn-ghost"
            style={{ padding: '0.375rem 0.5rem', fontSize: '0.75rem' }}
          >
            Last
          </button>
        </div>
      </div>

      {/* PDF Container - Virtual scroll */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'auto', padding: '1rem' }}
      >
        {pdfUrl ? (
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<div className="spinner" />}
          >
            <div style={{ position: 'relative', minWidth: '100%' }}>
              {/* Top spacer for unloaded pages */}
              {viewportRange.start > 1 && (
                <div style={{
                  height: getPageOffset(viewportRange.start),
                  minWidth: '100%'
                }} />
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

              {/* Bottom spacer for unloaded pages */}
              {viewportRange.end < numPages && (
                <div style={{
                  height: getPageOffset(numPages + 1) - getPageOffset(viewportRange.end + 1),
                  minWidth: '100%'
                }} />
              )}
            </div>
          </Document>
        ) : (
          <div className="spinner" />
        )}
      </div>

      {/* Enhanced Page Scrollbar */}
      <div style={{
        padding: '0.75rem 1rem',
        background: 'var(--bg-primary)',
        borderTop: '1px solid var(--border-color)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Page</span>

          {/* Custom scrollbar container */}
          <div
            ref={scrollbarTrackRef}
            style={{
              flex: 1,
              position: 'relative',
              height: '8px',
              background: 'var(--bg-tertiary)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
            onClick={(e) => {
              // Only handle click on the track, not on the thumb
              if (e.target !== scrollbarTrackRef.current) return;

              if (!scrollbarTrackRef.current) return;

              const trackRect = scrollbarTrackRef.current.getBoundingClientRect();
              const percentage = Math.max(0, Math.min(1, (e.clientX - trackRect.left) / trackRect.width));
              const targetPage = Math.max(1, Math.min(numPages, Math.round(percentage * (numPages - 1)) + 1));

              // Navigate to the page
              targetPageRef.current = targetPage;
              onPageChange(targetPage);

              // Load pages around target (PAGE_BUFFER = 5)
              const startPage = Math.max(1, targetPage - PAGE_BUFFER);
              const endPage = Math.min(numPages, targetPage + PAGE_BUFFER);
              const newLoadedPages = new Set<number>();
              for (let i = startPage; i <= endPage; i++) {
                newLoadedPages.add(i);
              }
              setLoadedPages(newLoadedPages);

              // Scroll to the page
              setTimeout(() => {
                scrollToPage(targetPage);
                setTimeout(() => {
                  targetPageRef.current = null;
                }, 500);
              }, 50);
            }}
          >
            {/* Progress fill */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${((currentPage - 1) / (numPages - 1 || 1)) * 100}%`,
              background: 'var(--accent-color)',
              borderRadius: '4px',
              transition: isDraggingScrollbar ? 'none' : 'width 0.15s ease',
            }} />

            {/* Draggable thumb */}
            <div
              style={{
                position: 'absolute',
                left: `${((currentPage - 1) / (numPages - 1 || 1)) * 100}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '16px',
                height: '16px',
                background: 'var(--accent-color)',
                border: '2px solid var(--bg-primary)',
                borderRadius: '50%',
                cursor: 'grab',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                transition: isDraggingScrollbar ? 'none' : 'transform 0.15s ease',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingScrollbar(true);

                const handleMouseMove = (moveEvent: MouseEvent) => {
                  if (!scrollbarTrackRef.current) return;

                  const trackRect = scrollbarTrackRef.current.getBoundingClientRect();
                  const percentage = Math.max(0, Math.min(1, (moveEvent.clientX - trackRect.left) / trackRect.width));
                  const targetPage = Math.max(1, Math.min(numPages, Math.round(percentage * (numPages - 1)) + 1));

                  // Only update if page actually changed
                  if (targetPage !== currentPage) {
                    // Set target to prevent scroll interference
                    targetPageRef.current = targetPage;

                    // Update page state immediately for responsive UI
                    onPageChange(targetPage);

                    // Load pages around target only (PAGE_BUFFER = 5)
                    const startPage = Math.max(1, targetPage - PAGE_BUFFER);
                    const endPage = Math.min(numPages, targetPage + PAGE_BUFFER);
                    const newLoadedPages = new Set<number>();
                    for (let i = startPage; i <= endPage; i++) {
                      newLoadedPages.add(i);
                    }
                    setLoadedPages(newLoadedPages);
                  }
                };

                const handleMouseUp = () => {
                  setIsDraggingScrollbar(false);

                  // Scroll to the final page after drag ends
                  setTimeout(() => {
                    if (targetPageRef.current !== null) {
                      scrollToPage(targetPageRef.current);
                      // Clear target after scroll completes
                      setTimeout(() => {
                        targetPageRef.current = null;
                      }, 500);
                    }
                  }, 50);

                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            />
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', minWidth: '60px', textAlign: 'right' }}>
            {currentPage}/{numPages}
          </span>
        </div>
      </div>
    </div>
  );
});

export default PDFViewer;
