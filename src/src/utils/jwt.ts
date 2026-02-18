import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { CookieOptions, Response } from 'express';

export interface JWTPayload {
  userId: string;
  email: string;
  householdId: string | null;
  role: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_change_in_production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your_refresh_secret_change_in_production';

// Session duration constants
const SHORT_SESSION_ACCESS = '2h';
const SHORT_SESSION_REFRESH = '7d';
const EXTENDED_SESSION_ACCESS = '7d';  // Extended access token
const EXTENDED_SESSION_REFRESH = '30d'; // Extended refresh token

type CookiePolicy = {
  authCookie: CookieOptions;
  csrfCookie: CookieOptions;
};

const resolveCookieDomain = (): string | undefined => {
  const configuredDomain = process.env.COOKIE_DOMAIN?.trim();
  if (!configuredDomain) {
    return undefined;
  }

  return configuredDomain.startsWith('.') ? configuredDomain : `.${configuredDomain}`;
};

const getCookiePolicy = (): CookiePolicy => {
  const isProduction = process.env.NODE_ENV === 'production';
  const domain = isProduction ? resolveCookieDomain() : undefined;

  const authCookie: CookieOptions = {
    path: '/',
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  };

  const csrfCookie: CookieOptions = {
    path: '/',
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  };

  if (domain) {
    authCookie.domain = domain;
    csrfCookie.domain = domain;
  }

  return { authCookie, csrfCookie };
};

const generateCsrfToken = (): string => crypto.randomBytes(32).toString('hex');

/**
 * Generate access token (short-lived or extended based on rememberMe)
 */
export function generateAccessToken(payload: JWTPayload, rememberMe: boolean = false): string {
  const expiresIn = rememberMe ? EXTENDED_SESSION_ACCESS : SHORT_SESSION_ACCESS;
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * Generate refresh token (long-lived or extended based on rememberMe)
 */
export function generateRefreshToken(payload: JWTPayload, rememberMe: boolean = false): string {
  const expiresIn = rememberMe ? EXTENDED_SESSION_REFRESH : SHORT_SESSION_REFRESH;
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn,
    jwtid: crypto.randomUUID(),
  });
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
}

/**
 * Set auth cookies on response
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string, rememberMe: boolean = false): void {
  const { authCookie, csrfCookie } = getCookiePolicy();
  const csrfToken = generateCsrfToken();

  // Calculate maxAge based on rememberMe
  const accessMaxAge = rememberMe
    ? 7 * 24 * 60 * 60 * 1000  // 7 days in milliseconds
    : 2 * 60 * 60 * 1000;       // 2 hours in milliseconds

  const refreshMaxAge = rememberMe
    ? 30 * 24 * 60 * 60 * 1000  // 30 days in milliseconds
    : 7 * 24 * 60 * 60 * 1000;  // 7 days in milliseconds

  // Access token cookie (HTTP-only, secure in production)
  res.cookie('access_token', accessToken, {
    maxAge: accessMaxAge,
    ...authCookie,
  });

  // Refresh token cookie (HTTP-only, secure in production)
  res.cookie('refresh_token', refreshToken, {
    maxAge: refreshMaxAge,
    ...authCookie,
  });

  // CSRF cookie (readable by browser JS for double-submit validation)
  res.cookie('csrf_token', csrfToken, {
    maxAge: refreshMaxAge,
    ...csrfCookie,
  });
}

/**
 * Clear auth cookies
 */
export function clearAuthCookies(res: Response): void {
  const { authCookie, csrfCookie } = getCookiePolicy();

  res.clearCookie('access_token', { ...authCookie });
  res.clearCookie('refresh_token', { ...authCookie });
  res.clearCookie('csrf_token', { ...csrfCookie });
}
