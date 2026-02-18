'use client';

import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Summary, Highlight } from '@/types';
import { useSummaries } from '@/hooks/useSummaries';

interface SummaryPanelProps {
  bookId: number;
  totalPages: number;
  currentPage: number;
  activeSummary: Summary | null;
  onSummaryClick: (summary: Summary) => void;
  onScroll?: (scrollTop: number, scrollHeight: number) => void;
}

// Git branch-style badge component
function GitBranchBadge({ pageNumber }: { pageNumber: number }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      fontSize: '0.7rem',
      fontWeight: 500,
      padding: '0.125rem 0.5rem',
      background: 'linear-gradient(135deg, #238636 0%, #2ea043 100%)',
      borderRadius: '1rem',
      color: '#ffffff',
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
    }}>
      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.9 }}>
        <path d="M11 2.5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5ZM7.5 5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5A.75.75 0 0 1 7.5 6.5V5ZM3.5 7.5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5ZM3.5 12a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5ZM7.5 10.5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5ZM11 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5A.75.75 0 0 1 11 9.5V8Z"/>
      </svg>
      p{pageNumber}
    </span>
  );
}

// Page range badge (like git branch with range)
function PageRangeBadge({ startPage, endPage }: { startPage: number; endPage: number }) {
  const isSinglePage = startPage === endPage;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.375rem',
      fontSize: '0.75rem',
      fontWeight: 600,
      padding: '0.25rem 0.625rem',
      background: isSinglePage
        ? 'linear-gradient(135deg, #8957e5 0%, #a371f7 100%)'
        : 'linear-gradient(135deg, #238636 0%, #2ea043 100%)',
      borderRadius: '2rem',
      color: '#ffffff',
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.15)',
      textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
    }}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.95 }}>
        <path d="M11 2.5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5ZM7.5 5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5A.75.75 0 0 1 7.5 6.5V5ZM3.5 7.5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5ZM3.5 12a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5ZM7.5 10.5a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5ZM11 8a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5A.75.75 0 0 1 11 9.5V8Z"/>
      </svg>
      {isSinglePage ? `p${startPage}` : `p${startPage}..p${endPage}`}
    </span>
  );
}

// Markdown content styles
const markdownStyles = {
  container: {
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.7,
  } as React.CSSProperties,
  heading: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginTop: '0.75rem',
    marginBottom: '0.375rem',
  } as React.CSSProperties,
  list: {
    marginLeft: '1.25rem',
    marginBottom: '0.5rem',
  } as React.CSSProperties,
  listItem: {
    marginBottom: '0.25rem',
  } as React.CSSProperties,
  code: {
    background: 'var(--bg-tertiary)',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    color: 'var(--accent-color)',
  } as React.CSSProperties,
  strong: {
    fontWeight: 600,
    color: 'var(--text-primary)',
  } as React.CSSProperties,
};

