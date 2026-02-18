import { test, expect } from '@playwright/test';
import { apiRequest } from '../../support/helpers/apiClient';
import {
  createAtomicMutationProbe,
  createMissingWriteProbe,
  createMutationWrapperHeaders,
} from '../../support/factories/mutationTransactionWrapperFactory';

test.describe('Story 0.7 atdd - mutation wrapper with mandatory event/outbox API coverage', () => {
  test('enforces atomic domain write plus event and outbox persistence contract @P0', async ({
    request,
  }) => {
    // Given a valid mutation bundle that contains domain, event, and outbox writes
    const headers = createMutationWrapperHeaders({
      tenantId: 'tenant-mutation-atomic',
      correlationId: 'corr-mutation-atomic',
    });
    const atomicProbe = createAtomicMutationProbe();

    // When mutation wrapper contract endpoint is called
    const response = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/contracts/mutation/transaction-wrapper/atomic',
      headers,
      data: atomicProbe.payload,
    });

    // Then wrapper should report a single atomic commit across all required writes
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      code: atomicProbe.expected.code,
      atomic: true,
      eventOutboxRequired: atomicProbe.expected.eventOutboxRequired,
      missingWrites: atomicProbe.expected.missingWrites,
      correlationId: headers['x-correlation-id'],
      tenantId: headers['x-tenant-id'],
    });
  });

  test('returns business refusal when event write is missing from mutation transaction @P0', async ({
    request,
  }) => {
    // Given a mutation payload that omits event persistence
    const headers = createMutationWrapperHeaders({
      tenantId: 'tenant-mutation-missing-event',
      correlationId: 'corr-mutation-missing-event',
    });
    const missingEventProbe = createMissingWriteProbe({ missingWrite: 'event' });

    // When mutation wrapper contract endpoint validates required writes
    const response = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/contracts/mutation/transaction-wrapper/validate-required-writes',
      headers,
      data: missingEventProbe.payload,
    });

    // Then contract should refuse the mutation using canonical refusal envelope semantics
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      code: missingEventProbe.expected.code,
      message: missingEventProbe.expected.message,
      refusalType: missingEventProbe.expected.refusalType,
      missingWrites: missingEventProbe.expected.missingWrites,
      correlationId: headers['x-correlation-id'],
      tenantId: headers['x-tenant-id'],
    });
  });

  test('returns business refusal when outbox write is missing from mutation transaction @P0', async ({
    request,
  }) => {
    // Given a mutation payload that omits outbox persistence
    const headers = createMutationWrapperHeaders({
      tenantId: 'tenant-mutation-missing-outbox',
      correlationId: 'corr-mutation-missing-outbox',
    });
    const missingOutboxProbe = createMissingWriteProbe({ missingWrite: 'outbox' });

    // When mutation wrapper contract endpoint validates required writes
    const response = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/contracts/mutation/transaction-wrapper/validate-required-writes',
      headers,
      data: missingOutboxProbe.payload,
    });

    // Then contract should refuse partial writes and identify missing outbox requirement
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      code: missingOutboxProbe.expected.code,
      message: missingOutboxProbe.expected.message,
      refusalType: missingOutboxProbe.expected.refusalType,
      missingWrites: missingOutboxProbe.expected.missingWrites,
      correlationId: headers['x-correlation-id'],
      tenantId: headers['x-tenant-id'],
    });
  });

  test('returns business refusal when both event and outbox writes are missing @P1', async ({
    request,
  }) => {
    // Given a mutation payload that omits both event and outbox persistence
    const headers = createMutationWrapperHeaders({
      tenantId: 'tenant-mutation-missing-both',
      correlationId: 'corr-mutation-missing-both',
    });
    const missingBothProbe = createMissingWriteProbe({ missingWrite: 'both' });

    // When mutation wrapper contract validates required writes
    const response = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/contracts/mutation/transaction-wrapper/validate-required-writes',
      headers,
      data: missingBothProbe.payload,
    });

    // Then refusal must include both missing categories without partial acceptance
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      code: missingBothProbe.expected.code,
      message: missingBothProbe.expected.message,
      refusalType: missingBothProbe.expected.refusalType,
      missingWrites: missingBothProbe.expected.missingWrites,
      correlationId: headers['x-correlation-id'],
      tenantId: headers['x-tenant-id'],
    });
  });

  test('guarantees refusal path reports no commit when required writes are missing @P1', async ({
    request,
  }) => {
    // Given two invalid mutation payloads (missing event vs missing outbox)
    const headers = createMutationWrapperHeaders({
      tenantId: 'tenant-mutation-no-partial-commit',
      correlationId: 'corr-mutation-no-partial-commit',
    });
    const missingEventProbe = createMissingWriteProbe({ missingWrite: 'event' });
    const missingOutboxProbe = createMissingWriteProbe({ missingWrite: 'outbox' });

    // When validation endpoint is called for each invalid payload
    const missingEventResponse = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/contracts/mutation/transaction-wrapper/validate-required-writes',
      headers,
      data: missingEventProbe.payload,
    });
    const missingOutboxResponse = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/contracts/mutation/transaction-wrapper/validate-required-writes',
      headers,
      data: missingOutboxProbe.payload,
    });

    // Then neither response should indicate committed writes
    expect(missingEventResponse.status()).toBe(200);
    expect(missingOutboxResponse.status()).toBe(200);

    const missingEventBody = await missingEventResponse.json();
    const missingOutboxBody = await missingOutboxResponse.json();

    expect(missingEventBody).toMatchObject({
      ok: false,
      transaction: {
        committed: false,
      },
    });
    expect(missingOutboxBody).toMatchObject({
      ok: false,
      transaction: {
        committed: false,
      },
    });
  });

  test('preserves tenant and correlation metadata across atomic and refusal contracts @P1', async ({
    request,
  }) => {
    // Given a stable tenant and correlation context reused across contract probes
    const headers = createMutationWrapperHeaders({
      tenantId: 'tenant-mutation-metadata-stability',
      correlationId: 'corr-mutation-metadata-stability',
    });
    const atomicProbe = createAtomicMutationProbe();
    const missingEventProbe = createMissingWriteProbe({ missingWrite: 'event' });

    // When atomic and refusal probes are executed under the same context
    const atomicResponse = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/contracts/mutation/transaction-wrapper/atomic',
      headers,
      data: atomicProbe.payload,
    });
    const refusalResponse = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/contracts/mutation/transaction-wrapper/validate-required-writes',
      headers,
      data: missingEventProbe.payload,
    });

    // Then both envelopes should preserve tenant and correlation identity
    expect(atomicResponse.status()).toBe(200);
    expect(refusalResponse.status()).toBe(200);

    const atomicBody = await atomicResponse.json();
    const refusalBody = await refusalResponse.json();

    expect(atomicBody.correlationId).toBe(headers['x-correlation-id']);
    expect(refusalBody.correlationId).toBe(headers['x-correlation-id']);
    expect(atomicBody.tenantId).toBe(headers['x-tenant-id']);
    expect(refusalBody.tenantId).toBe(headers['x-tenant-id']);
  });
});
