// Book types
export interface Book {
  id: number;
  title: string;
  filename: string;
  file_path: string;
  total_pages: number;
  upload_date: string;
  last_accessed: string;
  file_size: number;
}

// Summary types
export interface Summary {
  id: number;
  book_id: number;
  page_start: number;
  page_end: number;
  summary_text: string;
  created_at: string;
  highlights?: Highlight[];
}

export interface Highlight {
  id: number;
  book_id: number;
  summary_id: number;
  page_number: number;
  text_snippet: string | null;
  bounding_box: BoundingBox | null;
  char_start: number | null;
  char_end: number | null;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Reading progress types
export interface ReadingProgress {
  id: number;
  book_id: number;
  current_page: number;
  scroll_position: number;
  last_read: string;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// PDF Page types
export interface PDFPageDetails {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
  items: PDFTextItem[];
}

export interface PDFTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

// Summary status types
export interface SummaryStatus {
  totalSummaries: number;
  coveredRanges: Array<{ start: number; end: number }>;
  uncoveredRanges: Array<{ start: number; end: number }>;
  totalPages: number;
  coveragePercent: number;
}

// Layout types
export type LayoutPosition = 'summary-left' | 'summary-right';

// Reader state types
export interface ReaderState {
  bookId: number | null;
  currentPage: number;
  layout: LayoutPosition;
  scrollSyncEnabled: boolean;
  highlightedRegion: Highlight | null;
  activeSummary: Summary | null;
}
