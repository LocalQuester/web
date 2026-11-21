export function getApiUrl() {
  if (!process.env.API_URL) return null;
  const url = new URL(process.env.API_URL);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
  return url.origin;
}
