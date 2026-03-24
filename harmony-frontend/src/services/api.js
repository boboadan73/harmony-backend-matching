export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://harmony-system-backend.onrender.com'

export function buildApiUrl(path) {
  if (!path) return API_BASE_URL
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (path.startsWith('/')) return `${API_BASE_URL}${path}`
  return `${API_BASE_URL}/${path}`
}