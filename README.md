# Mai Lashies

Aplicación local de administración interna, en español y COP, para un equipo de dos a cinco personas. React + TypeScript + Vite en la interfaz, Node.js + Express en la API y PostgreSQL con Prisma para persistencia.

El proyecto también está adaptado para Vercel con PostgreSQL en Neon. Consulta [Despliegue en Vercel](docs/DESPLIEGUE_VERCEL.md) para las variables de producción, la migración de datos y los respaldos. El entorno local continúa disponible para desarrollo.

## Iniciar

Requisito: Node.js 24 LTS y npm. La instalación de dependencias requiere internet. Después, la aplicación funciona localmente sin cargar fuentes, imágenes ni servicios externos. No requiere Docker para el entorno incluido en Windows x64.

```powershell
npm install
npm run setup
npm run dev
```

Abre **http://127.0.0.1:5173/**. En este equipo las dependencias, la base y la cuenta inicial ya fueron preparadas: normalmente basta con `npm run dev`.

También puedes hacer doble clic en **Iniciar Mai Lashies.cmd** y dejar abierta su terminal.

El script `setup` genera `.env` con contraseñas aleatorias, inicializa PostgreSQL local, genera el cliente Prisma, aplica las migraciones y crea únicamente la primera cuenta de superadministración. Es repetible: no reinicia el inventario ni restablece una contraseña ya cambiada.

**Acceso inicial:** abre `.local/ACCESO.txt` en tu computador. Usa Configuración para cambiar la contraseña y crear las cuentas del equipo. La contraseña inicial escrita en ese archivo deja de servir después de cambiarla. No compartas `.env`, `.local`, respaldos ni contraseñas mediante Git.

Presiona **Ctrl+C** en la terminal que ejecuta `npm run dev` para detener los servidores. La información queda guardada.

## Qué incluye esta entrega

- Inicio de sesión con sesiones persistentes, contraseñas con scrypt, protección CSRF y límite de intentos.
- Superadministrador: acceso completo a los módulos implementados y gestión de cuentas, roles, activación y restablecimiento de contraseñas.
- Básico: productos, inventario, costos, ventas, domicilios, gastos y consulta de ganancias/reportes. Las anulaciones y la gestión de usuarios requieren superadministrador.
- Productos con categoría libre, marca, referencia, variante/presentación, descripción, proveedor, costo inicial, precio y alerta de stock.
- Cada variante se registra como una referencia independiente con su propio código y existencias.
- Compras pagadas con costo promedio ponderado móvil; ajustes y correcciones de costo con motivo e historial por responsable, sin cambiar ventas anteriores.
- Ventas presenciales o domicilios con pago completo anticipado, descuentos y comprobante interno imprimible.
- Medios: efectivo, transferencia, Nequi, Daviplata y tarjeta. La interfaz usa un medio por venta; la API valida también pagos combinados.
- Domicilios con destinatario, teléfono, dirección, notas y seguimiento de estado.
- Anulación total con reembolso, motivo y opción de reincorporar mercancía. Sin recuperación de mercancía, su costo permanece como pérdida en el resultado.
- Gastos por categoría y fecha, con reversa registrada en la fecha de anulación.
- Panel, reportes de día/semana/mes/rango de hasta 366 días y exportación CSV.
- Auditoría de operaciones y cuentas; últimos 250 movimientos, 300 ventas/gastos y 200 eventos visibles en las listas. Los reportes incluyen todas las operaciones del período, sin ese límite.
- Respaldos manuales, respaldo diario al arrancar y cada hora mientras la aplicación permanece abierta, y restauración a una base nueva.

La identidad visual utiliza el logo original de Mai Lashies en el login, el dashboard, el menú y los comprobantes, con su eslogan **Pestañas que enamoran**. La paleta combina rosa chicle, fucsia y fondos rosa suave. El archivo original está en `public/brand/mai-lashies.jpeg`; el componente compartido es `src/BrandLogo.tsx` y los estilos de marca están en `src/brand.css`.

## Flujo recomendado

1. Entra y cambia la contraseña inicial.
2. Crea una cuenta individual para cada persona en Configuración.
3. Registra cada producto o variante y su costo y cantidad iniciales.
4. Para reponer mercancía: Productos e inventario → Mover inventario → Compra pagada. Esta operación registra unidades, costo y salida de dinero; no la dupliques en Gastos.
5. Registra ventas únicamente después de recibir el pago completo. Los domicilios comienzan pendientes de entrega y puedes actualizar su estado desde Domicilios.
6. Registra los gastos operativos y consulta los reportes.

