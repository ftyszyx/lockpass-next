import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useWebSessionStore } from '../stores/webSession'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'web-login',
    component: () => import('../pages/WebLoginPage.vue')
  },
  {
    path: '/',
    redirect: '/vault'
  },
  {
    path: '/vault',
    name: 'web-vault',
    component: () => import('@/pages/desktop/DesktopVaultPage.vue')
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/vault'
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  const session = useWebSessionStore()
  await session.restore()
  if (to.name !== 'web-login' && !session.token) {
    return { name: 'web-login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'web-login' && session.token && to.query.desktopBind !== '1') {
    return { path: String(to.query.redirect || '/vault') }
  }
  return true
})
