import DOMPurify from 'dompurify';

/**
 * Sanitize HTML string for safe rendering
 * Allows safe tags: p, b, i, u, a, ul, ol, li, br, h1-h6, strong, em, span, div, table, tr, td, th, img
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html;
  
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'i', 'b',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'span', 'div',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'blockquote', 'code', 'pre', 'hr',
      'sub', 'sup', 'strike',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'style', 'border', 'cellpadding', 'cellspacing'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ADD_ATTR: ['target'],
  });
}

/**
 * Escape text for safe display as plain text (no HTML)
 */
export function sanitizeText(text: string): string {
  if (typeof window === 'undefined') return text;
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Sanitize URL to prevent javascript: and data: URIs
 */
export function sanitizeUrl(url: string): string {
  if (!url) return '';
  const sanitized = url.trim();
  if (sanitized.startsWith('javascript:') || sanitized.startsWith('data:') || sanitized.startsWith('vbscript:')) {
    return '';
  }
  return sanitized;
}
