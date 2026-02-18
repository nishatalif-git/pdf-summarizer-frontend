'use client';

import { useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useReaderStore } from '@/lib/store';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  defaultSizes?: [number, number];
  minSize?: number;
}

export default function SplitPane({ left, right, defaultSizes = [40, 60], minSize = 25 }: SplitPaneProps) {
  const { layout, toggleLayout } = useReaderStore();
  const [sizes, setSizes] = useState<[number, number]>(defaultSizes);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const summaryOnLeft = layout === 'summary-left';

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newPosition = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    const constrainedPosition = Math.max(minSize, Math.min(100 - minSize, newPosition));

    setSizes([constrainedPosition, 100 - constrainedPosition]);
  }, [isResizing, minSize]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', height: '100%', position: 'relative' }}
    >
      {/* Left Panel */}
      <div
        style={{
          width: `${summaryOnLeft ? sizes[0] : sizes[1]}%`,
          minWidth: `${minSize}%`,
          overflow: 'hidden',
          borderRight: '1px solid var(--border-color)'
        }}
      >
        {summaryOnLeft ? left : right}
      </div>

      {/* Resizer */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: '4px',
          cursor: 'col-resize',
          background: 'var(--border-color)',
          flexShrink: 0,
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '2px',
          height: '32px',
          background: 'var(--text-muted)',
          borderRadius: '1px',
          opacity: 0.3
        }} />
      </div>

      {/* Right Panel */}
      <div
        style={{
          flex: 1,
          minWidth: `${minSize}%`,
          overflow: 'hidden'
        }}
      >
        {summaryOnLeft ? right : left}
      </div>

      {/* Swap Button */}
      <button
        onClick={toggleLayout}
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          padding: '0.5rem',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '0.5rem',
          cursor: 'pointer',
          zIndex: 100,
          fontSize: '0.75rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent-color)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-color)';
        }}
        title="Swap panels"
      >
        ⇄
      </button>
    </div>
  );
}
