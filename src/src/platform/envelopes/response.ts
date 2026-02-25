import { Response } from 'express';

export type EnvelopeContext = {
  correlationId: string | null;
  tenantId: string | null;
};

type SuccessEnvelopeParams = {
  code: string;
  message: string;
  data?: unknown;
  httpStatus?: number;
};

type RefusalEnvelopeParams = {
  code: string;
  message: string;
  data?: unknown;
  refusalType?: 'business' | 'client' | 'security' | 'validation';
  httpStatus?: number;
};

type ErrorEnvelopeParams = {
  code: string;
  message: string;
  data?: unknown;
  httpStatus?: number;
};

type ResponseLocalsEnvelope = {
  responseEnvelope?: EnvelopeContext;
};

export type SuccessEnvelopePayload = {
  ok: true;
  code: string;
  message: string;
  correlationId: string | null;
  tenantId: string | null;
  data?: unknown;
};

export type RefusalEnvelopePayload = {
  ok: false;
  code: string;
  message: string;
  refusalType: 'business' | 'client' | 'security' | 'validation';
  correlationId: string | null;
  tenantId: string | null;
  data?: unknown;
};

export type ErrorEnvelopePayload = {
  ok: false;
  code: string;
  message: string;
  errorType: 'system';
  correlationId: string | null;
  tenantId: string | null;
  data?: unknown;
};

export type ApiEnvelopePayload =
  | SuccessEnvelopePayload
  | RefusalEnvelopePayload
  | ErrorEnvelopePayload;

const resolveContext = (res: Response): EnvelopeContext => {
  const locals = res.locals as ResponseLocalsEnvelope;
  const envelope = locals.responseEnvelope;
  const normalizedTenant = typeof envelope?.tenantId === 'string'
    ? envelope.tenantId.trim()
    : null;
  const tenantId = normalizedTenant && normalizedTenant.toLowerCase() !== 'public'
    ? normalizedTenant
    : null;

  return {
    correlationId: envelope?.correlationId ?? null,
    tenantId
  };
};

const normalizeEnvelopeTenant = (tenantId: string | null | undefined): string | null => {
  if (typeof tenantId !== 'string') {
    return null;
  }

  const trimmed = tenantId.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'public') {
    return null;
  }

  return trimmed;
};

export const buildSuccessEnvelope = (
  context: EnvelopeContext,
  { code, message, data }: Omit<SuccessEnvelopeParams, 'httpStatus'>
): SuccessEnvelopePayload => ({
  ok: true,
  code,
  message,
  correlationId: context.correlationId,
  tenantId: normalizeEnvelopeTenant(context.tenantId),
  ...(data !== undefined ? { data } : {})
});

export const buildRefusalEnvelope = (
  context: EnvelopeContext,
  {
    code,
    message,
    data,
    refusalType = 'business'
  }: Omit<RefusalEnvelopeParams, 'httpStatus'>
): RefusalEnvelopePayload => ({
  ok: false,
  code,
  message,
  refusalType,
  correlationId: context.correlationId,
  tenantId: normalizeEnvelopeTenant(context.tenantId),
  ...(data !== undefined ? { data } : {})
});

export const buildErrorEnvelope = (
  context: EnvelopeContext,
  { code, message, data }: Omit<ErrorEnvelopeParams, 'httpStatus'>
): ErrorEnvelopePayload => ({
  ok: false,
  code,
  message,
  errorType: 'system',
  correlationId: context.correlationId,
  tenantId: normalizeEnvelopeTenant(context.tenantId),
  ...(data !== undefined ? { data } : {})
});

export const isEnvelopePayload = (value: unknown): value is ApiEnvelopePayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.ok === 'boolean'
    && typeof candidate.code === 'string'
    && typeof candidate.message === 'string'
    && 'correlationId' in candidate
    && 'tenantId' in candidate;
};

export const success = (
  res: Response,
  { httpStatus = 200, ...params }: SuccessEnvelopeParams
): Response => {
  const context = resolveContext(res);
  const payload = buildSuccessEnvelope(context, params);
  return res.status(httpStatus).json(payload);
};

export const refusal = (
  res: Response,
  { httpStatus = 200, ...params }: RefusalEnvelopeParams
): Response => {
  const context = resolveContext(res);
  const payload = buildRefusalEnvelope(context, params);
  return res.status(httpStatus).json(payload);
};

export const error = (
  res: Response,
  { httpStatus = 500, ...params }: ErrorEnvelopeParams
): Response => {
  const context = resolveContext(res);
  const payload = buildErrorEnvelope(context, params);
  return res.status(httpStatus).json(payload);
};

// Backward compatibility alias for legacy imports.
export const systemError = error;

export const replayEnvelope = (
  res: Response,
  payload: unknown,
  httpStatus = 200
): Response => res.status(httpStatus).send(payload);
