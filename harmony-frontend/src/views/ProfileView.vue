<template>
  <div class="container">
    <div class="shell" :dir="isRtl ? 'rtl' : 'ltr'">
      <!-- background decorations -->
      <div class="blob blob1" aria-hidden="true"></div>
      <div class="blob blob2" aria-hidden="true"></div>
      <div class="blob blob3" aria-hidden="true"></div>

      <div class="page">
        <!-- TOP NAV (hamburger + centered logo) -->
        <TopNav :lang="lang" :pid="pid" />


        <!-- header + language -->
        <div class="headerRow">
          <div class="titles">
            <h1 class="h1">{{ t.title }}</h1>
            <p class="subtitle">{{ t.subtitle }}</p>
          </div>

          <div class="langBox">
            <span class="langIcon" aria-hidden="true">🌐</span>
            <select class="langSelect" v-model="lang">
              <option value="en">English</option>
              <option value="ar">Arabic</option>
              <option value="he">Hebrew</option>
            </select>
          </div>
        </div>

        <!-- CONTENT CARD -->
        <div class="card">
          <div class="cardGlow" aria-hidden="true"></div>

          <div class="sectionTitle">{{ t.sectionTitle }}</div>

          <div class="row">
            <div class="label">{{ t.phone }}</div>
            <div class="value ltrNum">{{ userPhone || t.noPhone }}</div>
          </div>

          <div class="hint">
            {{ t.hint }}
          </div>
          <div class="profileAvatarWrap">
  <img
    class="profileAvatar"
    :src="profileAvatar"
    alt="Profile avatar"
    @error="onAvatarError"
  />
</div>


        </div>

        <!-- tiny spacer -->
        <div class="spacerBottom"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { API_BASE_URL, buildApiUrl } from '@/services/api'
import defaultAvatar from '@/assets/default-avatar.png'

import { computed, ref, watch, onMounted } from 'vue'

import { useRouter, useRoute } from 'vue-router'

import TopNav from '@/components/TopNav.vue'
import { authStore } from '@/store/authStore' // אם אצלך זה ../store/authStore תעדכני את הנתיב

const router = useRouter()
const route = useRoute()
const pid = computed(() => String(route.params.id || localStorage.getItem('harmony_pid') || '').trim())
watch(pid, v => { if (v) localStorage.setItem('harmony_pid', v) }, { immediate: true })



const LANG_KEY = 'harmony_lang'
const lang = ref(localStorage.getItem(LANG_KEY) || 'en')
watch(lang, v => localStorage.setItem(LANG_KEY, v), { immediate: true })

const TEXTS = {
  en: {
    title: 'Profile',
    subtitle: 'Your personal info and quick navigation',
    sectionTitle: 'Demo profile',
    phone: 'Phone',
    noPhone: 'No phone found',
    hint: 'This is currently a demo screen. Later you will load real data from the backend using your phone number.',
    goMatches: 'Back to Matches',
    goSaved: 'Saved list',
    goMet: 'Met list',
  },
  ar: {
    title: 'الملف الشخصي',
    subtitle: 'معلوماتك والتنقل السريع',
    sectionTitle: 'ملف تجريبي',
    phone: 'رقم الهاتف',
    noPhone: 'لم يتم العثور على رقم',
    hint: 'هذه شاشة تجريبية حالياً. لاحقاً سنجلب بيانات حقيقية من الـ backend حسب رقم هاتفك.',
    goMatches: 'العودة للمطابقات',
    goSaved: 'المحفوظات',
    goMet: 'تم اللقاء',
  },
  he: {
    title: 'פרופיל',
    subtitle: 'המידע האישי וניווט מהיר',
    sectionTitle: 'פרופיל לדוגמה',
    phone: 'טלפון',
    noPhone: 'לא נמצא מספר',
    hint: 'זה מסך דמו כרגע. בהמשך נטען מידע אמיתי מה־backend לפי מספר הטלפון שלך.',
    goMatches: 'חזרה להתאמות',
    goSaved: 'רשימת שמורים',
    goMet: 'רשימת נפגשנו',
  },
}


const t = computed(() => TEXTS[lang.value] ?? TEXTS.en)
const isRtl = computed(() => lang.value === 'ar' || lang.value === 'he')


const userPhone = computed(() => authStore?.phone || '')
const API_BASE = API_BASE_URL
const profileAvatar = ref(defaultAvatar)

function onAvatarError() {
  profileAvatar.value = defaultAvatar
}

function toAbsoluteUrl(url) {
  if (!url) return ''
  return buildApiUrl(url)
}

function extractAvatar(data) {
  // מחפש בכל השמות הנפוצים שה-backend יכול להחזיר
  const raw =
    data?.image_url ||
    data?.imageUrl ||
    data?.avatar ||
    data?.avatar_url ||
    data?.photo ||
    data?.photoUrl ||
    data?.profile_image ||
    data?.profileImage ||
    ''

  return toAbsoluteUrl(raw)
}

async function loadProfileAvatar() {
  const id = pid.value || userPhone.value
  if (!id) {
    profileAvatar.value = defaultAvatar
    return
  }

  try {
    // ⚠️ שימי לב: זה endpoint שצריך להחזיר נתוני משתמש (כולל תמונה)
    const res = await fetch(buildApiUrl(`/profile/${id}`))
    if (!res.ok) throw new Error('profile endpoint failed')

    const data = await res.json()
    const avatarUrl = extractAvatar(data)

    profileAvatar.value = avatarUrl || defaultAvatar
  } catch (e) {
    profileAvatar.value = defaultAvatar
  }
}

