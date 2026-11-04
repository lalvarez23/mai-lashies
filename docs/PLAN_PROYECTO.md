# Planeación inicial — Mai Lashies

Estado: primera versión local implementada; mejoras y decisiones operativas pendientes documentadas.

**Avance:** primera versión local implementada. Consulta `ESTADO_IMPLEMENTACION.md` para ver lo entregado y las funciones que siguen pendientes, y `../README.md` para ejecutarla. Las secciones siguientes conservan la planeación del proyecto completo.

## 1. Objetivo y alcance confirmado

Crear una aplicación web sencilla para administrar productos, existencias, ventas, cobros y gastos de Mai Lashies, con reportes por día, semana, mes y rango de fechas.

Decisiones confirmadas:
- Uso exclusivamente interno de dos a cinco personas con cuentas individuales; sin tienda pública ni acceso para clientas.
- Negocio colombiano, moneda COP y zona horaria America/Bogota.
- Venta de productos de belleza y accesorios; información y variantes capturadas al registrar cada producto.
- Dos roles: superadministrador con control de todos los módulos y básico para operaciones de inventario y ventas.
- Todas las ventas son de contado; los domicilios se pagan por anticipado.
- Control financiero administrativo interno, sin facturación electrónica ni contabilidad formal dentro de este alcance.
- Existe logo del emprendimiento e inventario listo para cargar.
- Desarrollo y pruebas en local. Hosting aplazado hasta que exista una versión validada; Vercel sigue como opción por evaluar.

Supuestos de diseño: una ubicación inicial de inventario y diseño adaptable a computador y celular. Durante el desarrollo, la aplicación se ejecuta en el computador local; el acceso desde otros dispositivos de la misma red requiere configurar expresamente el servidor y la red. Se propone captura manual de inventario inicial y carga masiva solo si el formato existente lo facilita.

## 2. Primera versión utilizable

### Acceso y permisos
- Superadministrador: gestión completa de usuarios, roles, configuración, catálogo, costos, inventario, ventas, gastos y reportes; autorización de anulaciones y devoluciones.
- Básico: gestión operativa de inventario, registro de ventas y cobros de contado, consulta y actualización de domicilios. Puede ver e ingresar costos y consultar ganancias. Propuesta para los demás límites: puede crear productos y registrar entradas y ajustes con motivo; usuarios, roles, configuración y autorización de anulaciones quedan reservados al superadministrador.
- Ambos roles pueden registrar datos comerciales, existencias y costos del producto. El costo inicial es necesario para valorar las existencias; si se desconoce, marcar la valoración y los resultados como incompletos, sin asumir costo cero.
- El control total del superadministrador conserva trazabilidad: puede corregir operaciones mediante ajustes o reversas con motivo; las ventas confirmadas no se sobrescriben ni borran sin historial.
- Cuentas individuales, cierre de sesión y recuperación de acceso.
- Historial de quién registró o modificó cada operación.

### Productos e inventario
- Formulario organizado por datos generales, variantes, precios e inventario.
- Obligatorios: nombre, código interno único (se puede generar), categoría, precio de venta, costo inicial, cantidad inicial y mínimo de existencias. Ambos roles pueden capturar estos datos.
- Opcionales según categoría: marca, descripción, fotografía, proveedor, referencia, color, tono, talla, presentación o contenido.
- Para productos que lo requieran: seguimiento por lote y fecha de vencimiento. Decidir antes del inventario inicial si estas existencias se administran por lote; un solo vencimiento por producto no representa varios lotes.
- Estado activo/inactivo y validaciones para evitar códigos duplicados, cantidades negativas o precios inválidos.
- Variante por color, talla, referencia u otra característica cuando aplique; cada variante tiene su propio stock.
- Precio de venta, costo y mínimo de existencias.
- Entradas por compra o saldo inicial; salidas por venta, daño, pérdida o devolución a proveedor.
- Ajustes con motivo, fecha y responsable.
- Historial de movimientos y alertas de stock bajo.
- Productos con operaciones históricas se desactivan, sin borrar sus registros.

### Ventas y cobros
- Venta con uno o varios productos, cantidades, descuentos y total calculado en el servidor.
- Cliente opcional para venta presencial; destinatario, teléfono y dirección necesarios para domicilio.
- Método de pago: efectivo, transferencia u otros que se confirmen.
- Venta confirmada descuenta stock; borrador no descuenta stock.
- Comprobante interno descargable o imprimible, sin presentarlo como factura electrónica.
- Anulación con motivo y trazabilidad; reversa los movimientos correspondientes.
- Solo contado: no se implementan crédito, abonos ni cuentas por cobrar. Una venta pagada requiere cobros por el total, incluso si combina medios de pago.
- Devoluciones parciales o totales con cantidades, reembolso y destino del producto: reincorporado al inventario o marcado como dañado.