export default function SummaryPanel({
  bookId,
  totalPages,
  currentPage,
  activeSummary,
  onSummaryClick,
  onScroll,
}: SummaryPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { summaries, status, isLoading, isGenerating, error, generateSummary, generateAll } = useSummaries(bookId);

  const handleScroll = () => {
    if (containerRef.current && onScroll) {
      onScroll(
        containerRef.current.scrollTop,
        containerRef.current.scrollHeight - containerRef.current.clientHeight
      );
    }
  };

  const generateForCurrentPage = async () => {
    await generateSummary(currentPage, currentPage, true);
  };

  const generateAllSummaries = async () => {
    if (!confirm('Generate summaries for all pages? This may take a while.')) return;
    await generateAll(1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Summaries
        </h2>
        {status && (
          <span style={{
            fontSize: '0.75rem',
            padding: '0.125rem 0.5rem',
            background: 'var(--bg-tertiary)',
            borderRadius: '1rem',
            color: 'var(--text-secondary)'
          }}>
            {status.coveragePercent}%
          </span>
        )}
      </div>

      {/* Actions */}
      <div style={{
        padding: '0.5rem 1rem',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        gap: '0.5rem'
      }}>
        <button
          onClick={generateForCurrentPage}
          disabled={isGenerating}
          className="btn btn-primary"
          style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
        >
          {isGenerating ? 'Generating...' : 'Current Page'}
        </button>
        <button
          onClick={generateAllSummaries}
          disabled={isGenerating}
          className="btn btn-secondary"
          style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
        >
          Generate All
        </button>
      </div>

      {/* Progress */}
      {status && status.coveragePercent < 100 && (
        <div style={{
          padding: '0.5rem 1rem',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '0.25rem',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)'
          }}>
            <span>Progress</span>
            <span>{status.coveragePercent}%</span>
          </div>
          <div style={{
            height: '4px',
            background: 'var(--border-color)',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              background: 'var(--accent-color)',
              width: `${status.coveragePercent}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '0.5rem 1rem',
          borderBottom: '1px solid var(--border-color)',
          background: '#fef2f2',
          color: '#dc2626',
          fontSize: '0.75rem'
        }}>
          {error}
        </div>
      )}

      {/* Summaries */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflow: 'auto', padding: '1rem' }}
      >
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
            <div className="spinner" />
          </div>
        ) : summaries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>📝</div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              No summaries yet
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Generate summaries to get started
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {summaries.map((summary) => (
              <div
                key={summary.id}
                onClick={() => onSummaryClick(summary)}
                style={{
                  padding: '1rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.625rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: 'var(--bg-primary)',
                  ...(activeSummary?.id === summary.id ? {
                    borderColor: 'var(--accent-color)',
                    background: 'var(--bg-secondary)',
                    boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.1)',
                  } : {})
                }}
                onMouseEnter={(e) => {
                  if (activeSummary?.id !== summary.id) {
                    e.currentTarget.style.borderColor = 'var(--accent-color)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeSummary?.id !== summary.id) {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                {/* Header with git branch-style badge */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem',
                  paddingBottom: '0.5rem',
                  borderBottom: '1px solid var(--border-color)',
                }}>
                  <div style={{ flex: 1 }}>
                    <PageRangeBadge startPage={summary.page_start} endPage={summary.page_end} />
                  </div>
                  <span style={{
                    fontSize: '0.625rem',
                    padding: '0.125rem 0.375rem',
                    background: 'var(--bg-tertiary)',
                    borderRadius: '0.375rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'ui-monospace, monospace',
                  }}>
                    {new Date(summary.created_at || Date.now()).toLocaleDateString()}
                  </span>
                </div>

                {/* Markdown-rendered summary */}
                <div style={markdownStyles.container}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => <h1 style={markdownStyles.heading}>{children}</h1>,
                      h2: ({ children }) => <h2 style={{ ...markdownStyles.heading, fontSize: '0.8rem' }}>{children}</h2>,
                      h3: ({ children }) => <h3 style={{ ...markdownStyles.heading, fontSize: '0.775rem' }}>{children}</h3>,
                      p: ({ children }) => <p style={{ marginBottom: '0.5rem' }}>{children}</p>,
                      ul: ({ children }) => <ul style={markdownStyles.list}>{children}</ul>,
                      ol: ({ children }) => <ol style={markdownStyles.list}>{children}</ol>,
                      li: ({ children }) => <li style={markdownStyles.listItem}>{children}</li>,
                      code: ({ inline, children }) =>
                        inline ? (
                          <code style={markdownStyles.code}>{children}</code>
                        ) : (
                          <code style={{
                            ...markdownStyles.code,
                            display: 'block',
                            padding: '0.5rem',
                            margin: '0.5rem 0',
                            overflowX: 'auto',
                          }}>{children}</code>
                        ),
                      strong: ({ children }) => <strong style={markdownStyles.strong}>{children}</strong>,
                      em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                    }}
                  >
                    {summary.summary_text}
                  </ReactMarkdown>
                </div>

                {/* Highlights section */}
                {summary.highlights && summary.highlights.length > 0 && (
                  <div style={{
                    paddingTop: '0.75rem',
                    marginTop: '0.75rem',
                    borderTop: '1px solid var(--border-color)',
                  }}>
                    <p style={{
                      fontSize: '0.625rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.5rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      fontWeight: 500,
                    }}>
                      {summary.highlights.length} highlight{summary.highlights.length > 1 ? 's' : ''}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                      {summary.highlights.slice(0, 6).map((highlight) => (
                        <button
                          key={highlight.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSummaryClick(summary);
                          }}
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.125rem 0.5rem',
                            background: 'linear-gradient(135deg, #fd8c73 0%, #f778ba 100%)',
                            border: 'none',
                            borderRadius: '1rem',
                            color: '#ffffff',
                            cursor: 'pointer',
                            fontFamily: 'ui-monospace, monospace',
                            fontWeight: 500,
                            transition: 'transform 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '0.25rem', opacity: 0.9 }}>
                            <path d="M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"/>
                          </svg>
                          p{highlight.page_number}
                        </button>
                      ))}
                      {summary.highlights.length > 6 && (
                        <span style={{
                          fontSize: '0.65rem',
                          padding: '0.125rem 0.5rem',
                          background: 'var(--bg-tertiary)',
                          borderRadius: '1rem',
                          color: 'var(--text-muted)',
                        }}>
                          +{summary.highlights.length - 6}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