onMounted(loadProfileAvatar)
watch(pid, () => loadProfileAvatar(), { immediate: true })





onMounted(loadProfileAvatar)

watch(pid, () => loadProfileAvatar(), { immediate: true })


</script>

<style scoped>
.container { width: 100%; padding: 0; margin: 0; }
.profileAvatarWrap{
  display:flex;
  justify-content:center;
  margin: 14px 0 0;
}

.profileAvatar{
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;

  border: 3px solid rgba(255,255,255,0.95);
  box-shadow:
    0 14px 30px rgba(31,63,50,0.18),
    0 0 0 4px rgba(207,227,216,0.70);
}
.shell {
  min-height: 100vh;
  padding: 18px 16px 70px;
  font-family: Arial, sans-serif;
  color: var(--h-text);

  /* ✅ אותו רקע כמו LOGIN */
  background: linear-gradient(
    180deg,
    #e6f2ec 0%,
    #d6e8df 55%,
    #c8ded3 100%
  );

  position: relative;
  overflow: hidden;
}

.btn{
  padding: 10px 14px;
  border-radius: 12px;

  border: 2.5px solid #2f6b4f;
  background: rgba(233, 243, 238, 0.85);
  color: #1f3f32;

  font-weight: 800;
}
.btn:hover{
  border-color: #24513f;
  background: rgba(233, 243, 238, 1);
}
/* Skip – SAME as Save (green border + light green bg) */
.btnOutline{
  padding: 10px 14px;
  border-radius: 12px;

  border: 2.5px solid #2f6b4f;
  background: rgba(233, 243, 238, 0.85);
  color: #1f3f32;

  font-weight: 800;
}

.btnOutline:hover{
  border-color: #24513f;
  background: rgba(233, 243, 238, 1);
}


/* blobs (צבעים בלבד -> tokens) */
.blob { position:absolute; filter: blur(18px); opacity:.55; border-radius:999px; pointer-events:none; }
.blob1 { width:360px; height:360px; left:-140px; top:-140px;
  background: radial-gradient(circle at 30% 30%, rgba(var(--h-green-600-rgb),0.45), rgba(var(--h-green-600-rgb),0.08));}
.blob2 { width:460px; height:460px; right:-210px; top:50px;
  background: radial-gradient(circle at 40% 40%, rgba(var(--h-green-700-rgb),0.30), rgba(233,243,238,0.14));}
.blob3 { width:420px; height:420px; left:50%; bottom:-250px; transform: translateX(-50%);
  background: radial-gradient(circle at 40% 40%, rgba(233,243,238,0.80), rgba(var(--h-green-700-rgb),0.06));}

.page { max-width: 980px; margin: 0 auto; }

.headerRow{
  display:flex;
  justify-content:space-between;
  align-items:flex-end;
  gap:14px;
  margin: 8px 0 18px;
}

.h1{
  margin:0 0 6px;
  font-size:44px;
  letter-spacing:-0.8px;
  font-weight:900;
  color: var(--h-green-700);
}
.subtitle{ margin:0; color: var(--h-text-muted); }

/* language */
.langBox{
  display:flex;
  align-items:center;
  gap:8px;
  padding:10px 12px;
  border-radius:14px;

  background: linear-gradient(180deg, rgba(255,255,255,0.70), rgba(255,255,255,0.40));
  border: 1px solid var(--h-border);
  box-shadow: var(--h-shadow-soft);
  backdrop-filter: blur(10px);
}
.langIcon{ opacity:0.8; }
.langSelect{ border:none; outline:none; background:transparent; font-weight:800; color: var(--h-text); cursor:pointer; }

/* content card */
.card{
  position:relative;
  border-radius: 18px;
  padding: 18px;
  overflow:hidden;

  /* ✅ רק צבעים: שימוש במשתנים קיימים מה-BASE */
  background: linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.52));
  border: 2.5px solid #2f6b4f;

  box-shadow: var(--h-shadow);
  backdrop-filter: blur(10px);
}

.cardGlow{
  position:absolute;
  inset:-2px;
  background: radial-gradient(700px 240px at 15% 0%, rgba(var(--h-green-600-rgb),0.16), transparent 60%);
  pointer-events:none;
}

.sectionTitle{
  font-weight: 900;
  margin-bottom: 12px;
  color: var(--h-green-800);
}

.row{
  display:flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(233,243,238,0.65);
  border: 1px solid var(--h-border);
}

.label{ font-weight: 900; color: var(--h-text); }
.value{ font-weight: 800; color: var(--h-text); }

.ltrNum { direction:ltr; unicode-bidi: plaintext; }

.hint{
  margin-top: 12px;
  color: var(--h-text-muted);
  font-size: 13px;
  line-height: 1.35;
}

.spacerBottom{ height: 10px; }

/* mobile */
@media (max-width: 420px) {
  .shell { padding: 12px 10px 60px; }
  .h1 { font-size: 34px; }
  .card { padding: 12px; border-radius: 16px; }
}


</style>
