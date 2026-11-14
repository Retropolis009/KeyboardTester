const { db } = require('./db');
const { hashPassword, verifyPassword, generateRandomToken, sha256Hex } = require('./cryptoUtils');

const SESSION_COOKIE = 'kp_admin_session';
const SESSION_TTL_HOURS = 24 * 7; // 7 days
const MAX_FAILED_ATTEMPTS = 6;
const LOCKOUT_WINDOW_MINUTES = 15;

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '0.0.0.0';
}

function purgeExpiredSessions() {
  db.prepare(`DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')`).run();
}

function checkRateLimit(ip, username) {
  const row = db.prepare(`
    SELECT COUNT(*) as fails
    FROM auth_logs
    WHERE success = 0
      AND (ip = ? OR username = ?)
      AND datetime(created_at) >= datetime('now', ?)
  `).get(ip, String(username || ''), `-${LOCKOUT_WINDOW_MINUTES} minutes`);

  const fails = row ? row.fails : 0;
  return {
    locked: fails >= MAX_FAILED_ATTEMPTS,
    failedAttempts: fails,
    maxAttempts: MAX_FAILED_ATTEMPTS,
    windowMinutes: LOCKOUT_WINDOW_MINUTES
  };
}

function recordAuthAttempt({ username, ip, userAgent, success, reason }) {
  db.prepare(`
    INSERT INTO auth_logs (username, ip, user_agent, success, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    String(username || '').slice(0, 120),
    String(ip || '').slice(0, 80),
    String(userAgent || '').slice(0, 255),
    success ? 1 : 0,
    String(reason || '').slice(0, 200)
  );
}

function createAdminSession(adminId, req) {
  purgeExpiredSessions();
  const rawToken = generateRandomToken(32);
  const tokenHash = sha256Hex(rawToken);
  const csrfToken = generateRandomToken(24);
  const ip = getClientIp(req);
  const ua = String(req.headers['user-agent'] || '').slice(0, 255);

  db.prepare(`
    INSERT INTO sessions (token_hash, admin_id, csrf_token, ip, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', ?))
  `).run(tokenHash, adminId, csrfToken, ip, ua, `+${SESSION_TTL_HOURS} hours`);

  db.prepare(`UPDATE admins SET last_login_at = datetime('now') WHERE id = ?`).run(adminId);

  return { rawToken, csrfToken };
}

function getSessionFromRequest(req) {
  const rawToken = req.cookies ? req.cookies[SESSION_COOKIE] : null;
  if (!rawToken || typeof rawToken !== 'string') return null;

  const tokenHash = sha256Hex(rawToken);
  const session = db.prepare(`
    SELECT s.token_hash, s.admin_id, s.csrf_token, s.ip, s.user_agent, s.created_at, s.expires_at,
           a.username, a.email, a.role, a.must_change_password, a.last_login_at
    FROM sessions s
    JOIN admins a ON a.id = s.admin_id
    WHERE s.token_hash = ?
      AND datetime(s.expires_at) > datetime('now')
  `).get(tokenHash);

  return session || null;
}

function setSessionCookie(res, rawToken, req) {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(isSecure),
    path: '/',
    maxAge: SESSION_TTL_HOURS * 3600 * 1000
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  });
}

function requireAdminAuth(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required. Please sign in to the Admin Console.' });
  }

  // Enforce CSRF token on mutating methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const headerCsrf = req.headers['x-csrf-token'];
    if (!headerCsrf || headerCsrf !== session.csrf_token) {
      return res.status(403).json({ error: 'Invalid or missing CSRF security token. Please refresh and try again.' });
    }
  }

  req.adminSession = session;
  next();
}

module.exports = {
  SESSION_COOKIE,
  getClientIp,
  checkRateLimit,
  recordAuthAttempt,
  createAdminSession,
  getSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
  requireAdminAuth,
  hashPassword,
  verifyPassword
};
