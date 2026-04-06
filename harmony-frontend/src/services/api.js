export const SYSTEM_API_BASE_URL =
  import.meta.env.VITE_SYSTEM_API_BASE_URL || 'https://harmony-system-backend-1.onrender.com'

export const MATCH_API_BASE_URL =
  import.meta.env.VITE_MATCH_API_BASE_URL || 'https://harmony-backend-matching.onrender.com'

// ✅ הוספה – בשביל ProfileView
export const API_BASE_URL = SYSTEM_API_BASE_URL

// ===== SYSTEM =====
export function buildSystemApiUrl(path) {
  if (!path) return SYSTEM_API_BASE_URL
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (path.startsWith('/')) return `${SYSTEM_API_BASE_URL}${path}`
  return `${SYSTEM_API_BASE_URL}/${path}`
}

// ===== MATCH =====
export function buildMatchApiUrl(path) {
  if (!path) return MATCH_API_BASE_URL
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (path.startsWith('/')) return `${MATCH_API_BASE_URL}${path}`
  return `${MATCH_API_BASE_URL}/${path}`
}

// ✅ הוספה – alias כללי (משמש ProfileView)
export function buildApiUrl(path) {
  return buildSystemApiUrl(path)
}