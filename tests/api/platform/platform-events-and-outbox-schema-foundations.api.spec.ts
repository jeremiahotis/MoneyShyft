import { test, expect } from '@playwright/test';
import { apiRequest } from '../../support/helpers/apiClient';
import {
  createEventSchemaExpectation,
  createOperationalIndexExpectations,
  createOutboxSchemaExpectation,
  createPlatformContractHeaders,
} from '../../support/factories/platformEventOutboxFactory';

test.describe('Story 0.6 atdd - platform events and outbox schema foundations API coverage', () => {
  test('returns canonical platform.events lineage schema contract @P0', async ({
    request,
  }) => {
    // Given platform lineage schema expectations for canonical event storage
    const headers = createPlatformContractHeaders({
      tenantId: 'tenant-platform-events-schema',
      correlationId: 'corr-platform-events-schema',
    });
    const eventSchemaExpectation = createEventSchemaExpectation();

    // When the events schema contract endpoint is called
    const response = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/platform/_kernel/contracts/events/schema',
      headers,
    });

    // Then the response should expose required lineage fields
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      table: eventSchemaExpectation.tableName,
      requiredLineageFields: eventSchemaExpectation.requiredLineageFields,
    });
  });

  test('returns canonical platform.outbox_events delivery schema contract @P0', async ({
    request,
  }) => {
    // Given outbox delivery schema expectations for integration-safe replay
    const headers = createPlatformContractHeaders({
      tenantId: 'tenant-platform-outbox-schema',
      correlationId: 'corr-platform-outbox-schema',
    });
    const outboxSchemaExpectation = createOutboxSchemaExpectation();

    // When the outbox schema contract endpoint is called
    const response = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/platform/_kernel/contracts/outbox/schema',
      headers,
    });

    // Then the response should expose required delivery and lineage fields
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      table: outboxSchemaExpectation.tableName,
      requiredDeliveryFields: outboxSchemaExpectation.requiredDeliveryFields,
    });
  });

  test(
    'returns operational and replay index contract metadata for events/outbox @P1',
    async ({
    request,
  }) => {
    // Given required index expectations for operational and replay queries
    const headers = createPlatformContractHeaders({
      tenantId: 'tenant-platform-indexes',
      correlationId: 'corr-platform-indexes',
    });
    const indexExpectations = createOperationalIndexExpectations();

    // When the index contract endpoint is called
    const response = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/platform/_kernel/contracts/events-outbox/indexes',
      headers,
    });

    // Then index definitions should include canonical operational and replay index names
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      events: indexExpectations.eventsIndexes,
      outbox: indexExpectations.outboxIndexes,
    });
  });

  test(
    'exposes replay cursor semantics for pending outbox delivery queries @P1',
    async ({
    request,
  }) => {
    // Given a replay query contract requiring status + available_at cursor semantics
    const headers = createPlatformContractHeaders({
      tenantId: 'tenant-platform-replay',
      correlationId: 'corr-platform-replay',
    });

    // When the replay contract endpoint is called
    const response = await apiRequest(request, {
      method: 'GET',
      path: '/api/v1/platform/_kernel/contracts/outbox/replay-query',
      headers,
    });

    // Then replay contract metadata should expose deterministic pagination/query keys
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      table: 'platform.outbox_events',
      queryKeys: ['delivery_status', 'available_at', 'outbox_event_id'],
      defaultOrder: ['available_at ASC', 'outbox_event_id ASC'],
    });
  });

  test(
    'keeps tenant/correlation metadata stable across schema and replay endpoints @P1',
    async ({ request }) => {
      // Given one request context used across all contract endpoints
      const headers = createPlatformContractHeaders({
        tenantId: 'tenant-platform-correlation',
        correlationId: 'corr-platform-correlation',
      });

      // When schema/index/replay contracts are requested
      const eventsSchemaResponse = await apiRequest(request, {
        method: 'GET',
        path: '/api/v1/platform/_kernel/contracts/events/schema',
        headers,
      });
      const indexesResponse = await apiRequest(request, {
        method: 'GET',
        path: '/api/v1/platform/_kernel/contracts/events-outbox/indexes',
        headers,
      });
      const replayResponse = await apiRequest(request, {
        method: 'GET',
        path: '/api/v1/platform/_kernel/contracts/outbox/replay-query',
        headers,
      });

      // Then each response should echo the same tenancy + correlation context
      expect(eventsSchemaResponse.status()).toBe(200);
      expect(indexesResponse.status()).toBe(200);
      expect(replayResponse.status()).toBe(200);

      const eventsBody = await eventsSchemaResponse.json();
      const indexesBody = await indexesResponse.json();
      const replayBody = await replayResponse.json();

      expect(eventsBody.tenantId).toBe(headers['x-tenant-id']);
      expect(eventsBody.correlationId).toBe(headers['x-correlation-id']);
      expect(indexesBody.tenantId).toBe(headers['x-tenant-id']);
      expect(indexesBody.correlationId).toBe(headers['x-correlation-id']);
      expect(replayBody.tenantId).toBe(headers['x-tenant-id']);
      expect(replayBody.correlationId).toBe(headers['x-correlation-id']);
    },
  );

  test(
    'publishes deterministic index sets without duplicates for operator adapters @P2',
    async ({ request }) => {
      // Given expected operational/replay index names
      const headers = createPlatformContractHeaders({
        tenantId: 'tenant-platform-index-determinism',
        correlationId: 'corr-platform-index-determinism',
      });
      const indexExpectations = createOperationalIndexExpectations();

      // When the index contract endpoint is called
      const response = await apiRequest(request, {
        method: 'GET',
        path: '/api/v1/platform/_kernel/contracts/events-outbox/indexes',
        headers,
      });

      // Then index arrays should be deterministic and duplicate-free
      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body.events).toEqual(indexExpectations.eventsIndexes);
      expect(body.outbox).toEqual(indexExpectations.outboxIndexes);
      expect(new Set(body.events).size).toBe(body.events.length);
      expect(new Set(body.outbox).size).toBe(body.outbox.length);
      expect(body.events.every((idx: string) => idx.endsWith('_idx'))).toBe(true);
      expect(body.outbox.every((idx: string) => idx.endsWith('_idx'))).toBe(true);
    },
  );
});
