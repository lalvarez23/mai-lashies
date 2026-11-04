import { db } from './db.js';
import { hashPassword } from './security.js';
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12 || password.startsWith('CAMBIAR'))
  throw new Error('Configura una contraseña inicial de al menos 12 caracteres.');
try {
  const found = await db.user.findUnique({ where: { email } });
  if (!found)
    await db.user.create({
      data: {
        name: 'Administración Mai Lashies',
        email,
        passwordHash: hashPassword(password),
        role: 'SUPERADMIN',
      },
    });
  console.log('Cuenta inicial verificada. El inventario comienza vacío.');
} finally {
  await db.$disconnect();
}
