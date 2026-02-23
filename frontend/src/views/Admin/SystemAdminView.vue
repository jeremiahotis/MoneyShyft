<template>
  <AppLayout>
    <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <AppBreadcrumbs :items="breadcrumbs" />

      <div class="bg-white rounded-xl shadow p-6 border border-gray-100">
        <h1 class="text-3xl font-bold text-gray-900" data-testid="system-admin-heading">System Administration</h1>
        <p class="mt-2 text-gray-600">
          Create and bootstrap tenants. This workspace is restricted to system-level governance roles.
        </p>
      </div>

      <div v-if="!accessStore.canAccessSystemAdmin" class="bg-red-50 border border-red-200 rounded-xl p-5">
        <h2 class="font-semibold text-red-800">Access denied</h2>
        <p class="text-red-700 mt-2">
          Your active role does not include system administration capabilities.
        </p>
        <router-link to="/admin/tenant" class="inline-block mt-4 text-sm font-medium text-primary-700 hover:underline">
          Go to Tenant Administration
        </router-link>
      </div>

      <div v-else class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section class="xl:col-span-2 bg-white rounded-xl shadow p-6 border border-gray-100">
          <h2 class="text-xl font-semibold text-gray-900">Create Tenant</h2>
          <p class="text-sm text-gray-600 mt-1">
            Provision a new tenant and optionally assign its initial tenant administrator.
          </p>

          <form class="mt-5 space-y-4" @submit.prevent="handleCreateTenant">
            <div>
              <label for="tenant-name" class="block text-sm font-medium text-gray-700">Tenant Name</label>
              <input
                id="tenant-name"
                v-model="tenantName"
                data-testid="tenant-name-input"
                type="text"
                required
                class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="tenant-status" class="block text-sm font-medium text-gray-700">Status</label>
                <select
                  id="tenant-status"
                  v-model="tenantStatus"
                  data-testid="tenant-status-select"
                  class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="archived">archived</option>
                </select>
              </div>

              <div>
                <label for="billing-account" class="block text-sm font-medium text-gray-700">Billing Account (optional)</label>
                <input
                  id="billing-account"
                  v-model="billingAccountName"
                  data-testid="tenant-billing-input"
                  type="text"
                  class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div class="space-y-2">
              <label for="tenant-admin-user-lookup" class="block text-sm font-medium text-gray-700">
                Initial Tenant Admin (optional lookup by name/email)
              </label>
              <div class="flex gap-2">
                <input
                  id="tenant-admin-user-lookup"
                  v-model="tenantAdminLookupQuery"
                  data-testid="tenant-admin-user-lookup-input"
                  type="text"
                  placeholder="Search by name or email"
                  class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
                <button
                  type="button"
                  class="mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  @click="handleLookupTenantAdmin"
                >
                  Search
                </button>
              </div>
              <select
                v-if="tenantAdminLookupResults.length"
                v-model="assignTenantAdminUserId"
                data-testid="tenant-admin-user-select"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
              >
                <option value="">Select a user</option>
                <option v-for="user in tenantAdminLookupResults" :key="user.id" :value="user.id">
                  {{ user.firstName }} {{ user.lastName }} ({{ user.email }})
                </option>
              </select>
            </div>

            <div>
              <label for="tenant-reason" class="block text-sm font-medium text-gray-700">Reason</label>
              <input
                id="tenant-reason"
                v-model="reason"
                data-testid="tenant-reason-input"
                type="text"
                required
                class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div v-if="successMessage" class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800" data-testid="admin-form-success">
              {{ successMessage }}
            </div>
            <div v-if="errorMessage" class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800" data-testid="admin-form-error">
              {{ errorMessage }}
            </div>

            <button
              type="submit"
              data-testid="tenant-submit"
              :disabled="isSubmitting"
              class="inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-white font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="isSubmitting">Creating tenant...</span>
              <span v-else>Create Tenant</span>
            </button>
          </form>
        </section>

        <aside class="bg-white rounded-xl shadow p-6 border border-gray-100">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-900">Current Session RBAC</h2>
            <button
              type="button"
              class="text-sm text-primary-700 hover:underline"
              @click="refreshAccess"
            >
              Refresh
            </button>
          </div>

          <div class="mt-4">
            <p class="text-xs uppercase tracking-wide text-gray-500 mb-2">Roles</p>
            <ul class="space-y-2">
              <li
                v-for="role in accessStore.roles"
                :key="role"
                class="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2"
              >
                {{ role }}
              </li>
            </ul>
          </div>

          <div class="mt-4">
            <p class="text-xs uppercase tracking-wide text-gray-500 mb-2">Capabilities</p>
            <ul class="max-h-64 overflow-y-auto space-y-1">
              <li
                v-for="capability in accessStore.capabilities"
                :key="capability"
                class="rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-700 font-mono"
              >
                {{ capability }}
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppLayout from '@/components/layout/AppLayout.vue';
import AppBreadcrumbs from '@/components/common/AppBreadcrumbs.vue';
import { createTenant, searchScopedUsers } from '@/services/platformAdmin';
import { useAccessStore } from '@/stores/access';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const accessStore = useAccessStore();

const breadcrumbs = [
  { label: 'Dashboard', to: '/' },
  { label: 'Administration', to: '/admin' },
  { label: 'System Admin' },
];

const tenantName = ref('');
const tenantStatus = ref('active');
const billingAccountName = ref('');
const assignTenantAdminUserId = ref('');
const reason = ref('manual-tenant-provisioning');
const tenantAdminLookupQuery = ref('');
const tenantAdminLookupResults = ref<Array<{ id: string; email: string; firstName: string; lastName: string }>>([]);

const isSubmitting = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

const extractErrorMessage = (err: any): string =>
  err?.response?.data?.message
  || err?.response?.data?.error
  || err?.message
  || 'Request failed';

const refreshAccess = async (): Promise<void> => {
  await accessStore.refresh({ tenantId: authStore.user?.householdId });
};


const handleLookupTenantAdmin = async (): Promise<void> => {
  errorMessage.value = '';
  try {
    const query = tenantAdminLookupQuery.value.trim();
    if (query.length < 2) {
      errorMessage.value = 'User lookup query must be at least 2 characters.';
      return;
    }
    const users = await searchScopedUsers({ query, limit: 10 });
    tenantAdminLookupResults.value = users;
  } catch (err: any) {
    errorMessage.value = extractErrorMessage(err);
  }
};

const handleCreateTenant = async (): Promise<void> => {
  successMessage.value = '';
  errorMessage.value = '';
  isSubmitting.value = true;

  try {
    const maybeAdminUserId = assignTenantAdminUserId.value.trim();
    const payload = {
      name: tenantName.value.trim(),
      status: tenantStatus.value,
      billingAccountName: billingAccountName.value.trim() || undefined,
      assignTenantAdminUserId: maybeAdminUserId || undefined,
      reason: reason.value.trim(),
    };

    const response = await createTenant(payload);
    const tenant = response.tenant as { id?: string; name?: string } | undefined;
    successMessage.value = tenant?.id
      ? `Tenant created: ${tenant.name || payload.name} (${tenant.id})`
      : 'Tenant created successfully';
    tenantName.value = '';
    billingAccountName.value = '';
    assignTenantAdminUserId.value = '';
  } catch (err: any) {
    errorMessage.value = extractErrorMessage(err);
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(() => {
  void refreshAccess();
});
</script>
