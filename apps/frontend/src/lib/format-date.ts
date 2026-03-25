/**
 * Format an ISO date string into a human-friendly time/date.
 * - Today: "3:25 PM"
 * - Yesterday: "Yesterday"
 * - This week: "Monday", "Tuesday", etc.
 * - Older: "Mar 15"
 */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();

  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  if (diffDays <= 1 && now.getDate() - date.getDate() === 1) {
    return 'Yesterday';
  }

  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Format an ISO date string into a short time string: "3:25 PM"
 */
export function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format an ISO date string into a precise time string with seconds: "03:25:10"
 */
export function formatLogTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format an ISO date string into a short date string: "Mar 15"
 */
export function formatShortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}
