import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.js';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(':');
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const safeUser = (user: {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}) => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active });
export async function session(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('mai_session='))
    ?.slice(12);
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  const current = await db.session.findUnique({
    where: { id: digest(token) },
    include: { user: true },
  });
  if (!current || current.expiresAt < new Date() || !current.user.active)
    return res.status(401).json({ error: 'La sesión terminó. Vuelve a ingresar.' });
  res.locals.user = current.user;
  res.locals.session = current;
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.headers['x-csrf-token'] !== current.csrf
  )
    return res.status(403).json({ error: 'Solicitud inválida. Recarga la página.' });
  next();
}
export function admin(_req: Request, res: Response, next: NextFunction) {
  if (res.locals.user.role !== 'SUPERADMIN')
    return res.status(403).json({ error: 'Esta acción requiere el rol superadministrador.' });
  next();
}
