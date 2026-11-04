# Despliegue de Mai Lashies en Vercel

## Arquitectura

- React y logo: archivos estáticos construidos por Vite.
- API: `api/index.ts` exporta Express como una función Node.js 24; `vercel.json` dirige `/api/*` a esa función.
- PostgreSQL: proyecto Neon dedicado, con conexiones agrupadas para la API y conexión directa para mantenimiento.
- Sesiones y límite de intentos de ingreso: persistidos en PostgreSQL y compartidos entre instancias.
- Región de funciones: `iad1`; base de datos: AWS US East 1.

Esta versión no implementa carga de fotografías: el logo viaja con el código. La base local y los respaldos nunca forman parte del despliegue ni del repositorio.

## Configuración del proyecto

Importar `lalvarez23/mai-lashies` desde GitHub y usar la raíz del repositorio.

| Ajuste | Valor |
| --- | --- |
| Framework | Vite |
| Node.js | 24.x |
| Install Command | npm ci --include=dev |
| Build Command | npm run build:vercel |
| Output Directory | dist |

La compilación genera el cliente Prisma, verifica TypeScript, comprueba la emisión del backend como módulos ESM de Node.js con `tsconfig.server.json` y construye React. Los imports relativos del backend y del cliente generado usan extensiones `.js`, necesarias al ejecutarse fuera de tsx. Las migraciones no se aplican durante una compilación de vista previa. Los despliegues de vista previa están desactivados inicialmente para no usar datos reales en entornos de prueba.

## Variables de entorno

Configurar únicamente para **Production**:

| Variable | Uso |
| --- | --- |
| DATABASE_URL | URL agrupada de Neon, con TLS; variable sensible |
| DIRECT_URL | URL directa de Neon, con TLS; variable sensible |
| NODE_ENV | production |
| APP_ORIGIN | URL HTTPS definitiva de la aplicación, sin rutas; permite varias separadas por coma |

Los dominios exactos que Vercel suministra en `VERCEL_URL`, `VERCEL_BRANCH_URL` y `VERCEL_PROJECT_PRODUCTION_URL` también se reconocen. No se aceptan dominios arbitrarios por coincidir con `vercel.app` ni por un encabezado Host enviado por el navegador.

No guardar claves con prefijo `VITE_`: Vite incorpora esas variables al navegador. `VITE_APP_HOSTED` es únicamente una bandera pública de presentación que establece el script de compilación.

No se necesitan `ADMIN_EMAIL` ni `ADMIN_PASSWORD` para una migración que conserva usuarios. Se mantienen las contraseñas existentes; cada persona debe iniciar una nueva sesión en el sitio publicado.

## Migración de los datos locales

El archivo `.env` conserva la conexión local. Para mantenimiento de producción, el archivo **ignorado por Git** `.env.production.local` contiene `DATABASE_URL` y `DIRECT_URL` remotos. No copiar ese archivo al repositorio ni a un mensaje público.

```powershell
npm run db:cloud:import
```

Este comando:

1. Comprueba que el origen es local y el destino es remoto.
2. Rechaza una base de destino que tenga datos o tablas ajenas.
3. Crea un respaldo consistente y privado en `backups/`.
4. Aplica las migraciones versionadas al destino.
5. Importa usuarios, productos, ventas, pagos, movimientos, gastos y auditoría dentro de una transacción.
6. Compara cantidades y huellas de cada registro antes de confirmar la importación.

No copia sesiones ni contadores de intentos de ingreso. Si falla la verificación, revierte los registros importados. Ejecutarlo de nuevo sobre una base ya poblada se rechaza: no funciona como sincronización ni sobrescribe datos.

Antes del cambio definitivo, terminar los registros en local y comprobar que no hubo nuevas operaciones después del respaldo importado. A partir de entonces, registrar las operaciones en la URL publicada. Las dos bases son independientes.

## Actualizaciones posteriores

1. Probar los cambios con `npm test` y `npm run build`.
2. Crear un respaldo de producción.
3. Si hay cambios de esquema, revisar el SQL y aplicar `npm run db:cloud:prepare` con las credenciales de producción configuradas.
4. Subir los cambios a GitHub y verificar el despliegue de Vercel.
5. Comprobar login, inventario y reportes; un rollback de código no revierte automáticamente una migración de datos.

## Respaldos de producción

```powershell
npm run backup:cloud
```

Este comando guarda un respaldo lógico de producción en el computador que lo ejecuta, usando la conexión privada de `.env.production.local`. Los respaldos diarios del comando `npm run dev` corresponden a la base local; Vercel no ejecuta ese proceso permanente.

La retención y recuperación administradas dependen del plan de Neon. Mantener también copias privadas fuera del computador y verificar restauraciones. La restauración local documentada en README permite inspeccionar un respaldo sin sobrescribir producción.

## Verificación tras publicar

- `/`: login con logo y eslogan.
- `/brand/mai-lashies.jpeg`: imagen original disponible.
- `/api/health`: respuesta JSON con `ok: true` después de consultar PostgreSQL.
- `/api/auth/me` sin sesión: 401, sin datos de cuentas.
- Inicio de sesión: cookie HttpOnly, Secure y SameSite=Strict.
- Inventario, usuarios y reportes: corresponden a los datos migrados.
- Operaciones protegidas por rol y CSRF; HTTPS en producción.

El acceso se controla con las cuentas de Mai Lashies. Revisar la protección adicional de Vercel para que el equipo pueda usar el dominio de producción con estas cuentas. Mantener separadas las bases de prueba y producción si se habilitan vistas previas.

## Referencias

- https://vercel.com/docs/frameworks/frontend/vite
- https://vercel.com/docs/frameworks/backend/express
- https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
- https://vercel.com/docs/limits/fair-use-guidelines

Revisar que el plan contratado permita el uso comercial del negocio. La configuración del proyecto no cambia ni contrata planes de facturación.
