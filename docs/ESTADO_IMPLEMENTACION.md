# Estado de implementación

Primera versión funcional local. El alcance inicial acordado se construyó como una API Node.js y una interfaz React conectadas a PostgreSQL real; los datos no se guardan en localStorage.

## Entregado

- Estructura técnica, migraciones versionadas y scripts de instalación y arranque local.
- Autenticación y roles con acceso del básico a costos y ganancias.
- Productos y referencias independientes, inventario, compras y ajustes auditados.
- Ventas de contado y domicilios anticipados con seguimiento, comprobantes y anulaciones totales.
- Gastos, panel, reportes en COP con períodos de Colombia y exportación CSV.
- Gestión de cuentas, restablecimiento de claves por superadministrador y auditoría.
- Respaldo lógico consistente, ejecución diaria mientras el entorno está abierto y restauración aislada.
- Pruebas de integración contra PostgreSQL en bases separadas.

## Decisiones del primer incremento

- Variantes como productos/referencias independientes, cada una con código único.
- No se cargaron productos ni ventas ficticias en la base del negocio.
- Compra pagada registra la salida de dinero; saldo inicial y ajustes no monetarios no se tratan como gastos.
- El costo promedio conserva cuatro decimales internos; precios y cobros, dos. Las sumas financieras usan aritmética decimal.
- Anular una venta registra el reembolso total en la fecha de anulación. El costo del transporte permanece pagado; si los productos no se reincorporan, su costo permanece como pérdida.
- La interfaz registra un medio de pago por venta. La API admite y valida combinaciones cuya suma coincida con el total.
- El motor PostgreSQL local usa un paquete de binarios fijado en package-lock.json; no instala servicios globales ni requiere iniciar Docker.

## Pendiente

Fotografías de productos, importación de inventario, devoluciones parciales, lotes y vencimientos, cierre de caja y publicación. Las funciones condicionales de lotes y cierre requieren definir primero las reglas del negocio.

Consulta README.md para iniciar, ingresar, respaldar y restaurar. Esta entrega es una primera versión local para revisión antes de cargar y operar datos reales.

## Validación realizada

- `npm run build`: compilación TypeScript y construcción de React correctas.
- `npm test`: 10 pruebas de integración aprobadas, incluyendo dos ventas simultáneas de la última unidad, reintentos simultáneos de una misma venta con una sola unidad, permisos, corrección de costo, reportes y restauración.
- Verificación en navegador: ingreso real, panel con base vacía, formulario de productos, venta a domicilio con pago anticipado y reporte de resultados.
- Reinicio local verificado con datos persistentes y generación del respaldo diario.
- Captura del panel: `capturas/inicio.png`.
- La vista móvil tiene estilos adaptables; la inspección visual de esta entrega se realizó en el navegador de escritorio.

## Identidad visual incorporada

- Logo original aportado por el emprendimiento, conservado completo en `public/brand/mai-lashies.jpeg`.
- Eslogan: **Pestañas que enamoran**.
- Imagen en login, bienvenida del dashboard, menú y comprobantes.
- Paleta rosa chicle, fucsia y fondos suaves con reflejos perlados; tipografía oscura en formularios y cifras.
- Compilación verificada y revisión en navegador del login y dashboard con acceso real.
- Capturas: `capturas/login-marca.png` y `capturas/dashboard-marca.png`.
