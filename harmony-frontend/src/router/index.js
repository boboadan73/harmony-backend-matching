import { createRouter, createWebHistory } from 'vue-router'

import LoginView from '../views/LoginView.vue'
import MatchesView from '../views/MatchesView.vue'
import SavedView from '../views/SavedView.vue'
import MetView from '../views/MetView.vue'
import ProfileView from '../views/ProfileView.vue'

const withPidOrLogin = (base) => {
  const pid = String(localStorage.getItem('harmony_pid') || '').trim()

  const hasValidPid =
    pid !== '' &&
    pid !== 'null' &&
    pid !== 'undefined'

  return hasValidPid ? `/${base}/${pid}` : '/login'
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: LoginView },

    // ✅ אם מישהו מגיע בלי id – ננתב אוטומטית לפי harmony_pid
    { path: '/matches', redirect: () => withPidOrLogin('matches') },
    { path: '/saved', redirect: () => withPidOrLogin('saved') },
    { path: '/met', redirect: () => withPidOrLogin('met') },
    { path: '/profile', redirect: () => withPidOrLogin('profile') },

    // ✅ הדפים האמיתיים עם id
    { path: '/matches/:id', component: MatchesView },
    { path: '/saved/:id', component: SavedView },
    { path: '/met/:id', component: MetView },
    { path: '/profile/:id', component: ProfileView },
  ],
})
router.beforeEach((to, from, next) => {
  const rawPid = localStorage.getItem('harmony_pid')
  const pid = String(rawPid || '').trim()

  const hasValidPid =
    pid !== '' &&
    pid !== 'null' &&
    pid !== 'undefined'

  const publicPages = ['/login']
  const isPublicPage = publicPages.includes(to.path)

  if (!isPublicPage && !hasValidPid) {
    return next('/login')
  }

  next()
})

export default router
