<template>
  <AppLayout>
    <div class="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <AppBreadcrumbs :items="breadcrumbs" />

      <div class="bg-white rounded-xl shadow p-6 border border-gray-100">
        <h1 class="text-3xl font-bold text-gray-900" data-testid="tenant-admin-heading">Tenant Administration</h1>
        <p class="mt-2 text-gray-600">
          Manage orgUnits and role assignments inside your active tenant boundary.
        </p>
      </div>

      <div v-if="!accessStore.canAccessTenantAdmin" class="bg-red-50 border border-red-200 rounded-xl p-5">
        <h2 class="font-semibold text-red-800">Access denied</h2>
        <p class="text-red-700 mt-2">
          Your active role does not include tenant administration capabilities.
        </p>
      </div>

      <div v-else class="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section class="xl:col-span-2 space-y-6">
          <article class="bg-white rounded-xl shadow p-6 border border-gray-100">
            <h2 class="text-xl font-semibold text-gray-900">Create OrgUnit</h2>
            <p class="mt-1 text-sm text-gray-600">
              Create a new orgUnit in the current tenant and apply immediate RBAC effects.
            </p>

            <form class="mt-5 space-y-4" @submit.prevent="handleCreateOrgUnit">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label for="org-unit-name" class="block text-sm font-medium text-gray-700">OrgUnit Name</label>
                  <input
                    id="org-unit-name"
                    v-model="orgUnitName"
                    data-testid="org-unit-name-input"
                    type="text"
                    required
                    class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div>
                  <label for="org-unit-type" class="block text-sm font-medium text-gray-700">Type</label>
                  <input
                    id="org-unit-type"
                    v-model="orgUnitType"
                    type="text"
                    placeholder="operations"
                    class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div>
                <label for="org-unit-reason" class="block text-sm font-medium text-gray-700">Reason</label>
                <input
                  id="org-unit-reason"
                  v-model="orgUnitReason"
                  data-testid="org-unit-reason-input"
                  type="text"
                  required
                  class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <button
                type="submit"
                data-testid="org-unit-submit"
                :disabled="isSubmitting"
                class="inline-flex items-center justify-center rounded-lg bg-primary-600 px-5 py-2.5 text-white font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span v-if="isSubmitting">Saving...</span>
                <span v-else>Create OrgUnit</span>
              </button>
            </form>
          </article>

          <article class="bg-white rounded-xl shadow p-6 border border-gray-100">
            <h2 class="text-xl font-semibold text-gray-900">Create Tenant Admin User</h2>
            <p class="mt-1 text-sm text-gray-600">
              Create a new user directly in this tenant and assign an admin role.
            </p>

            <form class="mt-5 space-y-4" @submit.prevent="handleCreateTenantAdminUser">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700">First Name</label>
                  <input v-model="newAdminFirstName" type="text" required class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Last Name</label>
                  <input v-model="newAdminLastName" type="text" required class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Email</label>
                  <input v-model="newAdminEmail" type="email" required class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Temporary Password</label>
                  <input v-model="newAdminPassword" type="password" minlength="12" required class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" />
                </div>
              </div>
              <button type="submit" :disabled="isSubmitting" class="inline-flex items-center justify-center rounded-lg border border-primary-600 px-5 py-2.5 text-primary-700 font-medium hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed">
                Create Tenant Admin User
              </button>
            </form>
          </article>

          <article class="bg-white rounded-xl shadow p-6 border border-gray-100">
            <h2 class="text-xl font-semibold text-gray-900">Assign Tenant Role</h2>
            <p class="mt-1 text-sm text-gray-600">
              Grant or update tenant-level membership role sets.
            </p>

            <form class="mt-5 space-y-4" @submit.prevent="handleTenantRoleAssignment">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label for="tenant-role-user-id" class="block text-sm font-medium text-gray-700">User (lookup or UUID)</label>
                  <input
                    id="tenant-role-user-id"
                    v-model="tenantRoleUserId"
                    type="text"
                    required
                    class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                  <div class="mt-2 flex gap-2">
                    <input
                      v-model="tenantUserLookupQuery"
                      type="text"
                      placeholder="Search name/email"
                      class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <button type="button" class="px-3 py-2 border border-gray-300 rounded-lg text-sm" @click="handleTenantUserLookup">Search</button>
                  </div>
                  <select v-if="tenantUserLookupResults.length" v-model="tenantRoleUserId" class="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
                    <option value="">Select a user</option>
                    <option v-for="user in tenantUserLookupResults" :key="user.id" :value="user.id">
                      {{ user.firstName }} {{ user.lastName }} ({{ user.email }})
                    </option>
                  </select>
                </div>

                <div>
                  <label for="tenant-role-select" class="block text-sm font-medium text-gray-700">Role</label>
                  <select
                    id="tenant-role-select"
                    v-model="tenantRoleSelection"
                    class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option v-for="role in tenantRoleOptions" :key="role" :value="role">{{ role }}</option>
                  </select>
                </div>
              </div>

              <div>
                <label for="tenant-role-reason" class="block text-sm font-medium text-gray-700">Reason</label>
                <input
                  id="tenant-role-reason"
                  v-model="tenantRoleReason"
                  type="text"
                  required
                  class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <button
                type="submit"
                :disabled="isSubmitting"
                class="inline-flex items-center justify-center rounded-lg border border-primary-600 px-5 py-2.5 text-primary-700 font-medium hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Assign Tenant Role
              </button>
            </form>
          </article>

          <article class="bg-white rounded-xl shadow p-6 border border-gray-100">
            <h2 class="text-xl font-semibold text-gray-900">Assign OrgUnit Role</h2>
            <p class="mt-1 text-sm text-gray-600">
              Grant orgUnit-specific role sets for operational teams.
            </p>

            <form class="mt-5 space-y-4" @submit.prevent="handleOrgUnitRoleAssignment">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label for="org-role-org-unit-id" class="block text-sm font-medium text-gray-700">OrgUnit ID (UUID)</label>
                  <input
                    id="org-role-org-unit-id"
                    v-model="orgRoleOrgUnitId"
                    type="text"
                    required
                    class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <div>
                  <label for="org-role-user-id" class="block text-sm font-medium text-gray-700">User ID (UUID)</label>
                  <input
                    id="org-role-user-id"
                    v-model="orgRoleUserId"
                    type="text"
                    required
                    class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label for="org-role-select" class="block text-sm font-medium text-gray-700">Role</label>
                  <select
                    id="org-role-select"
                    v-model="orgRoleSelection"
                    class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option v-for="role in orgUnitRoleOptions" :key="role" :value="role">{{ role }}</option>
                  </select>
                </div>

                <div>
                  <label for="org-role-reason" class="block text-sm font-medium text-gray-700">Reason</label>
                  <input
                    id="org-role-reason"
                    v-model="orgRoleReason"
                    type="text"
                    required
                    class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                :disabled="isSubmitting"
                class="inline-flex items-center justify-center rounded-lg border border-primary-600 px-5 py-2.5 text-primary-700 font-medium hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Assign OrgUnit Role
              </button>
            </form>
          </article>
        </section>

        <aside class="space-y-6">
          <article class="bg-white rounded-xl shadow p-6 border border-gray-100">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-gray-900">RBAC Snapshot</h2>
              <button type="button" class="text-sm text-primary-700 hover:underline" @click="refreshAccess">
                Refresh
              </button>
            </div>

            <div class="mt-4">
              <p class="text-xs uppercase tracking-wide text-gray-500 mb-2">Current Roles</p>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="role in accessStore.roles"
                  :key="role"
                  class="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700"
                >
                  {{ role }}
                </span>
              </div>
            </div>

            <div class="mt-4">
              <p class="text-xs uppercase tracking-wide text-gray-500 mb-2">Current Capabilities</p>
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

            <div class="mt-4 border-t pt-4">
              <label for="org-unit-evaluate" class="block text-sm font-medium text-gray-700">Evaluate with OrgUnit ID (optional)</label>
              <input
                id="org-unit-evaluate"
                v-model="evaluationOrgUnitId"
                type="text"
                class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
              <button
                type="button"
                class="mt-3 inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                @click="refreshAccess"
              >
                Re-evaluate Session
              </button>
            </div>
          </article>

          <article class="bg-white rounded-xl shadow p-6 border border-gray-100">
            <h2 class="text-lg font-semibold text-gray-900">Role Matrix Quick Guide</h2>
            <p class="mt-1 text-sm text-gray-600">
              Use this to validate expected abilities while testing each role account.
            </p>

            <div class="mt-4 space-y-3">
              <div
                v-for="entry in roleMatrix"
                :key="entry.role"
                class="rounded-lg border border-gray-200 p-3"
              >
                <p class="text-sm font-semibold text-gray-900">{{ entry.role }}</p>
                <p class="text-xs text-gray-600 mt-1">{{ entry.summary }}</p>
              </div>
            </div>
          </article>
        </aside>
      </div>

      <div
        v-if="successMessage"
        class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800"
        data-testid="admin-form-success"
      >
        {{ successMessage }}
      </div>
      <div
        v-if="errorMessage"
        class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        data-testid="admin-form-error"
      >
        {{ errorMessage }}
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppLayout from '@/components/layout/AppLayout.vue';
import AppBreadcrumbs from '@/components/common/AppBreadcrumbs.vue';
import { createOrgUnit, upsertOrgUnitMembership, upsertTenantMembership, searchScopedUsers, createScopedAdminUser } from '@/services/platformAdmin';
import { useAccessStore } from '@/stores/access';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const accessStore = useAccessStore();

