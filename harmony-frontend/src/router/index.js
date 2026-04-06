import { createRouter, createWebHistory } from 'vue-router'

import LoginView from '../views/LoginView.vue'
import MatchesView from '../views/MatchesView.vue'
import SavedView from '../views/SavedView.vue'
import MetView from '../views/MetView.vue'
import ProfileView from '../views/ProfileView.vue'

function getStoredPid() {
  if (typeof window === 'undefined') return ''

  const pid = String(localStorage.getItem('harmony_pid') || '').trim()

  const hasValidPid =
    pid !== '' &&
    pid !== 'null' &&
    pid !== 'undefined'

  return hasValidPid ? pid : ''
}

const withPidOrLogin = (base) => {
  const pid = getStoredPid()
  return pid ? `/${base}/${pid}` : '/login'
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: LoginView },

    { path: '/matches', redirect: () => withPidOrLogin('matches') },
    { path: '/saved', redirect: () => withPidOrLogin('saved') },
    { path: '/met', redirect: () => withPidOrLogin('met') },
    { path: '/profile', redirect: () => withPidOrLogin('profile') },

    { path: '/matches/:id', component: MatchesView },
    { path: '/saved/:id', component: SavedView },
    { path: '/met/:id', component: MetView },
    { path: '/profile/:id', component: ProfileView },
    
  ],
})

router.beforeEach((to, from, next) => {
  const pid = getStoredPid()

  const isPublicPage =
    to.path === '/login' ||
    to.path === '/register' ||
    to.path === '/profile/new'

  if (!isPublicPage && !pid) {
    return next('/login')
  }

  next()
})

export default router