El costo del transportador se considera pagado al registrar la venta y no se recupera automáticamente al anularla. No vuelvas a registrarlo como gasto. Una anulación presupone que ya realizaste el reembolso fuera de la aplicación: esta web registra operaciones internas y no mueve dinero en bancos o pasarelas.

Ventas, cobros y utilidad se muestran por separado. La compra de mercancía afecta el flujo al pagarla y el resultado cuando se vende. El inventario de los reportes siempre es el actual. Las devoluciones se reflejan en su fecha de registro. El flujo neto registrado no incluye saldo inicial de caja, aportes o retiros.

## Datos y puertos

| Recurso | Ubicación |
| --- | --- |
| Interfaz | `http://127.0.0.1:5173` |
| API | `http://127.0.0.1:3001/api` |
| PostgreSQL | `127.0.0.1:54329` |
| Base | `mai_lashies` |
| Archivos del motor | `.local/postgres/` |
| Configuración privada | `.env` |
| Respaldos | `backups/` |

Los servicios escuchan solamente en la interfaz local. Esta entrega no configura acceso desde otros computadores, celulares ni internet. Tener varias cuentas no habilita automáticamente acceso por red.

El proyecto está en OneDrive. No uses la sincronización de archivos del motor PostgreSQL en ejecución como sustituto de los respaldos: el archivo lógico generado en `backups/` es el que puedes copiar a otra ubicación. No muevas la carpeta del motor mientras esté funcionando.

Si cambias los puertos, ajusta `.env` y el proxy de `vite.config.ts`. No uses directamente `localhost` si la configuración de origen conserva `127.0.0.1`.

## Respaldar y restaurar

```powershell
npm run backup
```

También funciona con la aplicación cerrada: inicia PostgreSQL durante el respaldo y lo detiene al terminar. El respaldo usa una instantánea consistente e incluye cuentas, hashes de contraseña, productos, ventas, cobros, movimientos, gastos y auditoría; excluye sesiones. Contiene datos privados. Mantén una copia protegida fuera de este computador. Los respaldos automáticos permanecen en disco; no se borran automáticamente.

Para restaurar en una **base nueva**:

```powershell
npm run restore -- "backups/ARCHIVO.json" mai_lashies_restore_20261104
```

El nombre de destino debe comenzar por `mai_lashies_restore_` y no debe existir. La restauración no sobrescribe la base original. Para usar la restaurada, detén la aplicación, cambia solo el nombre de base al final de `DATABASE_URL` en `.env` y vuelve a arrancar. Los usuarios conservan sus contraseñas del momento del respaldo y deben iniciar sesión nuevamente.

Este formato de respaldo corresponde al esquema de esta versión; las modificaciones futuras del esquema deben incluir la adaptación de respaldos y restauración. No equivale a un `pg_dump` universal.

## Verificación

```powershell
npm run build
npm test
```

Las pruebas crean bases nuevas con prefijo `mai_lashies_test_`, aplican las migraciones y verifican concurrencia, idempotencia, permisos, exactitud monetaria, períodos de Colombia y respaldo/restauración. Al terminar eliminan exclusivamente sus bases temporales; no cargan ejemplos en el inventario real.

Las migraciones se encuentran en `prisma/migrations`. Después de actualizar el proyecto, ejecuta `npm run setup` con la aplicación detenida para aplicarlas. Para nuevas migraciones durante el desarrollo, usa Prisma y revisa el SQL antes de aplicarlo.

## Pendiente para próximas entregas

- Incorporar fotografías de productos.
- Importar inventario desde un archivo, si se proporciona un formato adecuado.
- Lotes y vencimientos, si se confirma su uso; esta entrega no administra trazabilidad por lote.
- Devoluciones parciales: esta entrega permite anulación/reembolso total.
- Apertura y cierre de caja, aportes y retiros, si se confirma esa necesidad.
- Filtros avanzados, paginación de históricos y exportaciones detalladas de ventas.
- Ampliaciones de infraestructura y ajustes de operación según el uso real.

No incluye tienda pública, crédito, facturación electrónica ni contabilidad fiscal formal.
