<template>
  <div class="container">
    <div class="loginPage" :dir="isRtl ? 'rtl' : 'ltr'">
      <div class="loginCard">
        <!-- BRAND -->
        <div class="brand">
          <img class="brandLogo" src="@/assets/harmony-logo.png" alt="Harmony" />
          <h1 class="title">Harmony</h1>
        </div>

        <p class="subtitle">{{ t.subtitle }}</p>

        <!-- LANGUAGE -->
        <label class="label">{{ t.language }}</label>
        <div class="field">
          <select class="input selectInput" v-model="lang">
            <option value="en">English</option>
            <option value="ar">Arabic</option>
            <option value="he">Hebrew</option>
          </select>
          <span class="arrow">▾</span>
        </div>

        <!-- PHONE / ID -->
        <label class="label">{{ t.phone }}</label>
        <div class="field">
          <input
            v-model="phone"
            class="input phoneInput ltrNum"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            :placeholder="t.phonePlaceholder"
            @input="onPhoneInput"
            @keyup.enter="continueLogin"
          />
        </div>

        <p v-if="phoneTouched && phone.trim() && !isIdValid" class="errorText">
          {{ t.phoneError }}
        </p>
        <p class="privacy-note">
  {{ privacyText[lang] }}
</p>

        <!-- BUTTONS -->
        <div class="btnBar">
          <button type="button" class="primaryBtn" :disabled="!isIdValid" @click="continueLogin">
            {{ t.continue }}
          </button>

          <button type="button" class="secondaryBtn" @click="newParticipant">
            {{ t.newParticipant }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authStore } from '@/store/authStore'

const router = useRouter()

// כרגע נשאיר את השם phone כדי לא לשבור לך CSS.
// אבל בפועל – אנחנו משתמשים בזה בתור "participant id" בשביל הבדיקה.
const phone = ref('')
const phoneTouched = ref(false)

const LANG_KEY = 'harmony_lang'
const lang = ref(localStorage.getItem(LANG_KEY) || 'en')
watch(lang, v => localStorage.setItem(LANG_KEY, v), { immediate: true })
const privacyText = {
  en: 'By continuing, you agree to the Privacy Policy. Your data will only be used for networking recommendations during the event.',
  he: 'בהמשך השימוש במערכת, את/ה מסכימ/ה למדיניות הפרטיות. המידע שלך ישמש רק ליצירת התאמות נטוורקינג במהלך האירוע.',
  ar: 'بالمتابعة، أنت توافق/ين على سياسة الخصوصية. سيتم استخدام بياناتك فقط لتقديم توصيات للتواصل خلال الفعالية.',
}

const TEXTS = {
  en: {
    language: 'Language',
    phone: 'Participant Phone Number',
    phonePlaceholder: '',
    phoneError: 'Please enter a valid numeric ID (e.g. 15).',
    continue: 'Continue',
    newParticipant: 'New participant',
  },
  ar: {
    language: 'اللغة',
    phone: 'رقم الهاتف',
    phonePlaceholder: '',
    continue: 'متابعة',
    newParticipant: 'مشارك جديد',
  },
  he: {
    language: 'שפה',
    phone: 'מספר טלפון',
    phonePlaceholder: '',
    continue: 'המשך',
    newParticipant: 'משתתף חדש',
  },
}

const t = computed(() => TEXTS[lang.value] ?? TEXTS.en)
const isRtl = computed(() => lang.value === 'ar' || lang.value === 'he')

// מוציא רק ספרות (כדי שאם כתבו רווח/תו זה לא יפיל)
function normalizeId(raw) {
  const s = (raw || '').trim()
  const digitsOnly = s.replace(/[^\d]/g, '')
  return digitsOnly
}

function isValidId(raw) {
  const id = normalizeId(raw)
  // מאפשר גם מספר שמתחיל ב-0 (טלפון)
  return /^\d+$/.test(id)
}
function logout() {
  localStorage.removeItem('harmony_pid')
  router.push('/login')
}


const isIdValid = computed(() => isValidId(phone.value))

function onPhoneInput() {
  phoneTouched.value = true
}

function continueLogin() {
  if (!isIdValid.value) return
  const id = normalizeId(phone.value)

  authStore.phone = id
  authStore.isLoggedIn = true

  localStorage.setItem('harmony_pid', id)

  router.push(`/matches/${id}`)
}


function newParticipant() {
  const id = normalizeId(phone.value)
  if (!id) return

  authStore.phone = id
  authStore.isLoggedIn = true
  localStorage.setItem('harmony_pid', id)

  router.push(`/profile/${id}`)
}


</script>

<style scoped>
.container { width: 100%; max-width: none; padding: 0; margin: 0; }

/* ===== PAGE BG (ירוק מחוזק כמו שביקשת) ===== */
.loginPage{
  min-height: 100svh;
  display: grid;
  place-items: center;
  width: 100%;
  padding: 18px;
  font-family: Arial, sans-serif;
  color: var(--h-text);

  background: linear-gradient(
    180deg,
    #e6f2ec 0%,
    #d6e8df 55%,
    #c8ded3 100%
  );
}

