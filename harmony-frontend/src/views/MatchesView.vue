<template>
  <div class="matches-page" :dir="isRtl ? 'rtl' : 'ltr'">
    <TopNav :lang="lang" :pid="participantId()" />

    <main class="matches-wrap">
      <section class="page-head">
        <div class="title-box">
          <h1 class="page-title">{{ t.title }}</h1>
          <p class="page-subtitle">{{ t.subtitle }}</p>
        </div>
   
<div class="head-actions">
  <div class="filters-bar">
    <button class="filters-toggle" @click="showFilters = !showFilters">
      {{ t.filters }}
    </button>

    <div v-if="showFilters" class="filters-dropdown">
      <select v-model="filterType" class="filters-select">
        <option value="name">{{ t.searchByName }}</option>
        <option value="company">{{ t.searchByCompany }}</option>
        <option value="skills">{{ t.filterBySkills }}</option>
        <option value="interests">{{ t.filterByInterests }}</option>
        <option value="languages">{{ t.filterByLanguages }}</option>
      </select>

      <input
        v-model="filterValue"
        class="filters-input"
        type="text"
        :placeholder="t.typeHere"
      />

      <div class="filters-actions">
        <button class="filters-clear" @click="clearFilters">
          {{ t.clearFilters }}
        </button>
      </div>
    </div>
  </div>

  <div class="language-box">
    <span class="language-icon" aria-hidden="true">🌐</span>
    <select class="language-select" v-model="lang">
      <option value="en">English</option>
      <option value="ar">Arabic</option>
      <option value="he">Hebrew</option>
    </select>
  </div>
</div>
      </section>

      <div v-if="loading" class="state-box">
        <div class="state-icon" aria-hidden="true">⏳</div>
        <div>
          <div class="state-title">{{ t.loadingTitle }}</div>
          <div class="state-sub">{{ t.loadingSub }}</div>
        </div>
      </div>

      <div v-else-if="errorMsg" class="state-box">
        <div class="state-icon" aria-hidden="true">⚠️</div>
        <div>
          <div class="state-title">{{ t.errorTitle }}</div>
          <div class="state-sub">{{ errorMsg }}</div>
        </div>
      </div>

<div v-else-if="filteredMatches.length === 0" 
class="state-box">
          <div class="state-icon" aria-hidden="true">✨</div>
        <div>
          <div class="state-title">{{ t.emptyTitle }}</div>
          <div class="state-sub">{{ t.emptySub }}</div>
        </div>
      </div>

      <section v-else class="matches-list">
        <article
v-for="(m, idx) in filteredMatches"
          :key="m.id"
          class="match-card"
        >
          <div class="match-top">
            <div class="match-main">
              <div class="name-row">
                <h2 class="match-name">{{ getName(m) }}</h2>

                <span v-if="idx === 0" class="best-badge">
                  {{ t.bestMatch }}
                </span>
              </div>

              <div v-if="getWhy(m)" class="why-section">
                <div class="why-title">{{ t.why }}</div>
                <div class="why-text">{{ getWhy(m) }}</div>
              </div>
            </div>

            <div class="avatar-side">
              <img
                class="match-avatar"
                :src="m.avatar"
                alt="avatar"
                loading="lazy"
                @error="onAvatarError"
              />

              <div class="match-score ltrNum">
                {{ m.matchPercent }}% {{ t.matchSuffix }}
              </div>
            </div>
          </div>

          <div v-if="m.saved || m.met" class="status-row">
            <span v-if="m.saved" class="status-pill">{{ t.saved }}</span>
            <span v-if="m.met" class="status-pill">{{ t.met }}</span>
          </div>

          <div class="actions-row">
            <button class="action-btn save-btn" @click="save(m)">
              {{ m.saved ? t.unsave : t.save }}
            </button>

            <button class="action-btn met-btn" @click="markMet(m)">
              {{ m.met ? t.unmetBtn : t.metBtn }}
            </button>

            <button class="action-btn skip-btn" @click="skip(m)">
              {{ t.skip }}
            </button>
          </div>
        </article>

        <div class="refresh-row">
          <button class="refresh-btn" @click="fetchMatches()">
            {{ t.refresh }}
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import TopNav from '@/components/TopNav.vue'
import { buildApiUrl, buildMatchApiUrl } from '@/services/api'
import defaultAvatar from '@/assets/default-avatar.png'

