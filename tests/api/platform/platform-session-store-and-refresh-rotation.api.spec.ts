import { test, expect } from '@playwright/test';
import { apiRequest } from '../../support/helpers/apiClient';
import {
  createRefreshIssuePayload,
  createRefreshRevokePayload,
  createRefreshRotatePayload,
  createSessionHeaders,
} from '../../support/factories/sessionRotationFactory';

test.describe('Story 0.3 ATDD RED - platform session store and refresh rotation API coverage', () => {
  test.skip('persists hashed refresh state with expiry and revocation metadata @P0', async ({ request }) => {
    // Given a valid tenant-authenticated context and refresh issue payload
    const headers = createSessionHeaders({ tenantId: 'tenant-session-alpha' });
    const payload = createRefreshIssuePayload({
      userId: 'user-session-alpha',
      refreshTokenId: 'rt-session-alpha',
    });

    // When the platform kernel issues a refresh session record
    const response = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/sessions/refresh/issue',
      headers,
      data: payload,
    });

    // Then platform.sessions should persist hashed refresh metadata and audit fields
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      session: {
        tenantId: 'tenant-session-alpha',
        userId: 'user-session-alpha',
        refreshTokenHash: expect.any(String),
        refreshTokenExpiresAt: expect.any(String),
        revokedAt: null,
      },
    });
    expect(body.session.refreshTokenHash).not.toContain('rt-session-alpha');
  });

  test.skip('rotates refresh sessions and revokes prior refresh state atomically @P0', async ({ request }) => {
    // Given an existing refresh session context
    const headers = createSessionHeaders({ tenantId: 'tenant-session-alpha' });
    const payload = createRefreshRotatePayload({
      sessionId: 'sess-rotation-alpha',
      presentedRefreshToken: 'refresh-old-alpha',
      replacementRefreshTokenId: 'refresh-new-alpha',
    });

    // When refresh rotation is requested
    const response = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/sessions/refresh/rotate',
      headers,
      data: payload,
    });

    // Then prior session token state is revoked and replacement metadata is persisted
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      rotated: {
        priorSessionId: 'sess-rotation-alpha',
        priorRevokedAt: expect.any(String),
        replacementSessionId: expect.any(String),
        replacementRefreshTokenHash: expect.any(String),
      },
    });
  });

  test.skip('rejects replayed refresh token attempts deterministically @P1', async ({ request }) => {
    // Given a replayed refresh token from an already-rotated session
    const headers = createSessionHeaders({ tenantId: 'tenant-session-alpha' });
    const payload = createRefreshRotatePayload({
      sessionId: 'sess-replay-alpha',
      presentedRefreshToken: 'refresh-replayed-alpha',
    });

    // When replayed refresh token is presented again
    const response = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/sessions/refresh/rotate',
      headers,
      data: payload,
    });

    // Then request is rejected with deterministic replay refusal semantics
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      code: 'REFRESH_TOKEN_REPLAY_DETECTED',
      refusalType: 'security',
    });
  });

  test.skip('rejects revoked refresh tokens across subsequent refresh attempts @P1', async ({ request }) => {
    // Given a refresh session has already been revoked
    const headers = createSessionHeaders({ tenantId: 'tenant-session-alpha' });
    const revokePayload = createRefreshRevokePayload({
      sessionId: 'sess-revoked-alpha',
      reason: 'replay-detected',
    });

    await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/sessions/refresh/revoke',
      headers,
      data: revokePayload,
    });

    const rotatePayload = createRefreshRotatePayload({
      sessionId: 'sess-revoked-alpha',
      presentedRefreshToken: 'refresh-revoked-alpha',
    });

    // When revoked refresh token is reused
    const response = await apiRequest(request, {
      method: 'POST',
      path: '/api/v1/platform/_kernel/sessions/refresh/rotate',
      headers,
      data: rotatePayload,
    });

    // Then platform kernel rejects token with revoked-token refusal code
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      code: 'REFRESH_TOKEN_REVOKED',
      refusalType: 'security',
    });
  });
});
