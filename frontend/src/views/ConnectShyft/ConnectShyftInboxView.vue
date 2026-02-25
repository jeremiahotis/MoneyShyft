<template>
  <main class="min-h-screen bg-slate-50 px-4 py-8">
    <section class="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <header class="mb-6">
        <h1 v-if="showUnavailableState" class="text-2xl font-semibold text-slate-900">
          ConnectShyft unavailable
        </h1>
        <h1 v-else class="text-2xl font-semibold text-slate-900">
          ConnectShyft Inbox
        </h1>

        <p
          v-if="showUnavailableState"
          data-testid="connectshyft-unavailable-state"
          class="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {{ unavailableMessage }}
        </p>
      </header>

      <section class="mb-6 rounded-md border border-slate-200 p-4">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Capability Status
        </h2>
        <dl class="grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-3">
          <div class="rounded border border-slate-200 p-3">
            <dt>Inbox</dt>
            <dd
              data-testid="connectshyft-capability-inbox"
              class="mt-1 font-medium"
            >
              {{ inboxAvailable ? 'Available' : 'Unavailable' }}
            </dd>
          </div>
          <div class="rounded border border-slate-200 p-3">
            <dt>Escalation</dt>
            <dd
              data-testid="connectshyft-capability-escalation"
              class="mt-1 font-medium"
            >
              {{ escalationAvailable ? 'Available' : 'Unavailable' }}
            </dd>
          </div>
          <div class="rounded border border-slate-200 p-3">
            <dt>Webhooks</dt>
            <dd
              data-testid="connectshyft-capability-webhooks"
              class="mt-1 font-medium"
            >
              {{ webhooksAvailable ? 'Available' : 'Unavailable' }}
            </dd>
          </div>
        </dl>
      </section>

      <p
        v-if="maintenanceBanner"
        data-testid="connectshyft-capability-maintenance-banner"
        class="mb-6 rounded-md border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700"
      >
        {{ maintenanceBanner }}
      </p>

      <section
        v-if="inboxAvailable"
        data-testid="connectshyft-inbox-list"
        class="rounded-md border border-slate-200 p-4"
      >
        <h2 class="mb-3 text-base font-semibold text-slate-900">Open threads</h2>

        <p
          v-if="threadEnsureRefusalMessage"
          data-testid="connectshyft-inbox-refusal-banner"
          class="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {{ threadEnsureRefusalMessage }}
        </p>

        <div class="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            :disabled="openConversationDisabled"
            class="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            @click="openConversation"
          >
            Open Conversation
          </button>
          <p class="text-xs text-slate-600">
            Ensures a single active thread per neighbor context.
          </p>
        </div>

        <article
          v-if="ensuredThread"
          data-testid="connectshyft-thread-card"
          class="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900"
        >
          <p class="font-semibold">Active thread ready</p>
          <p class="mt-1">
            Thread ID:
            <span data-testid="connectshyft-thread-id-chip" class="font-mono">
              {{ ensuredThread.threadId }}
            </span>
          </p>
          <p class="mt-1">
            State:
            <span data-testid="connectshyft-thread-state-chip" class="font-semibold">
              {{ ensuredThread.state }}
            </span>
          </p>
        </article>

        <ul class="mb-4 space-y-2 text-sm text-slate-700">
          <li class="rounded border border-slate-200 px-3 py-2">
            thread-a-1001 · Operator follow-up required
          </li>
          <li class="rounded border border-slate-200 px-3 py-2">
            thread-a-1002 · Pending escalation review
          </li>
        </ul>

        <section class="mb-4 rounded border border-slate-200 bg-slate-50 p-3">
          <h3 class="text-sm font-semibold text-slate-900">Shared identity context</h3>
          <p class="mt-1 text-xs text-slate-600">
            Shared-phone indicators remain consistent across orgUnits in this tenant.
          </p>

          <p
            v-if="neighborLoadError"
            class="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            {{ neighborLoadError }}
          </p>

          <ul v-else class="mt-3 space-y-2 text-xs text-slate-700">
            <li
              v-for="neighbor in neighbors"
              :key="neighbor.neighborId"
              class="rounded border border-slate-200 bg-white px-3 py-2"
            >
              <p class="font-medium text-slate-900">
                {{ neighbor.firstName || 'Neighbor' }} {{ neighbor.lastName }}
              </p>
              <div class="mt-1 flex flex-wrap gap-2">
                <span
                  v-for="phone in neighbor.phones"
                  :key="`${neighbor.neighborId}-${phone.phoneId}`"
                  data-testid="connectshyft-inbox-shared-phone-indicator"
                  class="rounded px-2 py-1 text-[11px] font-medium"
                  :class="phone.isShared ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'"
                >
                  {{ phone.label }} · {{ phone.isShared ? 'Shared' : 'Not shared' }}
                </span>
              </div>
            </li>
          </ul>
        </section>

        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            class="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Compose message
          </button>
          <button
            type="button"
            :disabled="!escalationAvailable"
            class="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Claim thread
          </button>
          <button
            type="button"
            :disabled="!escalationAvailable"
            class="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Take over thread
          </button>
        </div>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  DEFAULT_CONNECTSHYFT_AVAILABILITY,
  fetchConnectShyftAvailability,
} from '@/features/connectshyft/flags';
import {
  fetchConnectShyftNeighborsCollection,
  type ConnectShyftNeighbor,
} from '@/features/connectshyft/neighbors';
import {
  ensureConnectShyftThread,
  type ConnectShyftEnsuredThread,
} from '@/features/connectshyft/threads';