const route = useRoute()
const showFilters = ref(false)

const filterType = ref('name') // name | company | skills | interests | languages
const filterValue = ref('')
const LANG_KEY = 'harmony_lang'
const lang = ref(localStorage.getItem(LANG_KEY) || 'en')


watch(
  lang,
  (v, prev) => {
    localStorage.setItem(LANG_KEY, v)

    if (v !== prev) {
      fetchMatches()
    }
  },
  { immediate: true }
)

const TEXTS = {
  en: {
    title: 'Matches',
    subtitle: 'People you may want to meet',
    emptyTitle: 'No more matches',
    emptySub: 'Try again later or come back after new participants join.',
    loadingTitle: 'Loading matches…',
    loadingSub: 'Please wait a moment.',
    errorTitle: 'Could not load matches',
    why: 'Why matched:',
    saved: '⭐ Saved',
    met: '🤝 Met',
    save: 'Save',
    unsave: 'Unsave',
    metBtn: 'Met',
    unmetBtn: 'Unmet',
    skip: 'Skip',
    matchSuffix: 'match',
    bestMatch: 'BEST MATCH',
    refresh: 'Refresh',
    filtersTitle: 'Filters',
    searchByName: 'Search by name',
    searchByCompany: 'Search by company',
    filterBySkills: 'Filter by skills',
    filterByInterests: 'Filter by interests',
    filterByLanguages: 'Filter by languages',
    clearFilters: 'Clear all filters',
    filters: 'Filters',
typeHere: 'Type here...',
    
    
  },
  ar: {
    title: 'المطابقات',
    subtitle: 'أشخاص قد ترغب بلقائهم',
    emptyTitle: 'لا توجد مطابقات أخرى',
    emptySub: 'جرّب لاحقاً أو عد بعد انضمام مشاركين جدد.',
    loadingTitle: 'جارٍ تحميل المطابقات…',
    loadingSub: 'انتظر لحظة من فضلك.',
    errorTitle: 'تعذّر تحميل المطابقات',
    why: 'لماذا تم التطابق:',
    saved: '⭐ محفوظ',
    met: '🤝 تم اللقاء',
    save: 'حفظ',
    unsave: 'إلغاء الحفظ',
    metBtn: 'تم اللقاء',
    unmetBtn: 'إلغاء تم اللقاء',
    skip: 'تخطي',
    matchSuffix: 'تطابق',
    bestMatch: 'أفضل تطابق',
    refresh: 'تحديث',
    filtersTitle: 'عوامل التصفية',
    searchByName: 'ابحث بالاسم',
    searchByCompany: 'ابحث بالشركة',
    filterBySkills: 'تصفية حسب المهارات',
    filterByInterests: 'تصفية حسب الاهتمامات',
    filterByLanguages: 'تصفية حسب اللغات',
    clearFilters: 'مسح جميع عوامل التصفية',
    filters: 'عوامل التصفية',
typeHere: 'اكتب هنا...',
  },
  he: {
    title: 'התאמות',
    subtitle: 'אנשים שאולי תרצי/תרצה לפגוש',
    emptyTitle: 'אין עוד התאמות',
    emptySub: 'נסי/נסה שוב מאוחר יותר או חזרי/חזור כשמצטרפים משתתפים חדשים.',
    loadingTitle: 'טוען התאמות…',
    loadingSub: 'רק רגע.',
    errorTitle: 'לא הצלחנו לטעון התאמות',
    why: 'למה הותאמתם:',
    saved: '⭐ נשמר',
    met: '🤝 נפגשנו',
    save: 'שמור',
    unsave: 'בטל שמירה',
    metBtn: 'נפגשנו',
    unmetBtn: 'בטל נפגשנו',
    skip: 'דלג',
    matchSuffix: 'התאמה',
    bestMatch: 'ההתאמה הטובה ביותר',
    refresh: 'רענן',
    filtersTitle: 'סינון',
    searchByName: 'חיפוש לפי שם',
    searchByCompany: 'חיפוש לפי חברה',
    filterBySkills: 'סינון לפי כישורים',
    filterByInterests: 'סינון לפי תחומי עניין',
    filterByLanguages: 'סינון לפי שפות',
    clearFilters: 'נקה את כל הסינונים',
    filters: 'סינון',
typeHere: 'הקלד/י כאן...',
  },
}

