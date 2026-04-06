<template>
  <div class="matches-page" :dir="isRtl ? 'rtl' : 'ltr'">
    <TopNav :lang="lang" :pid="route.params.id" />

    <main class="matches-wrap">
      <section class="page-head">
        <div class="title-box">
          <h1 class="page-title">{{ t.title }}</h1>
          <p class="page-subtitle">{{ t.subtitle }}</p>
        </div>

        <div class="language-box">
          <span class="language-icon" aria-hidden="true">🌐</span>
          <select class="language-select" v-model="lang">
            <option value="en">English</option>
            <option value="ar">Arabic</option>
            <option value="he">Hebrew</option>
          </select>
        </div>
      </section>

      <div v-if="metMatches.length === 0" class="state-box">
        <div class="state-icon" aria-hidden="true">🤝</div>
        <div>
          <div class="state-title">{{ t.emptyTitle }}</div>
          <div class="state-sub">{{ t.emptySub }}</div>
        </div>
      </div>

      <section v-else class="matches-list">
        <article
          v-for="m in metMatches"
          :key="m.id"
          class="match-card"
        >
          <div class="match-top">
            <div class="match-main">
              <div class="name-row">
                <h2 class="match-name">{{ getName(m) }}</h2>
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
            </div>
          </div>

          <div class="status-row">
            <span class="status-pill">{{ t.title }}</span>
          </div>

          <div class="actions-row single-action">
            <button class="action-btn met-btn" @click="unmarkMet(m)">
              {{ t.remove }}
            </button>
          </div>
        </article>
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

/* ===== Language ===== */
const LANG_KEY = 'harmony_lang'
const lang = ref(localStorage.getItem(LANG_KEY) || 'en')

watch(lang, v => localStorage.setItem(LANG_KEY, v), { immediate: true })

const TEXTS = {
  en: {
    title: 'Met',
    subtitle: 'People you already met',
    emptyTitle: 'No met profiles yet',
    emptySub: 'Go to Matches and tap “Met” after you meet someone.',
    why: 'Why matched:',
    remove: 'Remove from Met',
  },
  ar: {
    title: 'تم اللقاء',
    subtitle: 'الأشخاص الذين قابلتهم',
    emptyTitle: 'لا توجد ملفات تم اللقاء بها',
    emptySub: 'اذهب إلى المطابقات واضغط “تم اللقاء” بعد مقابلة شخص.',
    why: 'لماذا تم التطابق:',
    remove: 'إزالة من تم اللقاء',
  },
  he: {
    title: 'נפגשנו',
    subtitle: 'אנשים שכבר פגשת',
    emptyTitle: 'אין אנשים שסומנו כנפגשנו',
    emptySub: 'חזרי/חזור להתאמות ולחצי “נפגשנו” אחרי שפגשת מישהו.',
    why: 'למה הותאמתם:',
    remove: 'הסר מנפגשנו',
  },
}

const t = computed(() => TEXTS[lang.value] ?? TEXTS.en)
const isRtl = computed(() => lang.value === 'ar' || lang.value === 'he')

function pick(field) {
  if (!field) return ''
  if (typeof field === 'string') return field
  return field[lang.value] || field.en || field.he || field.ar || ''
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

function getWhy(m) {
  if (!m) return ''
  if (lang.value === 'en') return m.whyMatched_en || m.whyMatched || m.whyMatched_he || ''
  if (lang.value === 'he') return m.whyMatched_he || m.whyMatched_en || m.whyMatched || ''
  return m.whyMatched || m.whyMatched_en || m.whyMatched_he || ''
}

/* ===== Per participant keys ===== */
function participantId() {
  return String(route.params.id || '').trim()
}

function metKey() {
  return `harmony_met_${participantId()}`
}

function loadMetIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(metKey()) || '[]').map(String))
  } catch {
    return new Set()
  }
}

/* ===== Data ===== */
const allMetMatches = ref([])
const placeholderAvatar = defaultAvatar

function normalizeResponse(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.matches)) return data.matches
  return []
}

async function fetchMetMatches() {
  const pid = participantId()
  if (!pid) {
    allMetMatches.value = []
    return
  }

  try {
    const metRes = await fetch(buildApiUrl(`/api/met/${pid}`))
    if (!metRes.ok) throw new Error(`API error: ${metRes.status}`)
    const metIds = await metRes.json()
    const metIdsSet = new Set((metIds || []).map(String))

    const res = await fetch(buildMatchApiUrl(`/api/match/${pid}`))
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    const data = await res.json()

    const raw = normalizeResponse(data)

    allMetMatches.value = raw
      .map(r => ({
        id: r?.id,
        name: r?.name ?? '',
        match_name: r?.match_name ?? null,
        role: r?.role ?? '',
        whyMatched: r?.reason ?? '',
        whyMatched_en: r?.reason_en ?? '',
        whyMatched_he: r?.reason_he ?? '',
        avatar: (r?.imageUrl && String(r.imageUrl).trim()) ? r.imageUrl : placeholderAvatar,
      }))
      .filter(m => metIdsSet.has(String(m.id)))
  } catch {
    allMetMatches.value = []
  }
}

onMounted(fetchMetMatches)

watch(() => route.params.id, () => fetchMetMatches())
watch(lang, () => fetchMetMatches())

const metMatches = computed(() => allMetMatches.value)

async function unmarkMet(m) {
  const pid = participantId()

  await fetch(buildApiUrl('/api/met'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: pid,
      targetId: String(m.id),
      remove: true
    })
  })

  allMetMatches.value = allMetMatches.value.filter(x => String(x.id) !== String(m.id))
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

.single-action {
  justify-content: flex-start;
}

:dir(rtl) .single-action {
  justify-content: flex-end;
}

.action-btn {
  min-width: 140px;
  height: 34px;
  padding: 0 16px;
  border: 1px solid #cfd6cf;
  background: #ffffff;
  color: #58666b;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 999px;
}

.met-btn {
  background: #fafaf8;
}

.action-btn:hover {
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

  .match-name {
    font-size: 17px;
  }

  .why-text {
    font-size: 14px;
  }

  .action-btn {
    min-width: 120px;
    font-size: 14px;
  }
}
</style>