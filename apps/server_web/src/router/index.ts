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
        redirect: '/console'
      },
      {
        path: 'console',
        name: 'console',
        meta: { titleKey: 'layout.overview' },
        component: () => import('@/pages/console/ConsoleOverviewPage.vue')
      },
      {
        path: 'console/devices',
        name: 'console-devices',
        meta: { titleKey: 'layout.devices' },
        component: () => import('@/pages/console/ConsoleDevicesPage.vue')
      },
      {
        path: 'console/local-accounts',
        name: 'console-local-accounts',
        meta: { titleKey: 'layout.localAccounts' },
        component: () => import('@/pages/admin/AdminLocalAccountsPage.vue')
      },
      {
        path: 'console/security',
        redirect: '/console/devices'
      },
      {
        path: 'console/sync-data',
        name: 'console-sync-data',
        meta: { titleKey: 'layout.syncData' },
        component: () => import('@/pages/admin/AdminSyncDataPage.vue')
      },
      {
        path: 'console/sync-events',
        name: 'console-sync-events',
        meta: { titleKey: 'layout.syncEvents' },
        component: () => import('@/pages/admin/AdminSyncEventsPage.vue')
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
        path: 'admin/sync-data',
        name: 'admin-sync-data',
        meta: { titleKey: 'layout.syncData', requiresAdmin: true },
        component: () => import('@/pages/admin/AdminSyncDataPage.vue')
      },
      {
        path: 'admin/sync-events',
        name: 'admin-sync-events',
        meta: { titleKey: 'layout.syncEvents', requiresAdmin: true },
        component: () => import('@/pages/admin/AdminSyncEventsPage.vue')
      },
      {
        path: 'admin/config',
        name: 'admin-config',
        meta: { titleKey: 'layout.system', requiresAdmin: true },
        component: () => import('@/pages/admin/AdminSystemPage.vue')
      },
      {
        path: 'admin/audit',
        name: 'admin-audit',
        meta: { titleKey: 'layout.audit', requiresAdmin: true },
        component: () => import('@/pages/admin/AdminAuditPage.vue')
      },
      {
        path: 'admin/system',
        name: 'admin-system',
        meta: { titleKey: 'layout.system', requiresAdmin: true },
        component: () => import('@/pages/admin/AdminSystemPage.vue')
      }
    ]
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
  if (to.meta.requiresAdmin && !session.isAdmin) {
    return { path: '/console' }
  }
  if (to.meta.public && session.token && to.query.desktopBind !== '1') {
    return { path: String(to.query.redirect || '/console') }
  }
  return true
})