const breadcrumbs = [
  { label: 'Dashboard', to: '/' },
  { label: 'Administration', to: '/admin' },
  { label: 'Tenant Admin' },
];

const tenantRoleOptions = ['TENANT_ADMIN', 'TENANT_STAFF', 'TENANT_VIEWER'];
const orgUnitRoleOptions = ['ORGUNIT_ADMIN', 'ORGUNIT_MEMBER', 'ORGUNIT_IDENTITY_LEAD'];

const roleMatrix = [
  { role: 'SYSTEM_ADMIN', summary: 'Platform governance: tenant lifecycle and global admin delegation.' },
  { role: 'TENANT_ADMIN', summary: 'Tenant governance: orgUnits, tenant role assignment, module controls.' },
  { role: 'TENANT_STAFF', summary: 'Cross-orgUnit operational support without tenant governance writes.' },
  { role: 'TENANT_VIEWER', summary: 'Read-focused tenant visibility and analytics.' },
  { role: 'ORGUNIT_ADMIN', summary: 'OrgUnit management and operational leadership in assigned orgUnit scope.' },
  { role: 'ORGUNIT_MEMBER', summary: 'Execution role in assigned orgUnit operations.' },
  { role: 'ORGUNIT_IDENTITY_LEAD', summary: 'OrgUnit identity resolution/merge flows and related oversight.' },
];