const t = computed(() => TEXTS[lang.value] ?? TEXTS.en)
const isRtl = computed(() => lang.value === 'ar' || lang.value === 'he')

const loading = ref(false)
const errorMsg = ref('')
const matches = ref([])


const placeholderAvatar = defaultAvatar

function participantId() {
  return String(route.params.id || '').trim()
}

function normalizeResponse(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.matches)) return data.matches
  return []
}
function clearFilters() {
  filterType.value = 'name'
  filterValue.value = ''
}

function getWhy(m) {
  if (!m) return ''
  if (lang.value === 'en') return m.whyMatched_en || m.whyMatched || m.whyMatched_he || ''
  if (lang.value === 'he') return m.whyMatched_he || m.whyMatched_en || m.whyMatched || ''
  return m.whyMatched || m.whyMatched_en || m.whyMatched_he || ''
}

function getName(m) {
  if (!m) return ''

  const mn = m.match_name || {}
  const original = mn.original || m.name || ''
  const en = mn.en || ''
  const he = mn.he || ''

  if (lang.value === 'en') return en || original || he || ''
  if (lang.value === 'he') return he || en || original || ''
  return original || en || he || ''
}

function toUiMatch(raw) {
  const score = Number(raw?.score)
  const matchPercent = Number.isFinite(score) ? Math.round(score * 100) : 0

  return {
  id: raw?.id ?? Math.random().toString(16).slice(2),
  name: raw?.name ?? '',
  match_name: raw?.match_name ?? null,
  role: '',
  company: raw?.company ?? raw?.job ?? raw?.jobTitle ?? '',
  skills: raw?.skills ?? raw?.professional ?? '',
  interests: raw?.interests ?? raw?.personal ?? '',
  languages: raw?.languages ?? '',
  matchPercent,
  whyMatched: raw?.reason ?? '',
  whyMatched_en: raw?.reason_en ?? '',
  whyMatched_he: raw?.reason_he ?? '',
avatar:
  (raw?.image && String(raw.image).trim()) ||
  (raw?.photoUrl && String(raw.photoUrl).trim()) ||
  (raw?.imageUrl && String(raw.imageUrl).trim()) ||
  placeholderAvatar,
    saved: false,
  met: false,
}
}

