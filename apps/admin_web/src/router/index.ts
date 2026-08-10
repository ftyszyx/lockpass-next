import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    meta: { public: true, titleKey: 'auth.login' },
    component: () => import('@/pages/auth/LoginPage.vue')
  },
  {
    path: '/auth/callback/:provider',
    name: 'auth-callback',
    meta: { public: true, titleKey: 'auth.login' },
    component: () => import('@/pages/auth/LoginPage.vue')
  },
  {
    path: '/',
    component: () => import('@/layouts/ServerLayout.vue'),
    children: [
      {
        path: '',
        redirect: '/admin/accounts'
      },
      {
        path: 'admin/accounts',
        name: 'admin-accounts',
        meta: { titleKey: 'layout.accounts', requiresAdmin: true },
        component: () => import('@/pages/admin/AdminAccountsPage.vue')
      },
      {
        path: 'admin',
        redirect: '/admin/accounts'
      },
      {
        path: 'admin/permissions',
        redirect: '/admin/roles'
      },
      {
        path: 'admin/roles',
        name: 'admin-roles',
        meta: { titleKey: 'layout.roles', requiresAdmin: true },
        component: () => import('@/pages/admin/AdminRolesPage.vue')
      },
      {
        path: 'admin/local-accounts',
        name: 'admin-local-accounts',
        meta: { titleKey: 'layout.localAccounts', requiresAdmin: true },
        component: () => import('@/pages/admin/AdminLocalAccountsPage.vue')
      },
      {
        path: 'admin/account-roles',
        redirect: '/admin/accounts'
      },
      {
        path: 'admin/data',
        name: 'admin-data',
        meta: { titleKey: 'layout.syncData', requiresAdmin: true },
        component: () => import('@/pages/admin/AdminSyncDataPage.vue')
      },
      {
        path: 'admin/save-history',
        name: 'admin-save-history',
        meta: { titleKey: 'layout.syncEvents', requiresAdmin: true },
        component: () => import('@/pages/admin/AdminSyncEventsPage.vue')
      },
      {
        path: 'admin/sync-data',
        redirect: '/admin/data'
      },
      {
        path: 'admin/sync-events',
        redirect: '/admin/save-history'
      },
      {
        path: 'admin/config',
        redirect: '/admin/system/general'
      },
      {
        path: 'admin/audit',
        name: 'admin-audit',
        meta: { titleKey: 'layout.audit', requiresAdmin: true },
        component: () => import('@/pages/admin/AdminAuditPage.vue')
      },
      {
        path: 'admin/system',
        redirect: '/admin/system/general'
      },
      {
        path: 'admin/system/general',
        name: 'admin-system-general',
        meta: { titleKey: 'layout.systemGeneral', requiresAdmin: true, configSection: 'general' },
        component: () => import('@/pages/admin/AdminSystemPage.vue')
      },
      {
        path: 'admin/system/email',
        name: 'admin-system-email',
        meta: { titleKey: 'layout.systemEmail', requiresAdmin: true, configSection: 'email' },
        component: () => import('@/pages/admin/AdminSystemPage.vue')
      },
      {
        path: 'admin/system/auth',
        name: 'admin-system-auth',
        meta: { titleKey: 'layout.systemAuth', requiresAdmin: true, configSection: 'auth' },
        component: () => import('@/pages/admin/AdminSystemPage.vue')
      },
      {
        path: 'admin/system/quota',
        name: 'admin-system-quota',
        meta: { titleKey: 'layout.systemQuota', requiresAdmin: true, configSection: 'quota' },
        component: () => import('@/pages/admin/AdminSystemPage.vue')
      },
      {
        path: 'console/:pathMatch(.*)*',
        redirect: '/admin/accounts'
      }
    ]
  },
  {
    path: '/admin-required',
    name: 'admin-required',
    meta: { public: true, titleKey: 'auth.adminRequired' },
    component: () => import('@/pages/auth/AdminAccessDeniedPage.vue')
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.restore()
  if (!to.meta.public && !session.token) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (!to.meta.public && !session.isAdmin) {
    return { name: 'admin-required' }
  }
  if (to.meta.public && session.token && to.name !== 'admin-required') {
    return { path: session.isAdmin ? String(to.query.redirect || '/admin/accounts') : '/admin-required' }
  }
  return true
})
