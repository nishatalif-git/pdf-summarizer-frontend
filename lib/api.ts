import axios from 'axios';
import type {
  Book,
  Summary,
  ReadingProgress,
  Highlight,
  SummaryStatus,
  PDFPageDetails,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Book API
export const bookApi = {
  // Get all books
  getAll: async (): Promise<Book[]> => {
    const response = await api.get('/api/books');
    return response.data;
  },

  // Get book by ID
  getById: async (id: number): Promise<Book> => {
    const response = await api.get(`/api/books/${id}`);
    return response.data;
  },

  // Upload a new book
  upload: async (file: File): Promise<Book> => {
    const formData = new FormData();
    formData.append('pdf', file);

    const response = await api.post('/api/books/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data.book;
  },

  // Get page details
  getPage: async (bookId: number, pageNumber: number): Promise<PDFPageDetails> => {
    const response = await api.get(`/api/books/${bookId}/pages/${pageNumber}`);
    return response.data;
  },

  // Get page count
  getPageCount: async (bookId: number): Promise<number> => {
    const response = await api.get(`/api/books/${bookId}/page-count`);
    return response.data.totalPages;
  },

  // Delete a book
  delete: async (id: number): Promise<void> => {
    await api.delete(`/api/books/${id}`);
  },

  // Get file URL for PDF
  getFileUrl: (id: number): string => {
    return `${API_URL}/api/books/${id}/file`;
  },
};

// Summary API
export const summaryApi = {
  // Generate summary for pages
  generate: async (bookId: number, startPage: number, endPage: number, includeHighlights = true) => {
    const response = await api.post('/api/summaries/generate', {
      bookId,
      startPage,
      endPage,
      includeHighlights,
    });
    return response.data;
  },

  // Generate summaries for entire book
  generateBatch: async (bookId: number, batchSize = 1) => {
    const response = await api.post(`/api/summaries/generate-batch/${bookId}`, {
      batchSize,
    });
    return response.data;
  },

  // Get all summaries for a book
  getByBook: async (bookId: number): Promise<Summary[]> => {
    const response = await api.get(`/api/summaries/book/${bookId}`);
    return response.data;
  },

  // Get summary status
  getStatus: async (bookId: number): Promise<SummaryStatus> => {
    const response = await api.get(`/api/summaries/status/${bookId}`);
    return response.data;
  },

  // Get highlights for a summary
  getHighlights: async (summaryId: number): Promise<Highlight[]> => {
    const response = await api.get(`/api/summaries/${summaryId}/highlights`);
    return response.data;
  },

  // Get summary by page range
  getByRange: async (bookId: number, startPage: number, endPage: number) => {
    const response = await api.get(`/api/summaries/range/${bookId}/${startPage}/${endPage}`);
    return response.data;
  },

  // Get summaries for a specific page
  getByPage: async (bookId: number, pageNumber: number): Promise<Summary[]> => {
    const response = await api.get(`/api/summaries/page/${bookId}/${pageNumber}`);
    return response.data;
  },

  // Update summary
  update: async (summaryId: number, summaryText: string): Promise<Summary> => {
    const response = await api.put(`/api/summaries/${summaryId}`, { summaryText });
    return response.data.summary;
  },

  // Delete summary
  delete: async (summaryId: number): Promise<void> => {
    await api.delete(`/api/summaries/${summaryId}`);
  },

  // Delete all summaries for a book
  deleteByBook: async (bookId: number): Promise<void> => {
    await api.delete(`/api/summaries/book/${bookId}`);
  },
};

// Progress API
export const progressApi = {
  // Update reading progress
  update: async (bookId: number, currentPage: number, scrollPosition: number): Promise<ReadingProgress> => {
    const response = await api.post('/api/progress/update', {
      bookId,
      currentPage,
      scrollPosition,
    });
    return response.data.progress;
  },

  // Get reading progress for a book
  getByBook: async (bookId: number): Promise<ReadingProgress | null> => {
    const response = await api.get(`/api/progress/book/${bookId}`);
    return response.data;
  },

  // Update current page
  updatePage: async (bookId: number, currentPage: number): Promise<ReadingProgress> => {
    const response = await api.post('/api/progress/page', {
      bookId,
      currentPage,
    });
    return response.data.progress;
  },

  // Update scroll position
  updateScroll: async (bookId: number, scrollPosition: number): Promise<ReadingProgress> => {
    const response = await api.post('/api/progress/scroll', {
      bookId,
      scrollPosition,
    });
    return response.data.progress;
  },

  // Delete progress for a book
  delete: async (bookId: number): Promise<void> => {
    await api.delete(`/api/progress/book/${bookId}`);
  },
};

export default api;
