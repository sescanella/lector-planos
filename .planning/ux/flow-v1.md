# Lector de Planos — Flujo UX v1

**Estado:** borrador v1.1, actualizado 2026-04-06. Cambio principal: la pantalla de procesamiento pasa a ser central (feedback en vivo + ETA).
**Alcance:** define el flujo de usuario, vocabulario, estados de pantalla y scope de v1. No define visual final ni implementación. Fuente para la siguiente sesión de diseño visual sobre el Kronos Design System.

---

## 1. Contexto

Lector de Planos es una aplicación web interna de Kronos Mining que extrae datos estructurados (materiales, soldaduras, cortes, cajetín) desde PDFs de planos técnicos de spools de piping, y entrega un único Excel consolidado por orden de trabajo.

La app es una **fábrica**, no un producto de consumo. El usuario quiere pasar el menor tiempo posible dentro de ella. El valor está en el Excel descargado, no en la experiencia web.

### Usuarios

- **Cotizadores** de Kronos Mining: extraen listado de materiales para cotizar la fabricación de spools.
- **Técnicos** de Kronos Mining: usan los datos extraídos en producción.
- **Clientes** de Kronos Mining: acceso restringido al mismo flujo.

Los tres perfiles comparten el mismo flujo y la misma interfaz. No hay roles diferenciados en v1. Todos son expertos del dominio: entienden planos, materiales, diámetros, códigos. **No requieren onboarding, tooltips educativos ni explicaciones de negocio.**

### Contexto de uso

- Desktop, en oficina. Sin soporte mobile ni tablet en v1.
- Español de Chile en todo el copy visible.
- Máximo ~5 usuarios concurrentes al inicio.
- Entorno controlado, no multi-tenant agresivo.

### Volumen y cadencia real

- ~1 OT por semana.
- 50 a 200 planos por OT, típicamente ~90.
- Hoy el proceso manual toma 3 días por OT para construir el listado de materiales.
- El objetivo es bajar ese tiempo drásticamente manteniendo el Excel como entregable canónico.

---

## 2. Vocabulario del negocio

La UI debe hablar el idioma del cotizador, no el del backend. El backend usa `job`, `file`, `spool` internamente; la UI usa los términos siguientes.

| Término UI | Significado | Equivalente backend |
|---|---|---|
| **OT** | Orden de Trabajo. Unidad central del flujo. Agrupa todos los planos de un proyecto de cotización/producción. | `Job` |
| **Plano** | Un PDF individual, corresponde a un spool de piping. | `PDFFile` / `Spool` |
| **Cajetín** | Bloque de metadata del plano (OT, OF, tag spool, diámetro, cliente, línea). | `SpoolMetadata` |
| **Materiales** | Tabla de componentes del spool: ITEM, DIAM., CÓDIGO, DESCRIPCIÓN, CANTIDAD, N COLADA. | `Material` |
| **Soldaduras** | Tabla de uniones: N SOLD., DIAM., TIPO SOLD., WPS, fechas, soldador, inspección. | `Union` |
| **Cortes** | Tabla de cortes: N CORTE, DIAM., LARGO, EXTREMO 1, EXTREMO 2. | `Cut` |
| **Excel** | Entregable final consolidado. Una OT → un Excel con 3 hojas (Materiales, Soldaduras, Cortes). | `Export` |

**Identificador de OT:** cada OT tiene un nombre libre (ej: "Cotización Codelco Q2 2026") y un identificador corto autogenerado (ej: `OT-045`). El identificador es lo que aparece en breadcrumbs y referencias rápidas. El nombre libre es lo que aparece en el listado como título principal.

**No existe "Cliente" como campo.** Confirmado con el usuario. La OT se identifica solo por nombre + id corto.

---

## 3. Flujo de usuario

### 3.1 Flujo dorado (happy path)

```
1. Usuario abre la app
2. Login con API key
3. Llega al listado de OTs
4. Click en "+ Nueva OT"
5. Ingresa nombre de la OT
6. Arrastra entre 50 y 200 PDFs
7. Click "Iniciar procesamiento"
8. App redirige al detalle de la OT (estado: procesando)
9. Usuario se queda viendo la pantalla de procesamiento
10. Ve en vivo: planos procesados, materiales extraídos, ETA
11. Cuando termina, descarga el Excel
12. Revisa el Excel en Excel (fuera de la app)
13. Fin
```

