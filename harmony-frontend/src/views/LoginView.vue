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
        <p v-if="errorMessage" class="errorText">
  {{ errorMessage }}
</p>

        <p v-if="phoneTouched && phone.trim() && !isIdValid" class="errorText">
          {{ t.phoneError }}
        </p>

        <p class="privacy-note">
          {{ privacyText[lang] }}
        </p>

        <!-- BUTTONS -->
        <div class="btnBar">
  <button class="primaryBtn" :disabled="!phone" @click="continueLogin">
    {{ t.continue }}
  </button>

  <button class="secondaryBtn" type="button" @click="goToRegister">
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
import { buildApiUrl } from '@/services/api'




const router = useRouter()
const phone = ref('')
const phoneTouched = ref(false)
const errorMessage = ref('')



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
    subtitle: 'Sign in to view your matches',
    language: 'Language',
    phone: 'Participant Phone Number',
    phonePlaceholder: '',
    phoneError: 'Please enter a valid phone number.',
    loginError: 'Login failed. Please check the phone number and try again.',
    continue: 'Continue',
    newParticipant: 'New participant',
  },
  ar: {
    subtitle: 'سجّل/ي الدخول لعرض المطابقات',
    language: 'اللغة',
    phone: 'رقم الهاتف',
    phonePlaceholder: '',
    phoneError: 'يرجى إدخال رقم هاتف صحيح.',
    loginError: 'فشل تسجيل الدخول. يرجى التحقق من رقم الهاتف والمحاولة مرة أخرى.',
    continue: 'متابعة',
    newParticipant: 'مشارك جديد',
  },
  he: {
    subtitle: 'התחבר/י כדי לראות את ההתאמות שלך',
    language: 'שפה',
    phone: 'מספר טלפון',
    phonePlaceholder: '',
    phoneError: 'נא להזין מספר טלפון תקין.',
    loginError: 'ההתחברות נכשלה. נא לבדוק את מספר הטלפון ולנסות שוב.',
    continue: 'המשך',
    newParticipant: 'משתתף חדש',
  },
}

const t = computed(() => TEXTS[lang.value] ?? TEXTS.en)
const isRtl = computed(() => lang.value === 'ar' || lang.value === 'he')

function normalizePhone(raw) {
  return String(raw || '').replace(/[^\d]/g, '').trim()
}

function isValidPhone(raw) {
  const normalized = normalizePhone(raw)
  return normalized.length >= 7
}

const isIdValid = computed(() => isValidPhone(phone.value))

function onPhoneInput() {
  phoneTouched.value = true
  errorMessage.value = ''
}

async function loginAndRoute(targetRoute) {
  phoneTouched.value = true
  errorMessage.value = ''

  if (!isIdValid.value) {
    errorMessage.value = t.value.phoneError
    return
  }

  const enteredPhone = normalizePhone(phone.value)

  try {
    const url = buildApiUrl('/api/auth/phone-login')
    console.log('POST URL:', url)
    console.log('PHONE:', enteredPhone)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: enteredPhone }),
    })

    const rawText = await res.text()
    console.log('STATUS:', res.status)
    console.log('RESPONSE TEXT:', rawText)

    let data = {}
    try {
      data = rawText ? JSON.parse(rawText) : {}
    } catch {
      data = {}
    }

    if (!res.ok) {
      throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
    }

    const pid = String(data.participantId || '').trim()
    if (!pid) {
      throw new Error('Missing participantId in response')
    }

    authStore.phone = enteredPhone
    authStore.isLoggedIn = true
    localStorage.setItem('harmony_pid', pid)

    router.push(`/${targetRoute}/${pid}`)
  } catch (err) {
    console.error('LOGIN ERROR:', err)
    errorMessage.value = err.message || t.value.loginError
  }
}

async function continueLogin() {
  await loginAndRoute('matches')
}
async function goToRegister() {
  router.push('/profile/new')
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

  background: linear-gradient(
    180deg,
    rgba(233,243,238,0.92),
    rgba(255,255,255,0.80)
  );

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
  position: relative;
}

.selectInput{
  padding-right: 44px;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}

.arrow{
  pointer-events: none;
  position:absolute;
  right:16px;
  top:50%;
  transform: translateY(-50%);
  opacity: 0.6;
}

.ltrNum{ direction:ltr; unicode-bidi: plaintext; }

.errorText{
  margin: -6px 0 4px;
  font-size: 12.5px;
  color: rgba(170, 50, 50, 0.95);
  text-align: center;
}

/* ===== BUTTONS BAR ===== */
.btnBar {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 18px;
}

.btnBar .primaryBtn,
.btnBar .secondaryBtn {
  width: 100%;
  display: block;
  box-sizing: border-box;
  margin: 0;
}

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
  background: linear-gradient(135deg, rgba(233,243,238,0.98), rgba(206,232,221,0.98));
}

.secondaryBtn{
  background: linear-gradient(135deg, rgba(233,243,238,0.98), rgba(206,232,221,0.98));
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