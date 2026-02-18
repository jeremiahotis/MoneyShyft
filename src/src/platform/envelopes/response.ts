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
  refusalType?: 'business' | 'client' | 'security';
  httpStatus?: number;
};

type SystemErrorEnvelopeParams = {
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
  refusalType: 'business' | 'client' | 'security';
  correlationId: string | null;
  tenantId: string | null;
  data?: unknown;
};

export type SystemErrorEnvelopePayload = {
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
  | SystemErrorEnvelopePayload;

const resolveContext = (res: Response): EnvelopeContext => {
  const locals = res.locals as ResponseLocalsEnvelope;
  const envelope = locals.responseEnvelope;

  return {
    correlationId: envelope?.correlationId ?? null,
    tenantId: envelope?.tenantId ?? null
  };
};

export const buildSuccessEnvelope = (
  context: EnvelopeContext,
  { code, message, data }: Omit<SuccessEnvelopeParams, 'httpStatus'>
): SuccessEnvelopePayload => ({
  ok: true,
  code,
  message,
  correlationId: context.correlationId,
  tenantId: context.tenantId,
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
  tenantId: context.tenantId,
  ...(data !== undefined ? { data } : {})
});

export const buildSystemErrorEnvelope = (
  context: EnvelopeContext,
  { code, message, data }: Omit<SystemErrorEnvelopeParams, 'httpStatus'>
): SystemErrorEnvelopePayload => ({
  ok: false,
  code,
  message,
  errorType: 'system',
  correlationId: context.correlationId,
  tenantId: context.tenantId,
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

export const systemError = (
  res: Response,
  { httpStatus = 500, ...params }: SystemErrorEnvelopeParams
): Response => {
  const context = resolveContext(res);
  const payload = buildSystemErrorEnvelope(context, params);
  return res.status(httpStatus).json(payload);
};
