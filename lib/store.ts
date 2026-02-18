import { create } from 'zustand';
import type { LayoutPosition, Highlight, Summary, Book } from '@/types';

interface ReaderStore {
  // Current book
  currentBook: Book | null;
  setCurrentBook: (book: Book | null) => void;

  // Layout state
  layout: LayoutPosition;
  setLayout: (layout: LayoutPosition) => void;
  toggleLayout: () => void;

  // Current page
  currentPage: number;
  setCurrentPage: (page: number) => void;

  // Scroll sync
  scrollSyncEnabled: boolean;
  toggleScrollSync: () => void;

  // Highlight state
  highlightedRegion: Highlight | null;
  setHighlightedRegion: (highlight: Highlight | null) => void;
  clearHighlight: () => void;

  // Active summary
  activeSummary: Summary | null;
  setActiveSummary: (summary: Summary | null) => void;

  // Sidebar state
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Reset store
  reset: () => void;
}

const initialState = {
  currentBook: null,
  layout: (typeof window !== 'undefined' && localStorage.getItem('reader-layout')) as LayoutPosition || 'summary-left',
  currentPage: 1,
  scrollSyncEnabled: true,
  highlightedRegion: null,
  activeSummary: null,
  sidebarOpen: false,
};

export const useReaderStore = create<ReaderStore>((set) => ({
  ...initialState,

  setCurrentBook: (book) => set({ currentBook: book }),

  setLayout: (layout) => {
    set({ layout });
    if (typeof window !== 'undefined') {
      localStorage.setItem('reader-layout', layout);
    }
  },

  toggleLayout: () =>
    set((state) => {
      const newLayout = state.layout === 'summary-left' ? 'summary-right' : 'summary-left';
      if (typeof window !== 'undefined') {
        localStorage.setItem('reader-layout', newLayout);
      }
      return { layout: newLayout };
    }),

  setCurrentPage: (page) => set({ currentPage: page }),

  toggleScrollSync: () => set((state) => ({ scrollSyncEnabled: !state.scrollSyncEnabled })),

  setHighlightedRegion: (highlight) => set({ highlightedRegion: highlight }),
  clearHighlight: () => set({ highlightedRegion: null }),

  setActiveSummary: (summary) => set({ activeSummary: summary }),

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  reset: () => set(initialState),
}));