**La pantalla de procesamiento es central, no un placeholder.** El usuario se queda mirando el progreso en vivo. Esto reduce la ansiedad y transmite que el sistema está activamente trabajando. La pantalla debe ofrecer métricas en tiempo real y un tiempo estimado de finalización.

**Nota:** el usuario también puede cerrar la pestaña y volver después — el procesamiento no se cancela. Pero el diseño está optimizado para que se quede mirando, no para que se vaya.

### 3.2 Qué NO está en el flujo v1

Estas cosas se consideraron y se dejaron explícitamente fuera. Documentar por qué importa para que una futura sesión no las reintroduzca por accidente.

- **Edición inline de spools** — el Frontend A actual tiene un editor de celdas completo. Se elimina. La revisión sucede en Excel, no en la app. Reintroducir solo si hay evidencia empírica de que los usuarios la piden.
- **Loop de subir Excel corregido** — hipótesis estratégica válida pero no priorizada. Se añade cuando haya uso real y evidencia de que el usuario quiere devolver correcciones al sistema.
- **Confianza por celda o por plano** — los errores típicos del modelo (confundir 6 con 8, puntuación espuria) son silenciosos: el modelo tiene alta confianza en celdas incorrectas. Mostrar un score no ayuda, confunde. La revisión es visual en Excel.
- **Notificaciones (email/webhook)** — cuando termina el procesamiento. Futuro.
- **Reprocesamiento selectivo** de planos fallidos sin reprocesar toda la OT. Futuro.
- **Dashboard con métricas** (tiempo promedio, costo por OT, planos procesados en el mes, etc.). No hay stakeholder que las necesite hoy.
- **Histórico avanzado con filtros, búsqueda, etiquetas, agrupaciones**. 5 usuarios viendo ~4 OTs al mes no lo necesitan.
- **Multi-rol, permisos granulares, auditoría de acciones**. El mismo usuario hace todo.
- **Mobile, tablet, responsive agresivo**. Desktop only.
- **Dark mode**. Decisión deliberada del design system Kronos.
- **Onboarding, tours, tooltips educativos**. Usuarios expertos.

---

## 4. Pantallas

La app tiene **login + 3 pantallas** en v1. No más.

### Pantalla 0 — Login

- Único campo: API Key.
- Botón: "Entrar".
- Error visible si la key es inválida (401).
- Si la key es válida, se guarda en sessionStorage y redirige a `/ots`.
- Sin "recordarme", sin recuperación de contraseña, sin auto-registro.

**Ruta:** `/login`

### Pantalla 1 — Listado de OTs

Pantalla de entrada después del login. Es el "home" de la app.

**Contenido:**
- Header de la app (logo Kronos, usuario actual, logout).
- Título: `OTs` o equivalente.
- Botón primario: `+ Nueva OT` (esquina superior derecha o arriba de la tabla).
- Tabla densa de OTs, ordenadas por fecha de creación descendente (más reciente arriba).

**Columnas de la tabla:**
1. Identificador (`OT-045`) — mono, técnico
2. Nombre de la OT
3. Estado (ver sección 5)
4. Planos (ej: `47/90`, `90/90`, `88/90 · 2 errores`)
5. Fecha de creación
6. Acción: `Descargar Excel` (solo si está lista o parcialmente lista), o vacío

**Interacción:**
- Click en una fila (cualquier parte menos el botón de descarga) → abre el detalle de la OT.
- Click en `Descargar Excel` → genera export si no existe y descarga.

**Vacío inicial:** si no hay OTs, mostrar mensaje breve ("No hay OTs todavía") y el botón `+ Nueva OT` como única acción visible.

**Ruta:** `/ots`

### Pantalla 2 — Nueva OT

Formulario mínimo para crear una OT y subir sus planos.

**Contenido:**
- Breadcrumb: `OTs › Nueva OT`
- Título: `Nueva OT`
- Campo: `Nombre` (texto libre, obligatorio). Placeholder con ejemplo realista.
- Drop zone grande: `Arrastra PDFs aquí o haz clic para seleccionar`.
  - Acepta 1 a 200 archivos.
  - Máximo 50 MB por archivo.
  - Solo `.pdf`.
  - Validación al vuelo: si se pasan de 200, se exceden 50MB, o hay un tipo no-pdf, se indica en línea y el archivo problemático queda marcado.