### Domicilios
- Tipo de entrega: presencial o domicilio; el estado de entrega se administra separado del estado de pago.
- Datos: destinatario, teléfono, dirección, barrio o ciudad, indicaciones y responsable de entrega opcional.
- Estados propuestos: pendiente, en preparación, en camino, entregado y cancelado.
- Registrar por separado valor cobrado por domicilio y costo del transportador; mostrar total de productos, descuento, domicilio y total cobrado.
- Separar ingresos y costos de entrega de las ventas y costos de productos para explicar el resultado.
- Pago anticipado confirmado: registrar el cobro total y la venta antes del despacho. Al confirmar la venta, descontar stock; el envío puede continuar pendiente de entrega.
- Una cancelación de venta pagada requiere la reversa o devolución correspondiente, con reembolso y revisión del destino de la mercancía. No implementar contraentrega ni reservas de stock en esta versión.
- Datos de entrega visibles solo para personal autorizado y sin exposición pública.

### Gastos y compras
- Gastos por categoría, valor, fecha, responsable, método de pago y observación.
- Registro de compras de mercancía con cantidades y costos. Las deudas a proveedores quedan fuera de la primera versión salvo nueva necesidad.
- Separar compras de inventario de gastos operativos para evitar descontar dos veces la mercancía al calcular resultados.
- Si se controla caja: saldo inicial, entradas, salidas, cierre y diferencia entre efectivo esperado y contado.

### Panel y reportes
- Ventas netas, cobros recibidos, gastos y utilidad bruta estimada.
- Filtros: hoy, semana, mes y fechas personalizadas; propuesta: semana de lunes a domingo, según America/Bogota.
- Productos más vendidos, unidades vendidas, stock bajo y valor del inventario a costo.
- Desglose por método de pago y persona que registró la venta.
- Exportación CSV como primera opción; PDF y Excel si se necesitan después.
- Definir si un filtro usa fecha de venta, fecha de cobro o fecha del gasto y mostrarlo claramente.

## 3. Reglas para que las cifras sean confiables

1. Ventas netas = ventas confirmadas menos descuentos y devoluciones; impuestos se separan si aplican.
2. Utilidad bruta = ventas netas menos costo de las unidades vendidas.
3. Resultado operativo estimado = utilidad bruta menos gastos operativos registrados, con criterios de fecha definidos.
4. Flujo de dinero = cobros y otras entradas menos pagos y otras salidas. No equivale a utilidad.
5. Comprar mercancía aumenta inventario; su costo se reconoce en el resultado cuando se vende. Evitar contabilizarlo también como gasto operativo.
6. Propuesta de costeo: promedio ponderado móvil. Guardar en cada detalle de venta el costo aplicado, precio y descuento históricos. Confirmar este criterio antes de implementarlo.
7. Los cambios de precios y costos actuales no recalculan ventas históricas.
8. Guardar dinero como decimal exacto en PostgreSQL y usar aritmética decimal en el backend; no usar coma flotante para resultados monetarios. Definir moneda, precisión y redondeo.
9. Confirmar venta, validar existencias, descontar stock y registrar movimientos en una misma transacción. Usar bloqueo o actualización condicionada y reintentos controlados para evitar ventas simultáneas del último artículo.
10. Impedir que un doble clic o reintento de red registre la misma venta dos veces mediante una clave de idempotencia.
11. Anulaciones y devoluciones generan contramovimientos; no borran operaciones confirmadas.
12. Guardar instantes en UTC y agrupar reportes según America/Bogota. Mostrar valores en COP con formato es-CO. Propuesta: almacenamiento NUMERIC(18,2), presentación habitual en pesos enteros y criterio de redondeo explícito antes de implementar.
13. Domicilio anticipado: exigir pago total registrado antes del despacho y descontar stock una sola vez al confirmar la venta. Actualizar el estado de entrega no vuelve a registrar ingresos ni movimientos de inventario.

## 4. Tecnología propuesta

