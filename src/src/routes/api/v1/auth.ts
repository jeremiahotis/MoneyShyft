import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import type { Knex } from 'knex';
import AuthService from '../../../services/AuthService';
import { setAuthCookies, clearAuthCookies, verifyRefreshToken, generateAccessToken, generateRefreshToken } from '../../../utils/jwt';
import { validateRequest } from '../../../middleware/validate';
import { signupSchema, loginSchema } from '../../../validators/auth.validators';
import { authenticateToken } from '../../../middleware/auth';
import logger from '../../../utils/logger';
import PlatformSessionStore from '../../../platform/sessions/PlatformSessionStore';
import { generateInvitationCode } from '../../../utils/invitationCode';
import { createRecommendedSections } from '../../../seeds/production/001_recommended_sections';
import { createRecommendedTags } from '../../../seeds/production/002_recommended_tags';

const router = Router();

const testEmail = process.env.TEST_EMAIL?.trim();
const testPassword = process.env.TEST_PASSWORD?.trim();
const isTestAuthHarnessEnabled = process.env.ENABLE_TEST_AUTH_HARNESS === 'true'
  && process.env.NODE_ENV !== 'production'
  && !!testEmail
  && !!testPassword;

const BCRYPT_ROUNDS = 12;
const getDb = (): Knex => {
  // Lazy-load to keep route module import-safe in unit tests that mock app wiring.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../../config/knex').default as Knex;
};

const canUseTestAuthCredentials = (email: string, password: string): boolean => {
  if (!isTestAuthHarnessEnabled || !testEmail || !testPassword) {
    return false;
  }

  return email.trim().toLowerCase() === testEmail.toLowerCase() && password === testPassword;
};

const generateUniqueInvitationCode = async (): Promise<string> => {
  const db = getDb();
  let attempts = 0;
  while (attempts < 100) {
    const code = generateInvitationCode();
    const existing = await db('households').where({ invitation_code: code }).first();
    if (!existing) {
      return code;
    }
    attempts += 1;
  }

  throw new Error('Failed to generate unique invitation code for test auth harness');
};

const createHarnessHousehold = async (): Promise<string> => {
  const db = getDb();
  return db.transaction(async (trx: Knex.Transaction) => {
    const invitationCode = await generateUniqueInvitationCode();
    const [household] = await trx('households')
      .insert({
        name: 'Test Household',
        invitation_code: invitationCode,
      })
      .returning('*');

    const [incomeSection] = await trx('category_sections')
      .insert({
        household_id: household.id,
        name: 'Income',
        type: 'flexible',
        sort_order: -1,
        is_system: true,
      })
      .returning('*');

    await trx('categories')
      .insert({
        household_id: household.id,
        section_id: incomeSection.id,
        name: 'Income',
        icon: '💰',
        color: '#10b981',
        sort_order: 0,
        is_system: true,
      });

    await createRecommendedSections(trx, household.id);
    await createRecommendedTags(trx, household.id);

    return household.id;
  });
};

const ensureHarnessUser = async (email: string, password: string): Promise<void> => {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const user = await db('users')
    .whereRaw('LOWER(email) = ?', [normalizedEmail])
    .first();

  if (!user) {
    await AuthService.signup({
      email: normalizedEmail,
      password,
      firstName: 'Test',
      lastName: 'User',
      householdName: 'Test Household',
    });
    return;
  }

  const updates: Record<string, unknown> = {};
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    updates.password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  if (!user.household_id) {
    updates.household_id = await createHarnessHousehold();
    if (!user.role || user.role === 'member') {
      updates.role = 'admin';
    }
  }

  if (Object.keys(updates).length > 0) {
    await db('users')
      .where({ id: user.id })
      .update(updates);
  }
};

/**
 * POST /api/v1/auth/signup
 * Sign up a new user
 */
router.post('/signup', validateRequest(signupSchema), async (req: Request, res: Response) => {
  try {
    const { user, accessToken, refreshToken, invitationCode } = await AuthService.signup(req.body);

    // Set HTTP-only cookies
    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({
      message: 'User created successfully',
      user,
      invitationCode, // Include invitation code if household was created
    });
  } catch (error) {
    logger.error('Signup error:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Signup failed',
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Login user
 */
router.post('/login', validateRequest(loginSchema), async (req: Request, res: Response) => {
  try {
    const normalizedEmail = req.body.email.trim().toLowerCase();
    const { rememberMe = false } = req.body;

    if (canUseTestAuthCredentials(req.body.email, req.body.password)) {
      await ensureHarnessUser(normalizedEmail, req.body.password);
      const { user, accessToken, refreshToken } = await AuthService.login({
        email: normalizedEmail,
        password: req.body.password,
        rememberMe
      });

      setAuthCookies(res, accessToken, refreshToken, rememberMe);
      res.json({
        message: 'Login successful',
        user
      });
      return;
    }

    const { user, accessToken, refreshToken } = await AuthService.login({
      ...req.body,
      email: normalizedEmail,
    });

    // Set HTTP-only cookies with extended duration if rememberMe is true
    setAuthCookies(res, accessToken, refreshToken, rememberMe);

    res.json({
      message: 'Login successful',
      user,
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(401).json({
      error: error instanceof Error ? error.message : 'Login failed',
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * Logout user
 */
router.post('/logout', async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refresh_token;

  if (typeof refreshToken === 'string' && refreshToken.trim() !== '') {
    try {
      await PlatformSessionStore.revokeSessionByRefreshToken(refreshToken, 'logout');
    } catch (error) {
      logger.warn('Failed to revoke refresh session on logout', { error });
    }
  }

  clearAuthCookies(res);
  res.json({ message: 'Logged out successfully' });
});

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refresh_token;

    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token required' });
      return;
    }

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);

    // Log token refresh for debugging
    logger.info('Refreshing access token', {
      userId: payload.userId,
      householdId: payload.householdId,
      hasHouseholdId: !!payload.householdId
    });

    const storedSession = await PlatformSessionStore.findSessionByRefreshToken(refreshToken);
    if (!storedSession || storedSession.revokedAt) {
      res.status(403).json({ error: 'Refresh token rejected' });
      return;
    }

    if (storedSession.expiresAt.getTime() <= Date.now()) {
      await PlatformSessionStore.revokeSessionById(storedSession.id, 'expired');
      res.status(403).json({ error: 'Refresh token rejected' });
      return;
    }

    const rememberMe = storedSession.rememberMe;
    const newAccessToken = generateAccessToken(payload, rememberMe);
    const newRefreshToken = generateRefreshToken(payload, rememberMe);

    await PlatformSessionStore.rotateSession(refreshToken, newRefreshToken);

    setAuthCookies(res, newAccessToken, newRefreshToken, rememberMe);

    res.json({ message: 'Token refreshed successfully' });
  } catch (error) {
    logger.error('Token refresh error:', error);
    if (error instanceof Error && (error.message === 'SESSION_REVOKED' || error.message === 'SESSION_EXPIRED')) {
      res.status(403).json({ error: 'Refresh token rejected' });
      return;
    }
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

/**
 * GET /api/v1/auth/me
 * Get current user info
 */
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await AuthService.getUserById(req.user.userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

export default router;