/* ===== CARD (מסגרת ירוקה + glass ירקרק) ===== */
.loginCard{
  width: min(520px, 92vw);
  padding: 26px 22px;
  border-radius: 26px;

  /* glass ירקרק (לא לבן מדי) */
  background: linear-gradient(
    180deg,
    rgba(233,243,238,0.92),
    rgba(255,255,255,0.80)
  );

  /* מסגרת ירוקה כמו בלוגו */
  border: 2.5px solid #2f6b4f;

  box-shadow:
    0 20px 45px rgba(31,63,50,0.15),
    0 0 0 6px rgba(207,227,216,0.40);

  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);

  display: flex;
  flex-direction: column;
  gap: 14px;

  max-height: calc(100svh - 36px);
  overflow: auto;
  scroll-padding-bottom: 140px;
}

/* ===== BRAND ===== */
.brand{ display:flex; align-items:center; justify-content:center; gap:12px; }
.brandLogo{
  height: 54px;
  width: 54px;
  object-fit: cover;
  border-radius: 50%;
}
.title{ font-size: 44px; font-weight: 900; color: #1f3f32; margin: 0; }
.subtitle{ text-align:center; font-size:14px; color: var(--h-text-muted); }

/* ===== FORM ===== */
.label{ font-size: 13px; font-weight: 900; color: var(--h-text); }

.input{
  width: 100%;
  padding: 14px 44px 14px 14px;
  border-radius: 16px;
  height: 52px;
  box-sizing: border-box;

  /* מסגרת ירקרקה עדינה */
  border: 2px solid rgba(47,107,79,0.25);
  background: rgba(255,255,255,0.94);
  color: var(--h-text);

  font-size: 14px;
  box-shadow: 0 10px 22px rgba(31,63,50,0.08);
}

.input:focus{
  outline: none;
  border-color: #2f6b4f;
  box-shadow: 0 0 0 4px rgba(47,107,79,0.18), 0 12px 26px rgba(31,63,50,0.10);
}
.field{
  width: 100%;
}

.selectInput{
  padding-right: 44px; /* נשאיר מקום לחץ שלך */
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}

.arrow{
  pointer-events: none;
  right: 16px;
}


.arrow{ position:absolute; right:16px; top:50%; transform: translateY(-50%); opacity: 0.6; }
.ltrNum{ direction:ltr; unicode-bidi: plaintext; }

.errorText{
  margin: -6px 0 4px;
  font-size: 12.5px;
  color: rgba(170, 50, 50, 0.95);
  text-align: center;
}

/* ===== BUTTONS BAR ===== */
.btnBar{
  position: sticky;
  bottom: 0;
  padding-top: 12px;
  display: grid;
  gap: 12px;

  margin-left: -22px;
  margin-right: -22px;
  padding-left: 22px;
  padding-right: 22px;

  border-bottom-left-radius: 26px;
  border-bottom-right-radius: 26px;

  background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(233,243,238,0.95));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

/* ===== BUTTONS (מסגרת ירוקה כמו Matches) ===== */
.primaryBtn,
.secondaryBtn{
  width: 100%;
  min-height: 54px;
  border-radius: 18px;
  font-weight: 900;
  font-size: 16px;
  cursor: pointer;

  border: 2.5px solid #2f6b4f;
  color: #1f3f32;

  box-shadow: 0 14px 30px rgba(31,63,50,0.12);
  transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
}

.primaryBtn{
  /* Continue קצת יותר "premium" */
  background: linear-gradient(135deg, rgba(233,243,238,0.98), rgba(206,232,221,0.98));
}

.secondaryBtn{
  /* New participant — אותו סגנון, קצת יותר לבן */
  background: rgba(233,243,238,0.88);
}

.primaryBtn:hover,
.secondaryBtn:hover{
  transform: translateY(-1px);
  border-color: #24513f;
  background: rgba(233,243,238,1);
}

.primaryBtn:disabled{
  background: rgba(233,243,238,0.55);
  border-color: rgba(47,107,79,0.28);
  color: rgba(31,63,50,0.55);
  box-shadow: none;
  cursor: not-allowed;
  transform: none;
}

/* ===== MOBILE ===== */
@media (max-width: 420px){
  .loginPage{ padding: 12px; }
  .loginCard{
    width: 94vw;
    padding: 16px 14px;
    border-radius: 18px;
    gap: 10px;
  }
  .title{ font-size: 34px; }
  .brandLogo{ height: 44px; width:44px; }

  .primaryBtn, .secondaryBtn{ min-height: 50px; font-size: 15px; }

  .btnBar{
    margin-left: -14px;
    margin-right: -14px;
    padding-left: 14px;
    padding-right: 14px;
    border-bottom-left-radius: 18px;
    border-bottom-right-radius: 18px;
  }
}
.privacy-note {
  margin-top: 14px;
  font-size: 12px;
  text-align: center;
  color: #4b5f52;
}

</style>