const availability = ref({ ...DEFAULT_CONNECTSHYFT_AVAILABILITY });
const neighbors = ref<ConnectShyftNeighbor[]>([]);
const neighborLoadError = ref('');
const ensuredThread = ref<ConnectShyftEnsuredThread | null>(null);
const threadEnsureRefusalMessage = ref('');
const ensuringThread = ref(false);

const parseInboxContext = (): {
  role: string;
  orgUnitId: string;
  orgUnitMemberships: string[];
} => {
  if (typeof window === 'undefined') {
    return {
      role: '',
      orgUnitId: '',
      orgUnitMemberships: [],
    };
  }

  const searchParams = new URLSearchParams(window.location.search);
  const role = (searchParams.get('tenantRole') || searchParams.get('role') || '').trim().toUpperCase();
  const orgUnitId = (searchParams.get('orgUnitId') || '').trim();
  const orgUnitMemberships = (searchParams.get('orgUnitMemberships') || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return {
    role,
    orgUnitId,
    orgUnitMemberships,
  };
};

const inboxContext = parseInboxContext();

onMounted(async () => {
  availability.value = await fetchConnectShyftAvailability();
  if (!availability.value.capabilities.inbox) {
    neighbors.value = [];
    neighborLoadError.value = '';
    return;
  }

  if (!canOpenConversation.value) {
    threadEnsureRefusalMessage.value = 'You do not have permission to open this conversation.';
  }

  const listResult = await fetchConnectShyftNeighborsCollection();
  if (!listResult.ok) {
    neighbors.value = [];
    neighborLoadError.value = listResult.message;
    return;
  }

  neighbors.value = listResult.neighbors;
  neighborLoadError.value = '';
});

const moduleAvailable = computed(() => availability.value.capabilities.module);
const inboxAvailable = computed(() => availability.value.capabilities.inbox);
const escalationAvailable = computed(() => availability.value.capabilities.escalation);
const webhooksAvailable = computed(() => availability.value.capabilities.webhooks);

const showUnavailableState = computed(() => !moduleAvailable.value || !inboxAvailable.value);

const unavailableMessage = computed(() => {
  if (availability.value.refusal?.message) {
    return availability.value.refusal.message;
  }

  if (!moduleAvailable.value) {
    if (availability.value.entitlement && availability.value.entitlement.enabled === false) {
      return 'ConnectShyft module entitlement is disabled for this tenant.';
    }

    return 'ConnectShyft is currently unavailable for this tenant. Enable connectshyft_enabled to access this module.';
  }

  return 'ConnectShyft inbox is currently unavailable for this tenant.';
});

const maintenanceBanner = computed(() => {
  if (!moduleAvailable.value || !inboxAvailable.value) {
    return '';
  }

  if (!escalationAvailable.value) {
    return 'Escalation controls are temporarily unavailable for this tenant.';
  }

  return '';
});

const canOpenConversation = computed(() => {
  if (!inboxAvailable.value) {
    return false;
  }

  if (
    inboxContext.role !== 'ORGUNIT_ADMIN'
    && inboxContext.role !== 'ORGUNIT_MEMBER'
    && inboxContext.role !== 'ORGUNIT_IDENTITY_LEAD'
  ) {
    return false;
  }

  if (!inboxContext.orgUnitId) {
    return false;
  }

  return inboxContext.orgUnitMemberships.includes(inboxContext.orgUnitId);
});

const openConversationDisabled = computed(() =>
  !canOpenConversation.value || ensuringThread.value || !inboxAvailable.value);

const targetNeighborId = computed(() => {
  if (neighbors.value.length > 0) {
    return neighbors.value[0].neighborId;
  }

  return 'neighbor-connectshyft-c2-1001';
});

const openConversation = async (): Promise<void> => {
  if (!canOpenConversation.value || !inboxContext.orgUnitId) {
    threadEnsureRefusalMessage.value = 'You do not have permission to open this conversation.';
    return;
  }

  ensuringThread.value = true;
  threadEnsureRefusalMessage.value = '';

  const result = await ensureConnectShyftThread({
    orgUnitId: inboxContext.orgUnitId,
    neighborId: targetNeighborId.value,
    source: 'VOICE',
  });

  if (!result.ok) {
    ensuredThread.value = null;
    threadEnsureRefusalMessage.value = result.message;
    ensuringThread.value = false;
    return;
  }

  ensuredThread.value = result.thread;
  ensuringThread.value = false;
};
</script>
