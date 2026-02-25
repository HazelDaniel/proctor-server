/**
 * Simple parser to extract cookies from a cookie header string.
 * Used as a zero-dependency fallback since npm/pnpm timed out installing 'cookie'.
 */
export function parse(cookieHeader: string | undefined | null): Record<string, string> {
  if (!cookieHeader) return {};
  
  return cookieHeader.split(';').reduce((acc: Record<string, string>, currentCookie) => {
    const [key, value] = currentCookie.split('=');
    if (key && value) {
      acc[key.trim()] = decodeURIComponent(value.trim());
    }
    return acc;
  }, {});
}
