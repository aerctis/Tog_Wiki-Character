// src/services/wiki-parser.js
// Converts Textile-style wiki markup (from Obsidian Portal) to HTML.
// Handles: headers, bold, italic, links, wiki-links, tables, lists, images, divs/spans.

/**
 * Parse Textile wiki markup to HTML.
 * @param {string} text - Raw textile content
 * @param {function} onWikiLink - callback(slug, label) => html string for wiki links
 * @returns {string} HTML
 */
export function parseTextile(text, onWikiLink) {
  if (!text) return '';

  let html = text;

  // Normalize line endings
  html = html.replace(/\r\n/g, '\n');

  // Preserve existing HTML tags (divs, spans, anchors with styles)
  // These pass through as-is

  // ── Headers ──
  html = html.replace(/^h(\d)\.\s*(.+)$/gm, (_, level, content) => {
    return `<h${level}>${parseInline(content, onWikiLink)}</h${level}>`;
  });

  // ── Tables (Textile-style: |_. header | or | cell |) ──
  html = html.replace(/((?:^\|.*\|\s*$\n?)+)/gm, (block) => {
    const rows = block.trim().split('\n').filter(r => r.trim());
    let table = '<table>';
    for (const row of rows) {
      const cells = row.split('|').filter((c, i, arr) => i > 0 && i < arr.length - 1);
      const isHeader = cells.some(c => c.trim().startsWith('_.'));
      table += '<tr>';
      for (let cell of cells) {
        cell = cell.trim();
        if (cell.startsWith('_.')) {
          cell = cell.replace(/^_\.\s*/, '');
          table += `<th>${parseInline(cell, onWikiLink)}</th>`;
        } else {
          table += `<td>${parseInline(cell, onWikiLink)}</td>`;
        }
      }
      table += '</tr>';
    }
    table += '</table>';
    return table;
  });

  // ── Unordered Lists ──
  html = html.replace(/((?:^\*\s+.+$\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => l.replace(/^\*\s+/, ''));
    return '<ul>' + items.map(i => `<li>${parseInline(i, onWikiLink)}</li>`).join('') + '</ul>';
  });

  // ── Ordered Lists ──
  html = html.replace(/((?:^#\s+.+$\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => l.replace(/^#\s+/, ''));
    return '<ol>' + items.map(i => `<li>${parseInline(i, onWikiLink)}</li>`).join('') + '</ol>';
  });

  // ── Line Breaks ── 
  html = html.replace(/<br\s*\/?>/gi, '<br>');

  // ── Inline formatting for remaining lines ──
  html = html.split('\n').map(line => {
    const trimmed = line.trim();
    // Skip lines that are already HTML block elements
    if (/^<(h[1-6]|table|tr|td|th|ul|ol|li|div|blockquote|pre|hr)/i.test(trimmed)) {
      return line;
    }
    if (trimmed === '') return '';
    // Don't wrap if already contains block-level elements
    if (/<(h[1-6]|table|ul|ol|div|blockquote|pre)/i.test(trimmed)) {
      return parseInline(line, onWikiLink);
    }
    return `<p>${parseInline(line, onWikiLink)}</p>`;
  }).join('\n');

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  // Remove paragraphs wrapping block elements
  html = html.replace(/<p>\s*(<(?:h[1-6]|table|ul|ol|div|blockquote|pre|hr)[^]*?<\/(?:h[1-6]|table|ul|ol|div|blockquote|pre)>)\s*<\/p>/gi, '$1');

  return html;
}

/**
 * Parse inline Textile formatting.
 */
function parseInline(text, onWikiLink) {
  if (!text) return '';
  let s = text;

  // ── Wiki Links: [[Slug | Label]] or [[Slug]] ──
  s = s.replace(/\[\[([^\]|]+?)(?:\s*\|\s*([^\]]+?))?\]\]/g, (_, slug, label) => {
    const displayLabel = label || slug;
    const linkSlug = slug.trim();
    if (onWikiLink) {
      return onWikiLink(linkSlug, displayLabel.trim());
    }
    return `<span class="wiki-link" data-wiki-slug="${escHtml(linkSlug)}">${escHtml(displayLabel.trim())}</span>`;
  });

  // ── External Links: "Text":URL ──
  s = s.replace(/"([^"]+)"\s*:\s*(https?:\/\/[^\s<]+)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // ── File/Image refs: [[File:xxx | class=... | caption]] — just show caption or skip ──
  s = s.replace(/\[\[File:[^\]]*\]\]/g, '');

  // ── Bold: *text* ──
  s = s.replace(/\*([^*\n]+?)\*/g, '<strong>$1</strong>');

  // ── Italic: _text_ ──
  s = s.replace(/_([^_\n]+?)_/g, '<em>$1</em>');

  // ── Colored spans from Obsidian Portal ──
  // <span style="color: red;">text</span> — pass through as-is (with a CSS class)
  s = s.replace(/<span\s+style="color:\s*red;?">(.*?)<\/span>/gi, '<span class="warning-text">$1</span>');

  // ── Double-dash comments ── (--text--) — treat as strikethrough/note
  s = s.replace(/--([^-]+?)--/g, '<em style="opacity:0.5;">$1</em>');

  return s;
}

/**
 * Build a slug from a wiki page title (for URL/ID matching).
 */
export function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Escape HTML entities.
 */
function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