- Lista de archivos seleccionados: nombre, tamaño, estado (ok / rechazado con razón).
- Contador: `N planos listos para procesar` (solo los ok).
- Botón primario: `Iniciar procesamiento`.
  - Deshabilitado si: el nombre está vacío, hay 0 planos ok, o algún archivo sigue cargándose.
- Botón secundario: `Cancelar` → vuelve a `/ots`.

**Interacción:**
- Al hacer click en `Iniciar procesamiento`:
  1. Se crea la OT en el backend.
  2. Los PDFs se suben en paralelo con barra de progreso global.
  3. Una vez subidos todos, la app redirige al detalle de la OT (Pantalla 3), ya en estado `procesando`.
- Si la subida falla a mitad de camino: mostrar el error, permitir reintentar solo los archivos que fallaron sin volver a subir los que sí subieron.

**Ruta:** `/ots/nueva`

### Pantalla 3 — Detalle de OT

La pantalla central de la app. Es donde el usuario pasa más tiempo: mirando el procesamiento en vivo, y después descargando el Excel.

**Esta pantalla tiene dos modos visuales** según el estado de la OT: modo procesamiento y modo resultado. Misma URL, mismo componente, distintas secciones visibles.

#### Modo procesamiento (estado `procesando`)

El usuario acaba de lanzar el procesamiento y se queda mirando. El objetivo es **reducir ansiedad y transmitir trabajo activo**. Debe sentirse como un panel de control que va llenándose de datos.

**Header:**
- Breadcrumb: `OTs › OT-045`
- Identificador en mono: `OT-045`
- Nombre de la OT
- Estado visual animado: `procesando` con indicador de actividad (no un spinner genérico — algo que comunique trabajo real)

**Panel de métricas en vivo (área dominante de la pantalla):**

Cuatro contadores grandes que se actualizan en tiempo real:

| Métrica | Ejemplo | Fuente backend |
|---|---|---|
| Planos procesados | `47 / 90` | `processed_count` / `file_count` del job |
| Materiales extraídos | `312` | COUNT de materials por job (endpoint nuevo) |
| Soldaduras extraídas | `89` | COUNT de unions por job (endpoint nuevo) |
| Cortes extraídos | `156` | COUNT de cuts por job (endpoint nuevo) |

Cada contador se anima suavemente al incrementar (no parpadeo brusco — transición numérica).

**Barra de progreso global:**
- Basada en `processed_count / file_count`.
- Progreso continuo, no por pasos discretos.
- Porcentaje visible: `52%`

**Tiempo estimado:**
- `Tiempo estimado: ~8 min` (calculado como: `(tiempo_transcurrido / planos_procesados) * planos_restantes`)
- Se recalcula con cada actualización.
- Si hay pocos datos (<3 planos procesados), mostrar `Calculando...` en vez de un ETA poco confiable.
- Si el procesamiento terminó, no mostrar ETA.

**Planos con errores (si los hay durante el procesamiento):**
- Aparecen debajo de las métricas como lista compacta: `plano-045.pdf — error: imagen ilegible`
- No bloquean el progreso general.

**Polling:**
- Cada 3 segundos mientras la OT está `procesando`.
- Se usa el endpoint de progreso consolidado del backend (ver sección 13).
- Si el backend no responde en un poll, no romper la UI — simplemente no actualizar hasta el siguiente.

#### Modo resultado (estado `lista`, `parcialmente lista` o `error`)

Cuando el procesamiento termina, la pantalla transiciona automáticamente al modo resultado (sin que el usuario tenga que recargar — el polling detecta el cambio de estado).

**Header:** mismo que arriba pero con estado final.

**Resumen de resultados:**
- Métricas finales (los 4 contadores, ahora estáticos): `90 planos · 312 materiales · 89 soldaduras · 156 cortes`
- Si hay errores: `87 procesados · 3 con errores`
- Tiempo total de procesamiento: `Procesado en 11 min 23 seg`

**Acción primaria:**
- Botón grande: `Descargar Excel`
- Genera el export si no existe y descarga. El backend ya tiene este endpoint.
- En estado `parcialmente lista`: el botón dice `Descargar Excel (87 de 90 planos)` para que el usuario sepa que es parcial.
- En estado `error` (catastrófico): sin botón de descarga.

**Sección colapsada: `Ver planos individuales`**
- Al expandir: lista de planos con nombre del archivo, estado individual, y si falló el motivo corto.
- Sin acciones sobre planos individuales en v1 (no hay reintentar, no hay ver detalle).