const orgUnitName = ref('');
const orgUnitType = ref('operations');
const orgUnitReason = ref('manual-org-unit-create');

const tenantRoleUserId = ref('');
const tenantRoleSelection = ref('TENANT_STAFF');
const tenantRoleReason = ref('manual-tenant-role-assignment');
const tenantUserLookupQuery = ref('');
const tenantUserLookupResults = ref<Array<{ id: string; email: string; firstName: string; lastName: string }>>([]);

const newAdminFirstName = ref('');
const newAdminLastName = ref('');
const newAdminEmail = ref('');
const newAdminPassword = ref('');

const orgRoleOrgUnitId = ref('');
const orgRoleUserId = ref('');
const orgRoleSelection = ref('ORGUNIT_MEMBER');
const orgRoleReason = ref('manual-org-role-assignment');

const evaluationOrgUnitId = ref('');
const isSubmitting = ref(false);
const successMessage = ref('');
const errorMessage = ref('');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const extractErrorMessage = (err: any): string =>
  err?.response?.data?.message
  || err?.response?.data?.error
  || err?.message
  || 'Request failed';

const clearStatus = () => {
  successMessage.value = '';
  errorMessage.value = '';
};

const refreshAccess = async (): Promise<void> => {
  const tenantId = authStore.user?.householdId || undefined;
  const orgUnitId = evaluationOrgUnitId.value.trim() || undefined;

  if (orgUnitId && !UUID_PATTERN.test(orgUnitId)) {
    errorMessage.value = 'OrgUnit ID for evaluation must be a valid UUID.';
    return;
  }

  await accessStore.refresh({ tenantId, orgUnitId });

  if (accessStore.error) {
    errorMessage.value = accessStore.error;
  }
};

