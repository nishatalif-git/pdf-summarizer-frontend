'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { bookApi } from '@/lib/api';
import type { Book } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    bookApi.getAll().then(setBooks).finally(() => setIsLoading(false));
  }, []);

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const newBook = await bookApi.upload(file);
      setBooks(prev => [newBook, ...prev]);
      router.push(`/reader/${newBook.id}`);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload book. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const deleteBook = async (id: number) => {
    if (!confirm('Delete this book?')) return;

    try {
      await bookApi.delete(id);
      setBooks(prev => prev.filter(b => b.id !== id));
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete book.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-color)',
        padding: '1rem 2rem',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            PDF Reader
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Read PDFs with AI-powered summaries
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        {/* Upload Section */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            border: `2px dashed ${dragOver ? 'var(--accent-color)' : 'var(--border-color)'}`,
            borderRadius: '0.75rem',
            padding: '3rem 2rem',
            textAlign: 'center',
            background: dragOver ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
            transition: 'all 0.2s ease',
            cursor: 'pointer',
            marginBottom: '2rem'
          }}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileInput}
            style={{ display: 'none' }}
            id="file-input"
            disabled={isUploading}
          />
          <label htmlFor="file-input" style={{ cursor: 'pointer' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📄</div>
            <p style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              {isUploading ? 'Uploading...' : 'Drop a PDF here or click to browse'}
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Supports PDF files up to 100MB
            </p>
          </label>
        </div>

        {/* Books Section */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Your Books
          </h2>
          <span style={{
            fontSize: '0.75rem',
            padding: '0.25rem 0.75rem',
            background: 'var(--bg-tertiary)',
            borderRadius: '1rem',
            color: 'var(--text-secondary)'
          }}>
            {books.length} books
          </span>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
            <div className="spinner" />
          </div>
        ) : books.length === 0 ? (
          <div style={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '0.75rem',
            padding: '4rem 2rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>📚</div>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              No books yet
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Upload a PDF to get started
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem'
          }}>
            {books.map((book) => (
              <div
                key={book.id}
                onClick={() => router.push(`/reader/${book.id}`)}
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.75rem',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-color)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Cover */}
                <div style={{
                  height: '160px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '2.5rem'
                }}>
                  📖
                </div>

                {/* Info */}
                <div style={{ padding: '1rem' }}>
                  <h3 style={{
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    marginBottom: '0.5rem',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {book.title}
                  </h3>
                  <p style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginBottom: '0.25rem'
                  }}>
                    {book.total_pages} pages
                  </p>
                  <p style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    marginBottom: '1rem'
                  }}>
                    Added {new Date(book.upload_date).toLocaleDateString()}
                  </p>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => router.push(`/reader/${book.id}`)}
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                    >
                      Read
                    </button>
                    <button
                      onClick={() => deleteBook(book.id)}
                      className="btn btn-ghost"
                      style={{ padding: '0.5rem' }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