**Footer técnico:** metadata de la OT (id, timestamps, versión del extractor) en estilo Geist Mono con separadores `●`.

**Ruta:** `/ots/:otId`

#### Requisito de backend: endpoint de progreso consolidado

La Pantalla 3 en modo procesamiento necesita un endpoint que no existe hoy. Ver sección 13 para la especificación.

---

## 5. Estados de una OT

Son cuatro estados explícitos, visibles en el listado y en el detalle. El diseño visual debe distinguirlos inequívocamente.

| Estado | Significado | Excel disponible |
|---|---|---|
| `procesando` | Uno o más planos siguen siendo procesados por el backend. | No (al inicio). Sí apenas haya ≥1 plano listo, con aviso de "parcial". |
| `lista` | Los 90 planos terminaron con éxito. Sin errores. | Sí, Excel completo. |
| `parcialmente lista` | Terminó el procesamiento pero N planos fallaron. El resto está ok. | Sí, Excel con los planos ok. Los fallidos se listan al final del Excel o se marcan. Confirmar formato exacto con backend. |
| `error` | Falla catastrófica de la OT completa (ej: el job se canceló, todos los planos fallaron, el backend perdió los archivos). Estado raro. | No. |

**Tratamiento de planos fallidos individuales (opción X confirmada):** no bloquean la OT. El usuario descarga el Excel con los que sí salieron. Los fallidos se registran pero no detienen el flujo. En v1 no hay reintentar selectivo.

---

## 6. Edge cases y estados de error

Casos que la UI debe manejar explícitamente. Para cada uno, qué muestra la UI y qué puede hacer el usuario.

| Caso | Qué muestra la UI | Qué puede hacer el usuario |
|---|---|---|
| API key inválida al login | Error en línea en el formulario de login. | Reintentar con otra key. |
| Sesión expirada (401 mid-flujo) | Redirige a `/login` con mensaje breve ("Tu sesión expiró"). | Volver a ingresar. |
| Error 5xx al crear OT | Toast/banner de error en Pantalla 2 con mensaje genérico. Se conservan los archivos seleccionados. | Reintentar. |
| Archivo PDF rechazado en validación cliente (>50MB, no es pdf, excede 200) | Item marcado en rojo en la lista con la razón. No se sube. | Quitarlo, ajustar, o continuar ignorándolo. |
| Subida de archivo falla a mitad | Item marcado como "error de subida" con botón inline para reintentar solo ese. | Reintentar por archivo. |
| Usuario cierra la pestaña durante la subida | No hay garantía de que todos los archivos hayan subido. Al volver, el detalle de OT muestra solo los que sí llegaron. | Subir los faltantes manualmente si la OT ya existe (feature futura) o crear otra OT. Confirmar comportamiento con backend antes de implementar. |
| Usuario cierra la pestaña durante el procesamiento | Sin impacto. El backend sigue procesando. | Volver cuando quiera. |
| Un plano individual falla durante el procesamiento | La OT pasa a `parcialmente lista` al terminar. El plano aparece en la lista expandible con su motivo de error. | Descargar Excel con lo que sí salió. |
| Todos los planos fallan | Estado `error`. Mensaje visible en el detalle. | Crear nueva OT. En v1 no hay reintentar OT entera. |
| Excel expiró en S3 (410 Gone al descargar) | Toast con mensaje claro. | Click en `Descargar Excel` de nuevo genera un export fresco. |
| Rate limit del backend (429) | Toast breve. | Reintentar en unos segundos. |
| Backend caído (503) o no responde | Banner global en la app. | Esperar y reintentar. |
| OT no existe (404 al abrir detalle) | Mensaje "Esta OT no existe o fue eliminada". Link de volver al listado. | Volver. |

**Principio transversal:** los errores deben ser visibles, accionables y no bloquear toda la app cuando afectan solo una parte del flujo.

---

## 7. Principios de interacción

