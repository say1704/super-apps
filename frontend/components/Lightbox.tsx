"use client";

import { useState, useEffect, useCallback } from 'react';

interface LightboxProps {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
  onDelete?: (index: number) => void;
  canDelete?: boolean;
}

export default function Lightbox({ photos, initialIndex, onClose, onDelete, canDelete = false }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % photos.length);
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
  }, [photos.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, goNext, goPrev]);

  const currentPhoto = photos[currentIndex];
  const filename = currentPhoto.split('/').pop() || 'photo';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90" onClick={onClose}>
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 flex flex-col items-center w-full h-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between w-full px-4 py-3 text-white">
          <span className="text-sm font-medium">
            {currentIndex + 1} / {photos.length}
          </span>
          <span className="text-sm text-gray-400 truncate max-w-[200px]">{filename}</span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Image */}
        <div className="flex-1 flex items-center justify-center w-full px-4">
          <img
            src={`/api/proxy/${currentPhoto}`}
            alt={filename}
            className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
          />
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between w-full px-4 py-3">
          <div className="flex gap-2">
            {canDelete && onDelete && (
              <button
                onClick={() => { onDelete(currentIndex); onClose(); }}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Delete
              </button>
            )}
            <a
              href={`/api/proxy/${currentPhoto}`}
              download={filename}
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
            >
              Download
            </a>
          </div>

          <div className="flex items-center gap-2">
            {photos.length > 1 && (
              <>
                <button
                  onClick={goPrev}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  aria-label="Previous"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={goNext}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  aria-label="Next"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