| Capa | Propuesta | Motivo |
| --- | --- | --- |
| Interfaz | React + TypeScript + Vite | Interfaz interactiva y un proyecto con herramientas sencillas |
| Estilos | CSS con variables de diseño; Tailwind opcional | Mantener una apariencia consistente sin recargar dependencias |
| Servidor | Node.js en una versión LTS soportada + Express + TypeScript | Una API pequeña organizada por módulos |
| API | REST | Flujos claros para productos, ventas, cobros y reportes |
| Datos | PostgreSQL | Relaciones, restricciones, transacciones y consultas de reportes |
| Acceso a datos | Prisma, con versión fijada al iniciar | Modelos y migraciones versionadas |
| Autenticación | Sesiones con cookies HttpOnly, Secure y protección CSRF | Acceso individual con permisos comprobados en el servidor |
| Archivos | Almacenamiento persistente para fotografías | Evitar depender del disco temporal del servidor |

Arquitectura: navegador → API Node.js → PostgreSQL. La base de datos no se expone directamente al navegador. Un solo backend modular es suficiente para este alcance; el dimensionamiento se revisa con el volumen real de datos y uso.

PostgreSQL es la recomendación principal por el modelo relacional del negocio. SQLite puede servir para un prototipo local, pero elegiría PostgreSQL desde el inicio para un sistema central compartido. No se necesita infraestructura de microservicios.

### Ejecución inicial: local

- React + Vite, API Node.js + Express y PostgreSQL ejecutados en el computador de desarrollo.
- Organizar un repositorio con frontend y backend separados; el frontend accede a /api mediante un proxy durante el desarrollo.
- PostgreSQL local, mediante instalación nativa o contenedor según las herramientas disponibles; conservar migraciones para reproducir el esquema.
- Credenciales y direcciones configurables mediante variables de entorno; entregar un .env.example sin secretos.
- Sesiones persistentes en la base de datos. Fotografías en una carpeta local de datos, fuera del repositorio y servida con control de acceso; logo estático incluido en el frontend.
- Respaldar tanto la base de datos como las fotografías; mantener los datos de prueba separados del inventario real.
- Documentar instalación, inicio del frontend y backend, migraciones y respaldo local.
- Esta etapa no incluye contratación de servicios ni publicación. El acceso por localhost se limita al equipo que ejecuta la aplicación.

### Alojamiento futuro: decisión aplazada

- Mantener React, Node.js y PostgreSQL para facilitar el despliegue posterior.
- Evaluar Vercel u otro proveedor cuando la versión local esté validada. Si se elige Vercel, adaptar Express a sus funciones, usar PostgreSQL administrado externo y almacenamiento persistente para fotografías.
- Revisar entonces planes, uso comercial permitido, presupuesto, región y copias de seguridad. La cantidad de usuarios no determina por sí sola la elegibilidad de un plan.

## 5. Modelo de datos inicial

| Entidad | Función |
| --- | --- |
| Usuario / rol | Acceso, permisos y responsable |
| Categoría | Clasificación de productos |
| Producto / variante | Catálogo y unidad concreta de stock |
| Movimiento de inventario | Entradas, salidas y ajustes con referencia de origen |
| Compra / detalle | Reposición y costos por unidad |
| Venta / detalle | Operación comercial con precio y costo históricos |
| Cobro | Dinero recibido y método de pago vinculado a una venta |
| Gasto / categoría de gasto | Gastos operativos |
| Devolución / detalle / reembolso | Reversas parciales o totales trazables |
| Cliente / destinatario | Opcional para presencial; datos de contacto para domicilios |
| Domicilio | Dirección, estado de entrega, importe cobrado y costo del transportador |
| Lote | Si aplica: existencias por variante, lote y vencimiento |
| Proveedor | Datos básicos de abastecimiento |
| Auditoría | Cambios sensibles, autor, fecha y motivo |
| Caja / movimiento de caja | Solo si se confirma apertura y cierre de efectivo |

Una venta tiene varios detalles y puede tener varios cobros. Una variante tiene varios movimientos de inventario. Una devolución referencia los detalles originales para impedir devolver más unidades de las vendidas. El saldo de stock y su historial deben actualizarse de forma consistente.

## 6. Dirección visual

