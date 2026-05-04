/**
 * Strip common Markdown syntax from a string for plain-text previews
 * (e.g. the last-message line in the chat list). Intentionally simple —
 * not a full Markdown parser; just removes the most visible noise.
 */
export function stripMarkdown(input: string): string {
  if (!input) return '';
  let s = input;

  // Fenced code blocks: keep their contents but drop the fences
  s = s.replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, '$1');
  // Inline code: `foo` → foo
  s = s.replace(/`([^`]+)`/g, '$1');
  // Images: ![alt](url) → alt
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Links: [text](url) → text
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Bold + italic combinations: ***x*** / ___x___
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  s = s.replace(/___([^_]+)___/g, '$1');
  // Bold: **x** / __x__
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  // Italic: *x* / _x_   (avoid matching mid-word underscores like foo_bar_baz)
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2');
  s = s.replace(/(^|[\s(])_([^_\n]+)_/g, '$1$2');
  // Strikethrough: ~~x~~
  s = s.replace(/~~([^~]+)~~/g, '$1');
  // Headings: leading # ...   (up to 6)
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  // Blockquote markers
  s = s.replace(/^\s*>\s?/gm, '');
  // Unordered list bullets
  s = s.replace(/^\s*[-*+]\s+/gm, '');
  // Ordered list markers: 1. / 2)
  s = s.replace(/^\s*\d+[.)]\s+/gm, '');
  // Horizontal rules
  s = s.replace(/^\s*([-*_])\1{2,}\s*$/gm, '');
  // Collapse multiple whitespace / newlines into single spaces for a one-line preview
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}
