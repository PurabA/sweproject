import pool from '../db.js';

export async function audit(req, action, resource, resourceId, details = null) {
  const userId = req.user?.id ?? null;
  const ip = req.ip || req.connection?.remoteAddress || null;
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, action, resource, resource_id, ip_address, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        resource ?? null,
        resourceId != null ? String(resourceId) : null,
        ip,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch {
    /* do not block request if audit insert fails */
  }
}

export function auditMiddleware(action, getResourceMeta) {
  return async (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        const meta = typeof getResourceMeta === 'function' ? getResourceMeta(req) : {};
        audit(req, action, meta.resource, meta.resourceId, meta.details).catch(() => {});
      }
    });
    next();
  };
}