- **Ninguna acción destructiva sin confirmación explícita.** En v1 no hay eliminación de OTs (es una feature futura), pero cuando exista debe confirmar.
- **Densidad informativa alta.** Los usuarios son expertos. La tabla de OTs debe mostrar mucha info por fila sin chrome innecesario. Referencia conceptual: Linear.
- **Jerarquía tipográfica binaria.** Instrument Sans para todo lo legible, Geist Mono para labels técnicas, identificadores (`OT-045`), timestamps y metadata.
- **Cero decoración gratuita.** Sin ilustraciones, sin ilustraciones de estado vacío, sin iconos en cada fila. Solo lo que aporta información.
- **El naranjo Kronos (#FF5B00) aparece en ≤5% del área visible.** Reservado para la acción primaria por pantalla (ej: `+ Nueva OT`, `Iniciar procesamiento`, `Descargar Excel`). Nunca para decoración.
- **Estados visibles en un vistazo.** El usuario debe entender en 1 segundo qué OT está lista y cuál sigue procesando, ya sea que se quedó mirando o vuelve horas después.
- **Feedback de procesamiento rico, no ansiolítico genérico.** No es un spinner con "procesando...". Son métricas reales del trabajo que la IA está haciendo: contadores de planos, materiales, soldaduras, cortes, y un ETA. El usuario debe sentir que el sistema trabaja, no que espera.
- **Copy en español de Chile, directo, sin jerga de producto.** "Iniciar procesamiento", no "Procesar mi OT ahora". "Descargar Excel", no "Exportar datos".

---

## 8. Componentes y patrones nuevos

Estos son los patrones UI que esta app va a necesitar y que **no existen todavía en el Kronos Design System v0.1.0** (que fue construido alrededor del canónico marketing CTASection.astro). Todos se van a crear primero en lector-planos y contribuir de vuelta al design system en una sesión posterior, como parte del canónico React para apps.

### Componentes propios de app

1. **`AppShell`** — layout base con header fijo, área de contenido, y footer técnico. Contiene navegación mínima, indicador de usuario, logout.
2. **`OTTable`** — tabla densa de OTs con columnas específicas, estados visuales inline, acción de descarga en la fila. Basada en TanStack Table pero con estilos del design system.
3. **`OTStateBadge`** — badge que muestra uno de los 4 estados (`procesando`, `lista`, `parcialmente lista`, `error`). Requiere tokens semánticos de estado (ver sección 9).
4. **`OTProgress`** — indicador compacto de "47/90" con barra fina. Para mostrar en la fila del listado. Versión expandida en el detalle de OT.
5. **`ProcessingDashboard`** — panel de métricas en vivo para la Pantalla 3 en modo procesamiento. Contiene 4 contadores grandes animados (planos, materiales, soldaduras, cortes), barra de progreso global con porcentaje, y ETA calculado. Este es el componente más importante de la app en cuanto a UX — es lo que el usuario mira durante minutos. Requiere polling a 3s y transiciones numéricas suaves.
6. **`AnimatedCounter`** — contador numérico que transiciona suavemente al incrementar (ej: 47→48 con ease, no salto). Usado por ProcessingDashboard. Puede ser una primitiva reutilizable.
7. **`UploadDropZone`** — zona de drop para 1-200 PDFs, con validación visual al vuelo, listado de archivos seleccionados, estados de carga individual y reintentar por archivo.
8. **`PrimaryActionButton`** — botón de acción primaria en estética Kronos. **NO el shimmer button del hero canónico** — algo más funcional, menos marketing, pero consistente con la paleta y tipografía. Este componente probablemente se vuelve el canónico React de botón primario.
9. **`TechnicalFooter`** — footer con metadata estilo `◆ SISTEMA · OT-045 ● 2026-04-05 ● v1.2.0` en Geist Mono. Reutilizable en detalle de OT.
10. **`InlineErrorBanner`** — banner discreto para errores accionables dentro de una pantalla.
11. **`ConfirmDialog`** — diálogo de confirmación para acciones destructivas. Aunque no se usa en v1, definir la primitiva.
12. **`Breadcrumbs`** — ya existe en Frontend A, se rediseña visualmente.

### Tokens nuevos a proponer al design system

El design system v0.1.0 tiene tokens de color para primary, accent y neutrals, pero no tiene tokens semánticos de estado. Esta app los necesita:

- `--color-state-processing` (un azul/neutral, nunca el naranjo accent)
- `--color-state-ready` (neutral + acento tipográfico, no verde genérico — mantener restraint)
- `--color-state-partial` (neutral con matiz de warning, nunca amarillo saturado)
- `--color-state-error` (rojo industrial, probablemente un tono existente del sistema o nuevo)

La propuesta de paleta exacta se resuelve en la sesión de diseño visual, no aquí. Pero queda documentado que esta app **no puede funcionar solo con primary + accent + neutrals**; necesita semántica de estado.

### Patrones que NO aplican del canónico actual

- Shader WebGL de fondo (CTASection.astro) — es pesado y está pensado para un hero que se ve una vez. En una app que se abre 50 veces por semana sería molesto.
- GSAP SplitText reveal dominante — mismo razonamiento. Micro-animaciones sí (foco, hover, transición de estado), reveals cinematográficos no.
- Shimmer sweep en el botón primario — probablemente se reemplaza por un tratamiento más sobrio. La decisión final se toma en la sesión de diseño visual.
- Liquid fill clip-path en botón outline — mismo caso.

---

## 9. Decisión sobre el Frontend A existente

**Decisión confirmada:** mantener la plumbing del Frontend A (`frontend/` en `main`) y reescribir solo el lenguaje visual y la information architecture encima.

### Se conserva

- `src/api/client.ts` — HTTP client con ky, retry logic, manejo de errores por código HTTP.
- `src/api/jobs.ts`, `src/api/spools.ts`, `src/api/exports.ts` — queries y mutations de TanStack Query. Se adaptan al vocabulario OT sin romper el contrato con el backend.
- `src/context/AuthContext.tsx` — auth via X-API-Key, storage en sessionStorage.
- `src/types/api.ts` — esquemas Zod de validación runtime.
- `src/components/ErrorBoundary.tsx` — error boundary raíz.
- Setup de Vite, TanStack Query Provider, React Router, testing con Vitest.
- `vercel.json` — CSP headers, SPA rewrites.
- `package.json` — dependencias base (React 19, Vite, Tailwind v4, TanStack Query/Table, ky, Zod). Se **remueven** Inter y Poppins de las fuentes cargadas.

### Se elimina o reescribe

- `src/pages/*` — todas las páginas. El flujo v1 tiene solo 3 pantallas + login. Las páginas actuales (JobsPage, JobDetailPage, SpoolDetailPage con edición inline) se reemplazan por OTsPage, NuevaOTPage, OTDetailPage.
- `src/components/spools/*` — todo el editor inline de spools, cajetín cards, data tables editables, confidence badges. Fuera de v1.
- `src/components/ui/*` — shadcn primitives instaladas. Se revisan una a una: las que coinciden con el lenguaje Kronos se mantienen con nuevos tokens; las que traen estética genérica (colores genéricos de shadcn) se re-estilizan o reemplazan.
- `src/styles/globals.css` — reemplazado por los tokens del submodule `.design-system/` cuando se añada.
- Fuentes Inter + Poppins — eliminadas, reemplazadas por Instrument Sans + Geist Mono self-hosted del design system.
- Copy en toda la UI — reescrito al vocabulario OT.

### Se archiva completamente

- Rama `sescanellacaceres/REQ-9-frontend-interfaz-de-carga-de-pdfs` (frontend HTML vanilla en `public/`). Obsoleto. Tagear como `archive/REQ-9-vanilla-frontend` y eliminar la rama remota en una limpieza posterior. No bloquea el trabajo actual.

---

## 10. Qué viene después (fuera de esta sesión)

Orden sugerido para las siguientes sesiones:

1. **Diseño visual pantalla por pantalla** sobre los tokens del Kronos Design System. Definir: tipografía exacta por nivel, escala espacial, tratamiento de estados, botones primario/secundario/destructivo, tabla densa, drop zone, breadcrumbs, footer técnico. Entregable: mockups en markdown o Figma + componentes clave tipados.
2. **Añadir el submodule** `.design-system/` al repo de lector-planos. Importar tokens. Eliminar Inter+Poppins. Verificar build.
3. **Implementar componentes base** en `frontend/src/components/`: AppShell, Breadcrumbs, botones, badges de estado, footer técnico.
4. **Reescribir página por página** en orden: Login → Listado OTs → Nueva OT → Detalle OT. Una por PR.
5. **Adaptar `api/*.ts`** al vocabulario OT sin romper contratos de backend.
6. **Tests** por pantalla con Vitest + Testing Library.
7. **Deploy a Vercel** y validación con usuarios reales de KM.
8. **Contribución de vuelta al design system:** extraer `DashboardSection` o equivalente como canónico React en `reference/react/` del kronos-design-system y promover a v0.2.0.

Notas fuera de scope UX pero recordar:
- Rotación de credenciales (pendiente, no bloquea).
- Limpieza de Postgres duplicados en Railway.
- Lifecycle policy S3 de exports.
- Bugs del audit backend (sequential extraction, cache in-memory, etc.).
- Notificaciones (email/webhook al terminar procesamiento).

---

## 11. Preguntas abiertas para validar con usuarios reales

Estas no bloquean el diseño visual, pero conviene validarlas con cotizadores/técnicos reales de KM antes o durante el primer release:

1. ¿"OT" es efectivamente la palabra que usan en el día a día, o en algunos contextos usan "cotización" u "obra"?
2. ¿El identificador corto (`OT-045`) debe corresponder a un número interno de KM existente, o puede ser autogenerado por la app?
3. ¿Cuando falla un plano individual, qué esperan ver en el Excel: una fila con el nombre del archivo y una marca de "no procesado", o simplemente ausencia de ese plano? Esto define el formato del Excel en modo `parcialmente lista`.
4. ¿Hay algún flujo alternativo en el que el cotizador quiera **sumar planos** a una OT ya creada (ej: llegaron 3 planos más del mismo proyecto días después)? Si sí, es una feature que rompe el modelo "una OT es inmutable tras creación".
5. ¿Cuánto tardan realmente 90 planos en el backend actual? Esto **sí importa para la UI** porque define cuánto rato el usuario mira la pantalla de procesamiento y si el ETA debe medirse en minutos o en horas.

---

## 12. Decisiones pendientes para la sesión visual

Estas se resuelven en la próxima sesión, pero quedan listadas aquí para no perderlas:

- Tratamiento exacto del botón primario en Kronos adaptado a app (¿shimmer sí/no, glow sí/no, un tratamiento completamente distinto?).
- Paleta semántica de estados (valores hex concretos que respeten el restraint cromático del sistema).
- Densidad exacta de la tabla de OTs (altura de fila, padding, tipografía por columna).
- Tratamiento del footer técnico: ¿en todas las pantallas o solo en el detalle de OT?
- Micro-animaciones permitidas: ¿transición de estado cuando una OT pasa de `procesando` a `lista`, sí con qué tratamiento?
- Tratamiento del logo Kronos en el header.
- ¿Hay un favicon/og-image que el design system provea?

---

---

## 13. Requisito de backend: endpoint de progreso consolidado

La Pantalla 3 en modo procesamiento necesita datos que el backend actual no expone en un solo endpoint. Se requiere un endpoint nuevo que consolide el progreso de una OT en una sola llamada, para que el frontend haga polling cada 3 segundos sin generar N queries separadas.

**Endpoint propuesto:** `GET /api/v1/jobs/:jobId/progress`

```json
{
  "job_id": "uuid",
  "status": "processing",
  "created_at": "2026-04-06T10:00:00Z",

  "files": {
    "total": 90,
    "completed": 47,
    "processing": 2,
    "failed": 1,
    "pending": 40
  },

  "extracted_data": {
    "materials": 312,
    "unions": 89,
    "cuts": 156
  },

  "elapsed_seconds": 342
}
```

**Notas de implementación:**
- Las métricas de `files` se obtienen de la tabla `pdf_file` (o `spool`) agrupando por `vision_status`.
- Las métricas de `extracted_data` se obtienen con 3 COUNTs sobre `material`, `spool_union`, `cut` filtrando por `job_id` vía los JOINs `pdf_file → spool → material/union/cut`.
- `elapsed_seconds` se calcula como `now() - created_at` del job. El frontend calcula el ETA como: `(elapsed / completed) * remaining`.
- **No requiere cambios en los workers.** Solo es un endpoint de lectura sobre datos que ya existen en la BD.
- Si los COUNTs se vuelven lentos en producción (improbable con 90 planos), se pueden cachear en Redis con TTL de 3 segundos.
- El endpoint GET existente `/api/v1/jobs/:jobId` sigue existiendo para compatibilidad. Este es adicional.

---

**Fin del documento v1.1.** Changelog respecto a v1:
- Pantalla de procesamiento pasa de placeholder a central (feedback en vivo + ETA)
- Flujo dorado: pasos 9-14 reescritos (usuario se queda mirando, no cierra pestaña)
- Componentes nuevos: `ProcessingDashboard`, `AnimatedCounter`
- Principio nuevo: feedback de procesamiento rico
- Sección 13 nueva: endpoint de backend requerido
- Pregunta 5 de sección 11 actualizada (el tiempo de procesamiento sí importa para la UI)
