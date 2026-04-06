import { diffLines, type Change } from 'diff';

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

/**
 * Compute a line-based diff between two text strings.
 * Returns an array of lines with their change type.
 */
export function computeTextDiff(oldText: string, newText: string): DiffLine[] {
  const changes: Change[] = diffLines(oldText, newText);
  const lines: DiffLine[] = [];

  for (const change of changes) {
    const type: DiffLine['type'] = change.added
      ? 'added'
      : change.removed
        ? 'removed'
        : 'unchanged';

    // Split change value into individual lines, removing trailing empty line from split
    const splitLines = change.value.split('\n');
    if (splitLines[splitLines.length - 1] === '') splitLines.pop();

    for (const line of splitLines) {
      lines.push({ type, value: line });
    }
  }

  return lines;
}

/** Returns true if both texts are identical (no diff). */
export function hasChanges(oldText: string, newText: string): boolean {
  return oldText !== newText;
}