- Logo original integrado en login, dashboard, menú lateral y comprobantes. Eslogan: Pestañas que enamoran.
- Identidad femenina y minimalista basada en el logo: rosa chicle, fucsia, reflejos perlados y texto oscuro.
- Paleta aplicada: fondo #FFF7FB, acento #AC346B, acento oscuro #85234F, rosa de marca #F6BFD6 y texto #432D3C.
- Tipografía legible, espacios amplios, iconos acompañados de etiquetas y formularios cortos.
- Navegación: Inicio, Productos, Inventario, Ventas, Gastos, Reportes y Configuración.
- Acciones principales visibles: Registrar venta, Agregar producto y Registrar gasto.
- En celular, convertir tablas extensas en vistas adaptadas con búsqueda y filtros.
- Estados vacíos útiles, errores junto al campo y confirmación de operaciones sensibles.
- El color acompaña etiquetas e iconos; no será el único indicador de estado.

## 7. Etapas y criterios de avance

| Etapa | Entregable | Criterio para avanzar |
| --- | --- | --- |
| 1. Definición | Alcance, permisos, moneda, reglas de ventas y costeo | Decisiones críticas respondidas y backlog priorizado |
| 2. Diseño | Bocetos de panel, inventario y registro de venta | El flujo principal se comprende en celular y computador |
| 3. Base técnica | React, API, migraciones, acceso y configuración | Usuario autorizado entra; usuario sin permiso no accede |
| 4. Inventario | Catálogo, variantes, entradas y ajustes | El stock coincide con los movimientos registrados |
| 5. Ventas y finanzas | Ventas, cobros, gastos, anulaciones y devoluciones | Cada operación conserva inventario y saldos consistentes |
| 6. Reportes | Panel y filtros por períodos | Totales conciliados con un conjunto de operaciones conocido |
| 7. Piloto local | Instalación documentada, respaldo y prueba con las usuarias | Flujos reales validados y restauración comprobada en local |

La elección de hosting y la publicación serán una etapa posterior al piloto local.

Construir por entregas pequeñas. Pago anticipado y acceso del rol básico a costos y ganancias confirmados. La estimación de calendario se establece después de definir lotes y cierre de caja. No iniciar registro real hasta verificar costos y saldos iniciales del inventario.

## 8. Pruebas y operación

- Dos personas intentan vender la última unidad: solo una venta debe confirmarse.
- Reenviar la misma solicitud de venta: no debe duplicar cobros ni descontar stock otra vez.
- Cambiar el precio o costo actual: reportes históricos permanecen iguales.
- Anular una venta y devolver parcialmente otra: stock, dinero y resultados coinciden con lo esperado.
- Probar límites de día, semana y mes con la zona horaria definida.
- Verificar permisos en API, no únicamente ocultando botones.
- Proteger contraseñas con hash adecuado, validar entradas y mantener secretos fuera del repositorio.
- Copias automáticas con política de retención y prueba de restauración antes del uso real.
- Separar datos de prueba de producción y registrar errores sin exponer contraseñas ni datos sensibles.

## 9. Funciones para después del piloto

Mejoras opcionales dentro del uso interno: integración con WhatsApp para preparar mensajes de domicilio, lector de códigos de barras, importación desde Excel, cuentas por pagar, múltiples ubicaciones y reportes adicionales. Tienda pública, crédito y facturación electrónica quedan fuera del alcance acordado.

## 10. Decisiones operativas pendientes

Decisiones cerradas: domicilios con pago anticipado y rol básico con acceso a captura y consulta de costos y ganancias.

Para resolver durante el diseño:
- Medios de pago concretos y necesidad de pagos combinados.
- Cómo se cobra el envío y cómo se paga al transportador.
- Uso de lotes y vencimientos en los productos de belleza.
- Necesidad de apertura y cierre diario de caja.
- Ubicación del logo y formato del inventario existente para decidir captura manual o importación.
- Alojamiento y presupuesto mensual: aplazados hasta después de validar la versión local.
- Confirmar promedio ponderado móvil e inicio de semana propuesto.

## Referencias técnicas consultadas

- React y herramientas para iniciar un proyecto: https://react.dev/learn/build-a-react-app-from-scratch
- PostgreSQL, tipos numéricos exactos: https://www.postgresql.org/docs/current/datatype.htm
- Prisma, modelado de datos: https://www.prisma.io/docs/orm/data-modeling
- Express en Vercel: https://vercel.com/docs/frameworks/backend/express
- PostgreSQL externo en Vercel: https://vercel.com/docs/postgres
- Alcance del plan Hobby: https://vercel.com/docs/plans/hobby
- Uso comercial y uso justo: https://vercel.com/docs/limits/fair-use-guidelines

Estas referencias respaldan capacidades técnicas; la elección del alcance y la arquitectura es una propuesta para Mai Lashies.
