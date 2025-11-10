/**
 * Formats a Unix timestamp to yy-MM-dd HH:mm format
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted date string
 *
 * @example
 * formatUnixTimestamp(1735555200) // "24-12-30 14:30"
 */
export function formatUnixTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);

  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Formats a Unix timestamp to YYYY-MM-DD HH:mm format (full year)
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted date string with full year
 *
 * @example
 * formatAbsoluteDateTime(1735555200) // "2024-12-30 14:30"
 */
export function formatAbsoluteDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Formats an ISO timestamp string to a human-readable date
 * @param isoString - ISO timestamp string
 * @returns Formatted date string
 * 
 * @example
 * formatISOTimestamp("2025-01-04T10:13:29.000Z") // "Jan 4, 2025"
 */
export function formatISOTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return formatUnixTimestamp(Math.floor(date.getTime() / 1000));
}

/**
 * Truncates text to a specified length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Gets the first line of text
 * @param text - Text to process
 * @returns First line of text
 */
export function getFirstLine(text: string): string {
  const lines = text.split('\n');
  return lines[0] || '';
}


/**
 * Formats a timestamp to a relative time string (e.g., "2 hours ago", "3 days ago")
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Relative time string
 * 
 * @example
 * formatTimeAgo(Date.now() - 3600000) // "1 hour ago"
 * formatTimeAgo(Date.now() - 86400000) // "1 day ago"
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (years > 0) {
    return years === 1 ? '1 year ago' : `${years} years ago`;
  }
  if (months > 0) {
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  if (weeks > 0) {
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  if (days > 0) {
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (minutes > 0) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  if (seconds > 0) {
    return seconds === 1 ? '1 second ago' : `${seconds} seconds ago`;
  }
  
  return 'just now';
} 
