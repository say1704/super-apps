"""
Input Sanitizer - Sanitize user input to prevent XSS attacks
"""
import re
import html

ALLOWED_TAGS = frozenset({
    'b', 'i', 'u', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'code', 'blockquote',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'div', 'span',
    'sup', 'sub', 'small', 'mark', 'del', 'ins',
})
ALLOWED_ATTRS = frozenset({'href', 'target', 'class', 'id', 'style', 'title'})


def sanitize_text(text: str) -> str:
    if not text:
        return text
    return html.escape(str(text), quote=True)


def escape_like(value: str) -> str:
    """Escape SQL LIKE wildcards so user input is matched literally.

    Pairs with the SQLAlchemy `escape='\\\\'` argument / SQL `ESCAPE '\\'` clause.
    """
    if not value:
        return value
    return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


def _strip_untrusted_html(raw: str) -> str:
    if not raw:
        return raw

    raw = re.sub(r'<!--.*?-->', '', raw, flags=re.DOTALL)

    def _safe_link(m):
        before = m.group(1)
        val = m.group(2)
        val_lower = val.strip().lower()
        if val_lower.startswith('javascript:') or val_lower.startswith('data:'):
            val = '#'
        return f'{before}"{val}"'

    raw = re.sub(r'(href\s*=\s*)"([^"]*)"', _safe_link, raw, flags=re.IGNORECASE)
    raw = re.sub(r"(href\s*=\s*)'([^']*)'", _safe_link, raw, flags=re.IGNORECASE)
    raw = re.sub(r'(src\s*=\s*)"([^"]*)"', _safe_link, raw, flags=re.IGNORECASE)
    raw = re.sub(r"(src\s*=\s*)'([^']*)'", _safe_link, raw, flags=re.IGNORECASE)

    raw = re.sub(r'\s+on\w+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)', '', raw, flags=re.IGNORECASE)

    raw = re.sub(
        r'style\s*=\s*"(?:[^"]*expression\s*\([^)]*\)[^"]*|'
        r'[^"]*url\s*\(\s*["\']?javascript:[^"\']*["\']?\s*\)[^"]*)"',
        '', raw, flags=re.IGNORECASE
    )

    def _clean_tag(m):
        full = m.group(0)
        tagname = m.group(1).lower()
        if tagname not in ALLOWED_TAGS:
            return html.escape(full)

        is_close = full.startswith('</')
        if is_close:
            return f'</{tagname}>'

        attrs_raw = m.group(2) or ''
        safe_attrs = []
        for name, value in re.findall(r'(\S+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|(\S+))', attrs_raw):
            name = name.lower()
            if name not in ALLOWED_ATTRS:
                continue
            val = (value or '')
            if name == 'href':
                val_lower = val.strip().lower()
                if val_lower.startswith('javascript:') or val_lower.startswith('data:'):
                    continue
            safe_attrs.append(f'{name}="{html.escape(val, quote=True)}"')
        attr_str = ' ' + ' '.join(safe_attrs) if safe_attrs else ''
        return f'<{tagname}{attr_str}>'

    raw = re.sub(r'</?(\w+)((?:\s+\S+(?:\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+))?)*)\s*/?>', _clean_tag, raw)

    return raw


def sanitize_html(html_content: str) -> str:
    if not html_content:
        return html_content
    return _strip_untrusted_html(html_content)
