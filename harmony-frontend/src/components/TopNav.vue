<template>
  <button @click="logout">
  {{ TEXTS[lang].logout }}
</button>
  <header class="topNav" :dir="isRtl ? 'rtl' : 'ltr'">
    <!-- Hamburger -->
    <button class="menuBtn" type="button" @click="open = true" aria-label="Open menu">
      <span></span>
      <span></span>
      <span></span>
    </button>

    <!-- LOGO CENTER -->
    <div class="logoWrap">
      <img class="logo" :src="logoSrc" alt="Harmony logo" />
    </div>

    <!-- spacer -->
    <div class="spacer"></div>
    

    <!-- Overlay + Drawer -->
    <div v-if="open" class="overlay" @click.self="open = false">
      <aside class="drawer" :class="{ right: isRtl }" @click.stop>
        <div class="drawerTop">
          <img class="drawerLogo" :src="logoSrc" alt="Harmony" />
          <button class="closeBtn" @click="open = false" aria-label="Close menu">✕</button>
        </div>

<nav class="drawerNav">
  <router-link :to="pidStr ? `/matches/${pidStr}` : '/login'" class="item" @click="open = false">
    {{ t.matches }}
  </router-link>

  <router-link :to="pidStr ? `/profile/${pidStr}` : '/login'" class="item" @click="open = false">
    {{ t.profile }}
  </router-link>

  <router-link :to="pidStr ? `/met/${pidStr}` : '/login'" class="item" @click="open = false">
    {{ t.met }}
  </router-link>

  <router-link :to="pidStr ? `/saved/${pidStr}` : '/login'" class="item" @click="open = false">
    {{ t.saved }}
  </router-link>
</nav>


      </aside>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import logoSrc from '../assets/harmony-logo.png'

import { useRouter } from 'vue-router'

const router = useRouter()

function logout() {
  localStorage.removeItem('harmony_pid')
  router.push('/login')
}
const TEXTS = {
  en: {
    logout: 'Logout'
  },
  he: {
    logout: 'התנתק'
  },
  ar: {
    logout: 'تسجيل الخروج'
  }
}

const props = defineProps({
  lang: { type: String, default: 'en' },
})

const route = useRoute()
const open = ref(false)

const isRtl = computed(() => props.lang === 'he' || props.lang === 'ar')

const pidStr = computed(() => {
  // קודם מה-URL, ואם אין – מה-localStorage
  const pid = String(route.params.id || localStorage.getItem('harmony_pid') || '').trim()
  return pid
})

// אם יש pid ב-URL – נשמור אותו תמיד
watch(
  () => route.params.id,
  (v) => {
    const pid = String(v || '').trim()
    if (pid) localStorage.setItem('harmony_pid', pid)
  },
  { immediate: true }
)

const t = computed(() => {
  if (props.lang === 'he')
    return { matches: 'התאמות', profile: 'פרופיל', met: 'נפגשנו', saved: 'שמורים' }
  if (props.lang === 'ar')
    return { matches: 'المطابقات', profile: 'الملف الشخصي', met: 'تم اللقاء', saved: 'المحفوظات' }
  return { matches: 'Matches', profile: 'Profile', met: 'Met', saved: 'Saved' }
})
</script>


<style scoped>
/* NAV */


.topNav{
  position: sticky;
  top: 12px;
  z-index: 120;

  display: grid;
  grid-template-columns: 56px 1fr 56px;
  align-items: center;
  padding: 10px 14px;
  border-radius: 22px;

  background: linear-gradient(135deg, rgba(47,107,79,0.96), rgba(63,127,99,0.92));
  border: 1px solid rgba(233,243,238,0.30);
  box-shadow: 0 18px 55px rgba(31,63,50,0.20);

  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

/* MENU BUTTON */
.menuBtn{
  width:56px;
  height:44px;
  border-radius:14px;

  background: rgba(233,243,238,0.20);
  border: 1px solid rgba(233,243,238,0.32);

  display:grid;
  place-content:center;
  gap:6px;
  cursor:pointer;
  transition: transform 140ms ease, background 140ms ease;
}
.menuBtn:hover{
  transform: translateY(-1px);
  background: rgba(233,243,238,0.28);
}
.menuBtn span{
  width:22px;
  height:3px;
  background: rgba(255,255,255,0.94);
  border-radius:999px;
}

/* LOGO */
.logoWrap {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);

  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;

  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}
.logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

/* spacer */
.spacer{ width:56px; height:44px; }

/* ✅ Overlay מאחורה (כהה ויפה) */
.overlay{
  position: fixed;
  inset: 0;
  background: rgba(15, 25, 20, 0.70); /* פחות שקוף, יותר "סוגר" */
  z-index: 9999;
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

/* ✅ Drawer עצמו (זה היה חסר אצלך!) */
.drawer{
  position: absolute;
  top: 0;
  left: 0;

  width: min(340px, 86vw);
  height: 100vh;

  /* ירוק כמו הלוגו, לא שקוף */
  background: linear-gradient(180deg, #2f6b4f 0%, #3f7f63 100%);

  border-right: 3px solid #24513f;
  box-shadow: 18px 0 70px rgba(31,63,50,0.35);

  padding: 16px;
  display: flex;
  flex-direction: column;

  overflow-y: auto;
}

.drawer.right{
  left: auto;
  right: 0;
  border-right: none;
  border-left: 3px solid #24513f;
  box-shadow: -18px 0 70px rgba(31,63,50,0.35);
}

/* TOP area */
.drawerTop{
  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 12px 12px;
  border-radius: 16px;

  /* כרטיס ירקרק בהיר על רקע ירוק */
  background: rgba(233,243,238,0.95);
  border: 2px solid #24513f;

  box-shadow: 0 10px 22px rgba(31,63,50,0.18);
}

.drawerLogo{
  height: 52px;
  width: auto;
  border-radius: 12px;
}

.closeBtn{
  width: 44px;
  height: 44px;
  border-radius: 12px;

  background: #f2f8f5;
  border: 2px solid #2f6b4f;
  color: #1f3f32;
  font-weight: 900;
  cursor: pointer;
}
.closeBtn:hover{
  background: #ffffff;
}

/* NAV list */
.drawerNav{
  margin-top: 16px;
  display: grid;
  gap: 12px;
}

/* ITEMS */
.item{
  padding: 16px;
  border-radius: 16px;
  text-decoration: none;
  font-weight: 900;

  color: #1f3f32;
  background: rgba(233,243,238,0.95); /* לא שקוף */
  border: 2px solid #24513f;

  box-shadow: 0 10px 22px rgba(31,63,50,0.14);
}
.item:hover{
  background: #ffffff;
}

/* MOBILE */
@media (max-width: 420px){
  .topNav{
    grid-template-columns: 48px 1fr 48px;
    padding: 8px 10px;
    border-radius:18px;
    top: 10px;
  }
  .menuBtn{ width:48px; height:38px; border-radius:12px; gap:5px; }
  .menuBtn span{ width:20px; height:3px; }
  .spacer{ width:48px; height:38px; }
  .logoWrap{ width:48px; height:48px; }
  .drawer{ padding: 14px; }
  .drawerLogo{ height:44px; }
  .item{ padding:14px; border-radius:14px; }
}
</style>
