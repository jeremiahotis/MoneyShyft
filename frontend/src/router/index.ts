import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useAccessStore } from '@/stores/access';
import pinia from '@/pinia';
import type { RouteRecordRaw } from 'vue-router';

type AdminScope = 'any' | 'tenant' | 'system';

const resolveAdminScope = (value: unknown): AdminScope | null => {
  if (value === 'any' || value === 'tenant' || value === 'system') {
    return value;
  }

  return null;
};

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/Auth/LoginView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/signup',
    name: 'signup',
    component: () => import('@/views/Auth/SignupView.vue'),
    meta: { requiresGuest: true }
  },
  {
    path: '/',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/app/connectshyft/inbox',
    name: 'connectshyft-inbox',
    component: () => import('@/views/ConnectShyft/ConnectShyftInboxView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/app/connectshyft/settings/availability',
    name: 'connectshyft-availability',
    component: () => import('@/views/ConnectShyft/ConnectShyftAvailabilityView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/accounts',
    name: 'accounts',
    component: () => import('@/views/Accounts/AccountsListView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/transactions',
    name: 'transactions',
    component: () => import('@/views/Transactions/TransactionsListView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/recurring-transactions',
    name: 'recurring-transactions',
    component: () => import('@/views/Transactions/RecurringTransactionsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/budget',
    name: 'budget',
    component: () => import('@/views/Budget/BudgetView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/budget/setup',
    name: 'budget-setup',
    component: () => import('@/views/Budget/BudgetSetupWizard.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/goals',
    name: 'goals',
    component: () => import('@/views/Goals/GoalsListView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/debts',
    name: 'debts',
    component: () => import('@/views/Debts/DebtsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/extra-money',
    name: 'extra-money',
    component: () => import('@/views/ExtraMoneyView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/Settings/HouseholdSettingsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    name: 'admin-home',
    component: () => import('@/views/Admin/AdminLandingView.vue'),
    meta: {
      requiresAuth: true,
      adminScope: 'any',
      allowIncompleteSetup: true,
    }
  },
  {
    path: '/admin/system',
    name: 'admin-system',
    component: () => import('@/views/Admin/SystemAdminView.vue'),
    meta: {
      requiresAuth: true,
      adminScope: 'system',
      allowIncompleteSetup: true,
    }
  },
  {
    path: '/admin/tenant',
    name: 'admin-tenant',
    component: () => import('@/views/Admin/TenantAdminView.vue'),
    meta: {
      requiresAuth: true,
      adminScope: 'tenant',
      allowIncompleteSetup: true,
    }
  },
  {
    path: '/scenarios',
    name: 'scenarios',
    component: () => import('@/views/Scenarios/ScenariosListView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/scenarios/:id',
    name: 'scenario-detail',
    component: () => import('@/views/Scenarios/ScenarioDetailView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/scenarios/:id/projection',
    name: 'scenario-projection',
    component: () => import('@/views/Scenarios/ScenarioComparisonView.vue'),
    meta: { requiresAuth: true }
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL || '/'),
  routes
});

// Navigation guards
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore(pinia);
  const accessStore = useAccessStore(pinia);

  // Try to load user if not already loaded
  if (!authStore.user && !authStore.isLoading) {
    try {
      await authStore.fetchCurrentUser();
    } catch (_error) {
      // Failed to load user - that's ok, they're probably not authenticated
      // Let the requiresAuth check handle it below
    }
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    accessStore.clear();
    // Redirect to login if route requires auth and user is not authenticated
    next({ name: 'login', query: { redirect: to.fullPath } });
    return;
  }

  if (to.meta.requiresGuest && authStore.isAuthenticated) {
    // Redirect to dashboard if route is for guests only and user is authenticated
    next({ name: 'dashboard' });
    return;
  }

  const adminScope = resolveAdminScope(to.meta.adminScope);
  if (authStore.isAuthenticated && adminScope) {
    await accessStore.refresh({ tenantId: authStore.user?.householdId || undefined });

    if (adminScope === 'system' && !accessStore.canAccessSystemAdmin) {
      if (accessStore.canAccessTenantAdmin) {
        next({ name: 'admin-tenant' });
      } else {
        next({ name: 'dashboard' });
      }
      return;
    }

    if (adminScope === 'tenant' && !accessStore.canAccessTenantAdmin) {
      next({ name: 'dashboard' });
      return;
    }

    if (adminScope === 'any') {
      if (accessStore.canAccessSystemAdmin) {
        next({ name: 'admin-system' });
      } else if (accessStore.canAccessTenantAdmin) {
        next({ name: 'admin-tenant' });
      } else {
        next({ name: 'dashboard' });
      }
      return;
    }
  }

  if (
    authStore.isAuthenticated &&
    authStore.user?.householdId &&
    authStore.user?.setupWizardCompleted === false &&
    to.name !== 'budget-setup' &&
    to.meta.allowIncompleteSetup !== true
  ) {
    next({ name: 'budget-setup' });
    return;
  }

  next();
});

export default router;