const handleCreateOrgUnit = async (): Promise<void> => {
  clearStatus();
  isSubmitting.value = true;

  try {
    const tenantId = authStore.user?.householdId || undefined;
    const response = await createOrgUnit({
      tenantId,
      name: orgUnitName.value.trim(),
      type: orgUnitType.value.trim() || undefined,
      reason: orgUnitReason.value.trim(),
    });
    const orgUnit = response.orgUnit as { id?: string; name?: string } | undefined;
    successMessage.value = orgUnit?.id
      ? `OrgUnit created: ${orgUnit.name || orgUnitName.value} (${orgUnit.id})`
      : 'OrgUnit created';
    orgUnitName.value = '';
    orgUnitReason.value = 'manual-org-unit-create';
    await refreshAccess();
  } catch (err: any) {
    errorMessage.value = extractErrorMessage(err);
  } finally {
    isSubmitting.value = false;
  }
};


const handleTenantUserLookup = async (): Promise<void> => {
  clearStatus();

  try {
    const query = tenantUserLookupQuery.value.trim();
    if (query.length < 2) {
      errorMessage.value = 'Lookup query must be at least 2 characters.';
      return;
    }

    const tenantId = authStore.user?.householdId || undefined;
    tenantUserLookupResults.value = await searchScopedUsers({ query, tenantId, limit: 10 });
  } catch (err: any) {
    errorMessage.value = extractErrorMessage(err);
  }
};

const handleCreateTenantAdminUser = async (): Promise<void> => {
  clearStatus();
  isSubmitting.value = true;

  try {
    const tenantId = authStore.user?.householdId || undefined;
    const created = await createScopedAdminUser({
      tenantId,
      email: newAdminEmail.value.trim(),
      password: newAdminPassword.value,
      firstName: newAdminFirstName.value.trim(),
      lastName: newAdminLastName.value.trim(),
      tenantRoleSet: ['TENANT_ADMIN'],
      reason: 'inline-tenant-admin-create',
    });

    const user = created.user as { email?: string } | undefined;
    successMessage.value = user?.email ? `Tenant admin user created: ${user.email}` : 'Tenant admin user created';
    newAdminFirstName.value = '';
    newAdminLastName.value = '';
    newAdminEmail.value = '';
    newAdminPassword.value = '';
    await refreshAccess();
  } catch (err: any) {
    errorMessage.value = extractErrorMessage(err);
  } finally {
    isSubmitting.value = false;
  }
};

const handleTenantRoleAssignment = async (): Promise<void> => {
  clearStatus();
  isSubmitting.value = true;

  try {
    const userId = tenantRoleUserId.value.trim();
    const tenantId = authStore.user?.householdId || undefined;
    await upsertTenantMembership({
      tenantId,
      userId,
      roleSet: [tenantRoleSelection.value],
      reason: tenantRoleReason.value.trim(),
    });
    successMessage.value = `Tenant role assigned: ${tenantRoleSelection.value}`;
    tenantRoleUserId.value = '';
    await refreshAccess();
  } catch (err: any) {
    errorMessage.value = extractErrorMessage(err);
  } finally {
    isSubmitting.value = false;
  }
};

const handleOrgUnitRoleAssignment = async (): Promise<void> => {
  clearStatus();
  isSubmitting.value = true;

  try {
    const orgUnitId = orgRoleOrgUnitId.value.trim();
    const userId = orgRoleUserId.value.trim();
    if (!UUID_PATTERN.test(orgUnitId)) {
      errorMessage.value = 'OrgUnit ID must be a valid UUID.';
      return;
    }

    const tenantId = authStore.user?.householdId || undefined;
    await upsertOrgUnitMembership({
      tenantId,
      orgUnitId,
      userId,
      roleSet: [orgRoleSelection.value],
      reason: orgRoleReason.value.trim(),
    });
    successMessage.value = `OrgUnit role assigned: ${orgRoleSelection.value}`;
    orgRoleUserId.value = '';
    await refreshAccess();
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