async function fetchMatches() {
  const pid = participantId()
  if (!pid) return

  loading.value = true
  errorMsg.value = ''

  try {
    const [matchRes, savedRes, metRes] = await Promise.all([
      fetch(buildMatchApiUrl(`/api/match/${pid}`)),
      fetch(buildApiUrl(`/api/eventParticipants/${pid}/saved`)),
      fetch(buildApiUrl(`/api/eventParticipants/${pid}/met`)),
    ])

    if (!matchRes.ok) throw new Error(`API error: ${matchRes.status}`)
    if (!savedRes.ok) throw new Error(`API error: ${savedRes.status}`)
    if (!metRes.ok) throw new Error(`API error: ${metRes.status}`)

const [matchData, savedData, metData] = await Promise.all([
  matchRes.json(),
  savedRes.json(),
  metRes.json(),
])

const savedIds = new Set(((savedData?.saved) || []).map(String))
const metIds = new Set(((metData?.met) || []).map(String))

    const rawMatches = normalizeResponse(matchData)

    matches.value = rawMatches.map(raw => {
      const m = toUiMatch(raw)
      return {
        ...m,
        saved: savedIds.has(String(m.id)),
        met: metIds.has(String(m.id)),
      }
    })
  } catch (e) {
    errorMsg.value = e?.message || 'Failed to fetch'
    matches.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchMatches)

watch(
  () => route.params.id,
  () => fetchMatches()
)

const sortedMatches = computed(() =>
  [...matches.value].sort((a, b) => (b.matchPercent ?? 0) - (a.matchPercent ?? 0))
)

const filteredMatches = computed(() => {
  if (!filterValue.value) return sortedMatches.value

  const q = filterValue.value.toLowerCase()

  return sortedMatches.value.filter((m) => {
    if (filterType.value === 'name') {
      return getName(m).toLowerCase().includes(q)
    }

    if (filterType.value === 'company') {
      return String(m.company || '').toLowerCase().includes(q)
    }

    if (filterType.value === 'skills') {
      return String(m.skills || '').toLowerCase().includes(q)
    }

    if (filterType.value === 'interests') {
      return String(m.interests || '').toLowerCase().includes(q)
    }

    if (filterType.value === 'languages') {
      return String(m.languages || '').toLowerCase().includes(q)
    }

    return true
  })
})

async function save(m) {
  const pid = participantId()

  try {
    const url = buildApiUrl(
      `/api/eventParticipants/${pid}/save/${m.id}`
    )

    const res = await fetch(url, {
      method: m.saved ? 'DELETE' : 'POST'
    })

    if (!res.ok) throw new Error(`API error: ${res.status}`)

    m.saved = !m.saved
  } catch (e) {
    errorMsg.value = e?.message || 'Save failed'
  }
}

async function markMet(m) {
  const pid = participantId()

  try {
    const url = buildApiUrl(
      `/api/eventParticipants/${pid}/met/${m.id}`
    )

    const res = await fetch(url, {
      method: m.met ? 'DELETE' : 'POST'
    })

    if (!res.ok) throw new Error(`API error: ${res.status}`)

    m.met = !m.met
  } catch (e) {
    errorMsg.value = e?.message || 'Met failed'
  }
}

function skip(m) {
  matches.value = matches.value.filter(x => x.id !== m.id)
}

function onAvatarError(e) {
  e.target.src = placeholderAvatar
}
</script>

<style scoped>
.matches-page {
  min-height: 100vh;
  background: #f5f6f4;
  color: #45545a;
  font-family: Arial, sans-serif;
}

.matches-wrap {
  max-width: 920px;
  margin: 0 auto;
  padding: 18px 18px 40px;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 18px 0 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid #d9ddd9;
}



:dir(rtl) .page-head {
  text-align: right;
}

.title-box {
  min-width: 0;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-inline-start: auto;
  position: relative;
}

:dir(rtl) .head-actions {
  flex-direction: row-reverse;
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 500;
  color: #4e5d63;
}

.page-subtitle {
  margin: 6px 0 0;
  font-size: 14px;
  color: #9aa5aa;
  font-weight: 600;
}

.language-box {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #f8f8f6;
  border: 1px solid #d7dbd6;
  border-radius: 999px;
  padding: 7px 12px;
  flex-shrink: 0;
}

.language-icon {
  font-size: 15px;
  line-height: 1;
}

.language-select {
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 14px;
  color: #5a666b;
  cursor: pointer;
}
.filters-bar {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-bottom: 0;
}

.filters-toggle {
  border: 1px solid #cfd6cf;
  background: #ffffff;
  color: #56656a;
  border-radius: 999px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.filters-toggle:hover {
  background: #eef3ee;
}

.filters-dropdown {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  width: 320px;
  background: #ffffff;
  border: 1px solid #d8ddd8;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  z-index: 20;
  box-sizing: border-box;
}

:dir(rtl) .filters-dropdown {
  left: auto;
  right: 0;
}

.filters-select,
.filters-input {
  display: block;
  width: 100%;
  max-width: 100%;
  height: 42px;
  border: 1px solid #d3d9d3;
  border-radius: 12px;
  padding: 0 12px;
  font-size: 14px;
  color: #4f5f65;
  background: #fafbf9;
  margin-bottom: 10px;
  outline: none;
  box-sizing: border-box;
}

.filters-select:focus,
.filters-input:focus {
  border-color: #8fb89c;
  background: #ffffff;
}

.filters-actions {
  display: flex;
  justify-content: flex-end;
}

.filters-clear {
  border: 1px solid #cfd6cf;
  background: #ffffff;
  color: #56656a;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.filters-clear:hover {
  background: #eef3ee;
}
.matches-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.match-card {
  background: #ffffff;
  border: 1px solid #d8ddd8;
  border-radius: 16px;
  padding: 18px 18px 14px;
  box-shadow: 0 2px 7px rgba(0, 0, 0, 0.06);
}

.match-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

:dir(rtl) .match-top {
  flex-direction: row-reverse;
}

.match-main {
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

:dir(rtl) .name-row {
  justify-content: flex-start;
}

.match-name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #4f5f65;
}

.best-badge {
  display: inline-flex;
  align-items: center;
  background: #8fb89c;
  color: #ffffff;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

.why-section {
  text-align: start;
}

.why-title {
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 700;
  color: #6c8778;
}

.why-text {
  font-size: 15px;
  line-height: 1.65;
  color: #5c6a6f;
  word-break: break-word;
}

.avatar-side {
  width: 132px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 2px;
}

.match-avatar {
  width: 92px;
  height: 92px;
  object-fit: cover;
  border-radius: 50%;
  border: 4px solid #f2f2ef;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.15);
}

.match-score {
  margin-top: -8px;
  background: #6f9979;
  color: #ffffff;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.16);
}

.ltrNum {
  direction: ltr;
  unicode-bidi: embed;
}

.status-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #e3e7e2;
}

.status-pill {
  background: #f3f6f3;
  border: 1px solid #d7ddd8;
  color: #536268;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 13px;
  font-weight: 600;
}

.actions-row {
  display: flex;
  justify-content: center;
  margin-top: 14px;
  border-top: 1px solid #e3e7e2;
  padding-top: 12px;
  gap: 0;
}

.action-btn {
  min-width: 96px;
  height: 34px;
  padding: 0 16px;
  border: 1px solid #cfd6cf;
  background: #ffffff;
  color: #58666b;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.action-btn:first-child {
  border-radius: 999px 0 0 999px;
}

.action-btn:last-child {
  border-radius: 0 999px 999px 0;
}

:dir(rtl) .action-btn:first-child {
  border-radius: 0 999px 999px 0;
}

:dir(rtl) .action-btn:last-child {
  border-radius: 999px 0 0 999px;
}

.action-btn + .action-btn {
  border-inline-start: 0;
}

.save-btn {
  background: #dfe9df;
}

.met-btn,
.skip-btn {
  background: #fafaf8;
}

.action-btn:hover {
  background: #eef3ee;
}

.refresh-row {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

.refresh-btn {
  border: 1px solid #cfd6cf;
  background: #ffffff;
  color: #56656a;
  border-radius: 999px;
  padding: 9px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.refresh-btn:hover {
  background: #eef3ee;
}

.state-box {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #ffffff;
  border: 1px solid #d8ddd8;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 2px 7px rgba(0, 0, 0, 0.05);
}

.state-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #eef3ee;
  font-size: 18px;
}

.state-title {
  font-size: 16px;
  font-weight: 700;
  color: #506066;
}

.state-sub {
  margin-top: 4px;
  font-size: 14px;
  color: #6f7d82;
}

@media (max-width: 700px) {
  .matches-wrap {
    padding: 14px 12px 30px;
  }

  .page-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .language-box {
    align-self: flex-start;
  }

  :dir(rtl) .language-box {
    align-self: flex-end;
  }

  .match-top {
    gap: 12px;
  }

  .avatar-side {
    width: 104px;
  }

  .match-avatar {
    width: 78px;
    height: 78px;
  }

  .match-score {
    font-size: 12px;
    padding: 6px 10px;
  }

  .match-name {
    font-size: 17px;
  }

  .why-text {
    font-size: 14px;
  }

  .action-btn {
    min-width: 82px;
    font-size: 14px;
  }
    .head-actions {
    width: 100%;
    justify-content: space-between;
    margin-inline-start: 0;
  }

  .filters-dropdown {
    width: 100%;
    min-width: 260px;
    left: 0;
    right: auto;
  }

  :dir(rtl) .filters-dropdown {
    right: 0;
    left: auto;
  }
}
</style>
