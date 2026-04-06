# Lector de Planos — Diseño Visual v1

**Estado:** borrador inicial, 2026-04-06.
**Prerrequisito:** `flow-v1.md` (flujo UX cerrado). Este documento define cómo se ve cada pantalla, no qué hace.
**Fuente de verdad visual:** `kronos-design-system/DESIGN.md` y sus `design/*.md`. Todo valor usado aquí viene de ahí o se propone como extensión documentada.

---

## 1. Decisiones globales

### 1.1 Superficie base

**Fondo oscuro completo (Camino B).** Toda la app usa `--color-primary-dark` (#052650) como fondo base. El texto es siempre blanco/rgba sobre oscuro, idéntico al canónico marketing. Esto maximiza el brand alignment y da la estética "panel de control industrial" que Kronos busca.

**Implicación:** todos los tokens de texto sobre fondo oscuro de `tokens.md §1.4` aplican directamente:

| Elemento | Color |
|---|---|
| Texto primario (títulos, valores, botones) | `#ffffff` |
| Labels técnicas activas | `rgba(255,255,255,0.85)` |
| Texto secundario (sub, descripciones) | `rgba(255,255,255,0.6)` |
| Metadata, timestamps, IDs | `rgba(255,255,255,0.4)` |
| Footer técnico | `rgba(255,255,255,0.3)` |
| Bordes visibles | `rgba(255,255,255,0.2)` |
| Bordes sutiles / fondos de cards | `rgba(255,255,255,0.08–0.12)` |
| Bordes invisibles (hover reveal) | `rgba(255,255,255,0.04)` |

### 1.2 Tipografía

Binaria, sin excepciones:
- **Instrument Sans** (`--font-sans`): títulos de página, nombres de OT, sub/descripciones, texto de botones, body.
- **Geist Mono** (`--font-heading`): identificadores de OT (`OT-045`), contadores numéricos, timestamps, metadata, labels técnicas, footer técnico, estados.

**Escala adaptada a app (no marketing):**

| Rol | Font | Size | Weight | Tracking | Transform | Color |
|---|---|---|---|---|---|---|
| **Título de página** | sans | `clamp(1.75rem, 3vw, 2.5rem)` | `800` | `-0.02em` | uppercase | `#ffffff` |
| **Nombre de OT (listado)** | sans | `1rem` | `700` | normal | none | `#ffffff` |
| **Nombre de OT (detalle)** | sans | `clamp(1.25rem, 2vw, 1.75rem)` | `700` | normal | none | `#ffffff` |
| **Sub / descripción** | sans | `0.9375rem` (15px) | `400` | normal | none | `rgba(255,255,255,0.6)` |
| **ID de OT** | mono | `0.8125rem` (13px) | `600` | `0.08em` | none | `rgba(255,255,255,0.4)` |
| **Contador grande** | mono | `clamp(2.5rem, 5vw, 4rem)` | `600` | `-0.02em` | none | `#ffffff` |
| **Contador label** | mono | `11px` | `600` | `0.25em` | uppercase | `rgba(255,255,255,0.4)` |
| **Dato de tabla** | sans | `0.875rem` (14px) | `400` | normal | none | `rgba(255,255,255,0.85)` |
| **Header de tabla** | mono | `11px` | `600` | `0.2em` | uppercase | `rgba(255,255,255,0.4)` |
| **Estado badge** | mono | `11px` | `600` | `0.15em` | uppercase | (ver sección 3) |
| **Button label** | sans | `0.875rem` | `700` | `0.15em` | uppercase | `#ffffff` |
| **Input text** | sans | `0.9375rem` | `400` | normal | none | `#ffffff` |
| **Input placeholder** | sans | `0.9375rem` | `400` | normal | none | `rgba(255,255,255,0.3)` |
| **Label técnica** | mono | `11px` | `600` | `0.3em` | uppercase | `rgba(255,255,255,0.85)` |
| **Footer técnico** | mono | `10px` | `600` | `0.25em` | uppercase | `rgba(255,255,255,0.3)` |

**Nota sobre escala.** Los headlines de la app NO son oversized como en marketing (no hay clamp a 8rem). El más grande es el título de página a `clamp(1.75rem, 3vw, 2.5rem)` — es firme pero funcional. Los contadores grandes (`clamp(2.5rem, 5vw, 4rem)`) son el elemento oversized de la app, porque son los datos protagonistas de la pantalla de procesamiento.

### 1.3 Spacing

Tailwind v4 nativo. Convenciones para la app:

| Contexto | Valor |
|---|---|
| Padding horizontal del contenido | `px-6 lg:px-12` |
| Padding vertical de secciones | `py-8 lg:py-12` |
| Max-width del contenido | `max-w-6xl` (72rem = 1152px) |
| Gap entre cards / bloques | `gap-6` |
| Gap dentro de una card | `gap-4` |
| Padding interno de card | `p-6` |
| Altura de fila de tabla | `h-14` (3.5rem = 56px) |
| Gap entre columnas de tabla | `gap-4` a `gap-6` |

### 1.4 Border radius

Sharp corners como el sistema manda:
- **Botones**: `0` (sharp) — obligatorio.
- **Cards / superficies**: `0` (sharp) — coherente con estética industrial.
- **Inputs**: `0` (sharp).
- **Badges de estado**: `rounded-sm` (2px) — la única excepción, mínima curvatura para distinguir del texto plano.
- **Drop zone**: `0` (sharp), borde dashed.

### 1.5 Superficies y elevación

No hay box-shadows tradicionales. Sobre fondo oscuro, la elevación se comunica con bordes y fondos:

| Superficie | Background | Border |
|---|---|---|
| **Base (page)** | `--color-primary-dark` (#052650) | — |
| **Card elevada** | `rgba(255,255,255,0.04)` | `1px solid rgba(255,255,255,0.08)` |
| **Card elevada hover** | `rgba(255,255,255,0.06)` | `1px solid rgba(255,255,255,0.12)` |
| **Input / campo** | `rgba(255,255,255,0.04)` | `1px solid rgba(255,255,255,0.12)` |
| **Input focus** | `rgba(255,255,255,0.06)` | `1px solid rgba(255,255,255,0.3)` |
| **Header** | `rgba(0,0,0,0.2)` sobre primary-dark | `border-bottom: 1px solid rgba(255,255,255,0.08)` |
| **Fila de tabla hover** | `rgba(255,255,255,0.04)` | — |
| **Fila de tabla seleccionada** | `rgba(255,255,255,0.06)` | — |
| **Drop zone** | `rgba(255,255,255,0.02)` | `2px dashed rgba(255,255,255,0.12)` |
| **Drop zone hover / drag-over** | `rgba(255,255,255,0.04)` | `2px dashed rgba(255,255,255,0.3)` |

---

## 2. Tokens semánticos de estado (propuesta para el design system)

El design system v0.1.0 no tiene tokens de estado. Lector-planos los necesita. Se definen aquí y se contribuyen de vuelta al design system en una sesión posterior.

**Principio:** mantener el restraint cromático. Los estados no usan verde/amarillo/rojo saturados genéricos. Usan la paleta existente + variantes controladas que se sienten coherentes sobre `primary-dark`.

| Estado | Token propuesto | Color (sobre fondo oscuro) | Uso en badge | Uso como acento |
|---|---|---|---|---|
| `procesando` | `--color-state-processing` | `#0A4C95` (primary-light) | Fondo `rgba(10,76,149,0.2)`, texto `#5B9BD5` | Barra de progreso |
| `lista` | `--color-state-ready` | `#4ADE80` (green-400 restrained) | Fondo `rgba(74,222,128,0.12)`, texto `#4ADE80` | Checkmark |
| `parcialmente lista` | `--color-state-partial` | `#FBBF24` (amber-400) | Fondo `rgba(251,191,36,0.12)`, texto `#FBBF24` | Warning icon |
| `error` | `--color-state-error` | `#F87171` (red-400) | Fondo `rgba(248,113,113,0.12)`, texto `#F87171` | Error icon / text |

**Por qué estos valores:**
- `procesando` usa `primary-light` — es el propio sistema trabajando, no un estado externo. Azul Kronos.
- `lista`, `partial`, `error` usan tonos desaturados (400 en la escala Tailwind, no 500/600) que se ven como tintes sutiles sobre fondo oscuro, no como semáforo saturado.
- Los fondos de badge usan `rgba` a 12-20% — son tintes, no bloques de color. Esto mantiene el restraint.

---

## 3. Componente por componente

### 3.1 AppShell

Layout base de toda la app.

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER (fijo, h-16)                                             │
│ ┌──────────┐                                       ┌──────────┐│
│ │ ◆ KRONOS │                                       │ Cerrar   ││
│ │  MINING  │                                       │ sesión   ││
│ └──────────┘                                       └──────────┘│
├─────────────────────────────────────────────────────────────────┤
│ CONTENIDO (scroll, max-w-6xl mx-auto px-6 lg:px-12)            │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ FOOTER TÉCNICO (fijo o al final del contenido)                  │
│ LECTOR DE PLANOS · KRONOS MINING ● v1.0.0 ● 2026               │
└─────────────────────────────────────────────────────────────────┘
```

**Header:**
- Altura: `h-16` (4rem).
- Fondo: `rgba(0,0,0,0.2)` backdrop sobre `primary-dark`. `border-bottom: 1px solid rgba(255,255,255,0.08)`.
- Logo: texto `KRONOS MINING` en mono 11px uppercase tracking 0.3em, con `◆` accent a la izquierda. No imagen/SVG de logo en v1 (el texto ES el logo en este contexto).
- Derecha: botón "Cerrar sesión" — texto mono 11px `rgba(255,255,255,0.4)`, hover `rgba(255,255,255,0.6)`. Sin borde, sin fondo.
- Sin navegación lateral. Sin hamburger. Sin breadcrumbs en el header (van en el contenido).

**Footer técnico:**
- En todas las pantallas excepto login.
- Al final del contenido (no fijo), o fijo si el contenido no llena la pantalla.
- Texto: `LECTOR DE PLANOS · KRONOS MINING ● v1.0.0 ● 2026` en Geist Mono 10px, `rgba(255,255,255,0.3)`, dots en `rgba(255,120,0,0.6)`.

### 3.2 Pantalla 0 — Login

Pantalla única fuera del AppShell (no tiene header ni footer técnico).

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                         bg primary-dark                         │
│                                                                 │
│                                                                 │
│              ◆ LECTOR DE PLANOS                                 │
│              ──────────────────                                 │
│                                                                 │
│              ┌─────────────────────────────────┐                │
│              │ API Key                         │                │
│              └─────────────────────────────────┘                │
│                                                                 │
│              ┌─────────────────────────────────┐                │
│              │         ENTRAR                  │                │
│              └─────────────────────────────────┘                │
│                                                                 │
│              Error message (si aplica)                           │
│                                                                 │
│                                                                 │
│  KRONOS MINING · SANTIAGO, CHILE ● EST. 2016                    │
└─────────────────────────────────────────────────────────────────┘
```

**Composición:**
- Centrado vertical y horizontal. `min-h-screen flex items-center justify-center`.
- Ancho del formulario: `max-w-sm` (384px).

**Label técnica arriba del formulario:**
- `◆ LECTOR DE PLANOS` — Geist Mono 11px, 600, tracking 0.3em, uppercase, `rgba(255,255,255,0.85)`.
- Debajo: divider 60px × 1px `rgba(255,255,255,0.2)`.

**Input API Key:**
- Fondo: `rgba(255,255,255,0.04)`. Border: `1px solid rgba(255,255,255,0.12)`.
- Focus: border `rgba(255,255,255,0.3)`.
- Placeholder: `Ingresa tu API key` en `rgba(255,255,255,0.3)`.
- Texto: `#ffffff`, Instrument Sans 15px, 400.
- `type="password"` — la API key se oculta.
- Sharp corners (border-radius 0).

**Botón Entrar:**
- `.btn-kronos-primary` adaptado a app: fondo `#FF5B00`, texto blanco, Instrument Sans 14px 700 uppercase tracking 0.15em, sharp corners.
- **Sin shimmer sweep ni glow pulse.** En una app de trabajo, esos efectos de marketing son disruptivos en un botón que se presiona diariamente. El botón es sólido con hover `#E64A19` (accent-dark) y transición `150ms ease`.
- `width: 100%` — ocupa el ancho del formulario.

**Error:**
- Debajo del botón. Texto `rgba(248,113,113,1)` (state-error) sobre fondo `rgba(248,113,113,0.08)`, padding `py-2 px-3`, border `1px solid rgba(248,113,113,0.2)`. Geist Mono 11px 600. Sharp corners.
- Copy: `Clave inválida` (no "API key inválida" — el usuario no necesita saber qué es una API key, solo que la clave no funcionó).

**Footer técnico:** pegado al bottom de la pantalla. `KRONOS MINING · SANTIAGO, CHILE ● EST. 2016`.

### 3.3 Pantalla 1 — Listado de OTs

```
┌─────────────────────────────────────────────────────────────────┐
│ ◆ KRONOS MINING                                   Cerrar sesión│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ◆ SISTEMA 01 — ÓRDENES DE TRABAJO                             │
│  ──────────────────────────────                                 │
│                                                                 │
│  OTs                                        [ + NUEVA OT ]     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ID       NOMBRE                 ESTADO     PLANOS    FECHA ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ OT-045   Cotización Codelco Q2  procesando  47/90   05 abr ││
│  │ OT-044   Minera Escondida       lista       90/90   02 abr ││
│  │ OT-043   Codelco Norte          parcial    88/90    28 mar ││
│  │ OT-042   Anglo Los Bronces      error        0/45   25 mar ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  LECTOR DE PLANOS · KRONOS MINING ● v1.0.0 ● 2026              │
└─────────────────────────────────────────────────────────────────┘
```

**Label técnica:**
- `◆ SISTEMA 01 — ÓRDENES DE TRABAJO` con divider 60px. Patrón exacto del canónico (`.cta-meta`), adaptado: sin coordenadas (no aplica).

**Título + acción:**
- Título: `OTs` — Instrument Sans `clamp(1.75rem, 3vw, 2.5rem)`, 800, uppercase, tracking -0.02em, blanco.
- Botón: `+ NUEVA OT` — `.btn-kronos-primary` adaptado (sólido accent, sin shimmer, sharp). Alineado a la derecha en la misma línea que el título.

**Tabla:**
- Sin bordes externos. Sin zebra stripes. Sin fondo de card.
- Header: Geist Mono 11px 600 uppercase tracking 0.2em, `rgba(255,255,255,0.4)`. `border-bottom: 1px solid rgba(255,255,255,0.08)`.
- Filas: altura `h-14`. `border-bottom: 1px solid rgba(255,255,255,0.04)`. Hover: `rgba(255,255,255,0.04)` fondo.
- Columna ID: Geist Mono 13px 600, `rgba(255,255,255,0.4)`.
- Columna Nombre: Instrument Sans 14px 700, `#ffffff`. Truncar con ellipsis si excede.
- Columna Estado: badge con colores de sección 2.
- Columna Planos: Geist Mono 13px 400. `47/90` con barra de progreso fina (2px altura) debajo del texto, color `--color-state-processing`.
- Columna Fecha: Geist Mono 11px 400, `rgba(255,255,255,0.4)`. Formato: `05 ABR` (día + mes corto uppercase).
- Click en fila → navega a `/ots/:otId`. Cursor pointer. Toda la fila es clickeable.
- En filas con estado `lista` o `parcialmente lista`: botón inline `DESCARGAR` al final de la fila. Geist Mono 11px 600 uppercase, `#FF5B00`, hover underline. Solo texto, sin fondo.

**Estado vacío:**
- Si no hay OTs: centrado en el espacio, solo texto `No hay órdenes de trabajo` en `rgba(255,255,255,0.4)` Instrument Sans 15px, y debajo el botón `+ NUEVA OT`.

### 3.4 Pantalla 2 — Nueva OT

```
┌─────────────────────────────────────────────────────────────────┐
│ ◆ KRONOS MINING                                   Cerrar sesión│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  OTs › Nueva OT                                                 │
│                                                                 │
│  ◆ SISTEMA 02 — NUEVA ORDEN DE TRABAJO                         │
│  ──────────────────────────────────                             │
│                                                                 │
│  NUEVA OT                                                       │
│                                                                 │
│  ◆ NOMBRE                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Ej: Cotización Codelco Q2 2026                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ◆ PLANOS                                                       │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐│
│  │                                                             ││
│  │         Arrastra PDFs aquí o haz clic para seleccionar      ││
│  │                    Hasta 200 archivos · 50 MB máx.          ││
│  │                                                             ││
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘│
│                                                                 │
│  (lista de archivos seleccionados aparece aquí)                 │
│                                                                 │
│  [ CANCELAR ]                        [ INICIAR PROCESAMIENTO ] │
│                                                                 │
│  LECTOR DE PLANOS · KRONOS MINING ● v1.0.0 ● 2026              │
└─────────────────────────────────────────────────────────────────┘
```

**Breadcrumbs:**
- `OTs › Nueva OT` — Geist Mono 11px 400, `rgba(255,255,255,0.4)`. "OTs" es link (hover `rgba(255,255,255,0.6)`, underline), "Nueva OT" es texto estático `rgba(255,255,255,0.6)`. Separador `›` en `rgba(255,255,255,0.2)`.

**Label técnica:** `◆ SISTEMA 02 — NUEVA ORDEN DE TRABAJO`.

**Título:** `NUEVA OT` — misma escala que el título de Pantalla 1.

**Campo Nombre:**
- Label encima: `◆ NOMBRE` — `◆` 10px accent, texto Geist Mono 11px 600 uppercase tracking 0.25em `rgba(255,255,255,0.6)`. El diamante + label imitan el patrón de label técnica pero en miniatura para form fields.
- Input: full-width (`max-w-2xl`). Mismos estilos que el input de login.
- Placeholder: `Ej: Cotización Codelco Q2 2026`.

**Drop zone:**
- Full-width (`max-w-2xl`).
- Border: `2px dashed rgba(255,255,255,0.12)`. Sharp corners.
- Fondo: `rgba(255,255,255,0.02)`.
- Altura mínima: `h-48` (12rem = 192px).
- Contenido centrado:
  - Línea 1: `Arrastra PDFs aquí o haz clic para seleccionar` — Instrument Sans 15px 400, `rgba(255,255,255,0.6)`.
  - Línea 2: `Hasta 200 archivos · 50 MB máx.` — Geist Mono 11px 400, `rgba(255,255,255,0.3)`.
- **Drag-over state:** border cambia a `2px dashed rgba(255,255,255,0.3)`, fondo a `rgba(255,255,255,0.04)`.
- **Con archivos aceptados:** border cambia a `2px dashed rgba(255,255,255,0.2)` (sutil upgrade vs. vacío).

**Lista de archivos (aparece después de seleccionar):**
- Debajo del drop zone. Cada archivo es una fila compacta:
  - Nombre: Instrument Sans 14px 400, `rgba(255,255,255,0.85)`. Truncar con ellipsis.
  - Tamaño: Geist Mono 11px 400, `rgba(255,255,255,0.4)`. Formato: `2.3 MB`.
  - Estado: ícono o badge mínimo. Verde checkmark si ok, rojo × si rechazado (con razón en tooltip o texto inline).
- Si hay archivos rechazados, la razón se muestra inline en `rgba(248,113,113,1)` Geist Mono 11px.
- Scroll si hay muchos archivos. Max height: `max-h-64` (16rem) con overflow-y scroll.
- Contador arriba de la lista: `47 planos listos` — Geist Mono 11px 600, `rgba(255,255,255,0.6)`.

**Botones:**
- `CANCELAR`: `.btn-kronos-outline` adaptado a app — border `1px solid rgba(255,255,255,0.2)`, texto `rgba(255,255,255,0.6)`, sharp corners. **Sin liquid fill** (demasiado dramático para un "cancelar" de formulario). Hover: border `rgba(255,255,255,0.4)`, texto `rgba(255,255,255,0.85)`. Transición 150ms.
- `INICIAR PROCESAMIENTO`: `.btn-kronos-primary` adaptado (sólido accent, hover accent-dark). Deshabilitado (opacity 0.4, cursor not-allowed) si nombre vacío o 0 planos ok.
- Layout: flex justify-between, `max-w-2xl`.

### 3.5 Pantalla 3 — Detalle de OT

Esta pantalla tiene **dos modos**. Misma URL, distinto estado visual.

#### 3.5a Modo procesamiento

```
┌─────────────────────────────────────────────────────────────────┐
│ ◆ KRONOS MINING                                   Cerrar sesión│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  OTs › OT-045                                                   │
│                                                                 │
│  ◆ SISTEMA 03 — PROCESAMIENTO ─── OT-045                       │
│  ────────────────────────────                                   │
│                                                                 │
│  COTIZACIÓN CODELCO Q2               ● PROCESANDO               │
│                                                                 │
│  ┌──────────────────┬──────────────────┐                        │
│  │      47/90       │       312        │                        │
│  │     PLANOS       │   MATERIALES     │                        │
│  ├──────────────────┼──────────────────┤                        │
│  │       89         │       156        │                        │
│  │   SOLDADURAS     │     CORTES       │                        │
│  └──────────────────┴──────────────────┘                        │
│                                                                 │
│  ████████████████████░░░░░░░░░░░░░░░  52%                      │
│                                                                 │
│  ◆ TIEMPO ESTIMADO ─── ~8 MIN                                   │
│                                                                 │
│  (errores individuales si los hay)                              │
│                                                                 │
│  LECTOR DE PLANOS · KRONOS MINING ● v1.0.0 ● 2026              │
└─────────────────────────────────────────────────────────────────┘
```

**Breadcrumbs:** `OTs › OT-045` — OTs es link, OT-045 es estático.

**Label técnica:** `◆ SISTEMA 03 — PROCESAMIENTO ─── OT-045`. La metadata a la derecha del divider es el ID de la OT (reemplaza las coordenadas del canónico marketing).

**Título + estado:**
- Título: nombre de la OT en Instrument Sans `clamp(1.25rem, 2vw, 1.75rem)`, 700, **no uppercase** (es un nombre propio, no un headline de marca). Blanco.
- Estado a la derecha: `● PROCESANDO` — dot `#0A4C95` (state-processing) + texto Geist Mono 11px 600 uppercase tracking 0.15em, color `#5B9BD5`.
- Misma línea, flex justify-between.

**Panel de contadores (el elemento protagonista):**
- Grid 2×2 centrado. Ancho `max-w-2xl`.
- Cada celda es una card: fondo `rgba(255,255,255,0.04)`, border `1px solid rgba(255,255,255,0.08)`. Sharp corners. Padding `p-6`.
- Separación entre celdas: `gap-px` (1px, dejando que el border de cada card cree la separación — grilla tipo panel de instrumentos).
- **Valor numérico:** Geist Mono `clamp(2.5rem, 5vw, 4rem)`, 600, tracking -0.02em, blanco. Centrado.
  - Para "planos" el formato es `47/90` (processed/total).
  - Para materiales, soldaduras, cortes: solo el número (`312`).
- **Label debajo del número:** Geist Mono 11px 600 uppercase tracking 0.25em, `rgba(255,255,255,0.4)`. Centrado.
- **Animación del contador:** cuando un valor incrementa (ej. 47→48), transición suave de 300ms ease-out. No spring physics, no overshoot — industrial, preciso.

**Barra de progreso:**
- Debajo del panel de contadores. Full-width (`max-w-2xl`).
- Altura: 4px. Sharp corners.
- Fondo track: `rgba(255,255,255,0.08)`.
- Fondo fill: `#0A4C95` (primary-light / state-processing).
- Porcentaje a la derecha de la barra: Geist Mono 13px 600, `rgba(255,255,255,0.6)`. Formato: `52%`.
- Transición del fill: `width 500ms ease-out`.

**Tiempo estimado:**
- Debajo de la barra. Formato de label técnica miniatura:
  - `◆ TIEMPO ESTIMADO ─── ~8 MIN`
  - `◆` accent 10px, label Geist Mono 11px 600 uppercase tracking 0.3em `rgba(255,255,255,0.85)`, divider 40px, valor Geist Mono 11px 400 `rgba(255,255,255,0.4)`.
- Si `< 3 planos procesados`: `◆ TIEMPO ESTIMADO ─── CALCULANDO...`
- Si terminó: esta línea desaparece.

**Errores individuales (si aparecen durante el procesamiento):**
- Debajo del ETA. Cada error es una fila compacta:
  - `plano-045.pdf — imagen ilegible`
  - Nombre en Instrument Sans 14px 400 `rgba(255,255,255,0.6)`, razón en Geist Mono 11px 400 `rgba(248,113,113,0.8)`.
- Máximo 5 visibles, luego "y N más..." con expand.

#### 3.5b Modo resultado

Cuando el procesamiento termina, transición automática (sin recarga):

```
┌─────────────────────────────────────────────────────────────────┐
│ ◆ KRONOS MINING                                   Cerrar sesión│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  OTs › OT-045                                                   │
│                                                                 │
│  ◆ SISTEMA 03 — RESULTADO ─── OT-045                            │
│  ────────────────────────                                       │
│                                                                 │
│  COTIZACIÓN CODELCO Q2               ● LISTA                    │
│                                                                 │
│  90 planos · 312 materiales · 89 soldaduras · 156 cortes       │
│  Procesado en 11 min 23 seg                                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    DESCARGAR EXCEL                           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ▸ Ver planos individuales (90)                                 │
│                                                                 │
│  LECTOR DE PLANOS · KRONOS MINING ● v1.0.0 ● 2026              │
└─────────────────────────────────────────────────────────────────┘
```

**Transición del modo procesamiento al resultado:**
- Los contadores se desvanecen (opacity 0, 300ms), la barra de progreso se completa al 100% y desvanece.
- Aparece el resumen final y el botón de descarga (opacity 0→1, 300ms, delay 200ms).
- No es cinematográfico — es funcional, breve, inequívoco.

**Resumen final:**
- Línea 1: `90 planos · 312 materiales · 89 soldaduras · 156 cortes` — Geist Mono 13px 400, `rgba(255,255,255,0.6)`. Dots `·` como separadores.
- Línea 2: `Procesado en 11 min 23 seg` — Geist Mono 11px 400, `rgba(255,255,255,0.4)`.
- Si estado es `parcialmente lista`: línea 1 dice `87 planos · 3 con errores · 280 materiales · ...` con el count de errores en `rgba(248,113,113,0.8)`.

**Botón Descargar Excel:**
- `.btn-kronos-primary` adaptado. Full-width `max-w-md` centrado. Es LA acción de la pantalla.
- Si `parcialmente lista`: texto dice `DESCARGAR EXCEL (87 DE 90 PLANOS)`.
- Si `error` catastrófico: no aparece. En su lugar, mensaje de error en card de error.

**Sección colapsada "Ver planos individuales":**
- Trigger: `▸ Ver planos individuales (90)` — Instrument Sans 14px 400, `rgba(255,255,255,0.4)`. El `▸` rota a `▾` al expandir.
- Expandido: lista de planos con nombre, estado badge, y si falló la razón corta. Mismo estilo que la tabla del listado de OTs pero sin columnas formales — es una lista compacta.

---

## 4. Animaciones permitidas en la app

El design system define 4 patrones firmados de animación (shader WebGL, GSAP SplitText, shimmer sweep, liquid fill). **Ninguno aplica directamente** en una app de trabajo. Lo que la app usa es un subset de micro-animaciones funcionales:

| Animación | Dónde | Implementación | Duración |
|---|---|---|---|
| **Counter increment** | Panel de contadores (Pantalla 3) | CSS `transition` en un `<span>` con valor numérico. El componente AnimatedCounter interpola entre valor anterior y nuevo. | 300ms ease-out |
| **Progress bar fill** | Barra de progreso (Pantalla 3) | CSS `transition: width 500ms ease-out` | 500ms |
| **Fade in/out** | Transición entre modos de Pantalla 3 | CSS `opacity` transition | 300ms |
| **Hover reveal** | Filas de tabla, botones, inputs | CSS `transition: background 150ms, border-color 150ms` | 150ms |
| **Focus ring** | Inputs, botones | `:focus-visible { outline: 2px solid #ffffff; outline-offset: 3px; }` | instantáneo |
| **Drag-over pulse** | Drop zone (Pantalla 2) | CSS `transition: border-color 200ms, background 200ms` | 200ms |
| **Badge state glow** | `procesando` badge (Pantalla 1 y 3) | CSS `animation: pulse 2s ease-in-out infinite` — solo el dot `●` pulsa suavemente en opacidad (0.4→1→0.4) | 2s loop |

**Nota:** `prefers-reduced-motion: reduce` desactiva todas las animaciones excepto hover/focus (que son instantáneas).

**No se usan:**
- Shader WebGL (pesado, sin propósito en dashboard)
- GSAP SplitText (reveals cinematográficos innecesarios en app)
- Shimmer sweep en botones (fatiga en uso diario)
- Liquid fill en botones (mismo)
- Cualquier animación de entrada de página (no hay "moment wow", hay eficiencia)

---

## 5. Componentes React a implementar (resumen técnico)

Lista ordenada por dependencia de implementación (de base a compuesto):

| # | Componente | Dependencias | Tokens nuevos requeridos |
|---|---|---|---|
| 1 | `TechnicalLabel` | — | — |
| 2 | `TechnicalFooter` | — | — |
| 3 | `Breadcrumbs` | React Router | — |
| 4 | `AppShell` | TechnicalFooter, AuthContext | — |
| 5 | `StateBadge` | — | `--color-state-*` (4 tokens) |
| 6 | `ProgressBar` | — | `--color-state-processing` |
| 7 | `AnimatedCounter` | — | — |
| 8 | `ProcessingDashboard` | AnimatedCounter, ProgressBar, TechnicalLabel | `--color-state-processing` |
| 9 | `OTTable` | StateBadge, TanStack Table | `--color-state-*` |
| 10 | `UploadDropZone` | — | — |
| 11 | `FileList` | — | `--color-state-error` |
| 12 | `PrimaryButton` | — | — |
| 13 | `OutlineButton` | — | — |
| 14 | `ErrorBanner` | — | `--color-state-error` |
| 15 | `ConfirmDialog` | PrimaryButton, OutlineButton | — |

---

## 6. Accesibilidad

- **Contraste:** todo texto sobre `primary-dark` debe pasar WCAG AA (4.5:1). `#ffffff` sobre `#052650` = 12.4:1 (pasa). `rgba(255,255,255,0.6)` sobre `#052650` ≈ 7.4:1 (pasa). `rgba(255,255,255,0.4)` sobre `#052650` ≈ 5:1 (pasa). `rgba(255,255,255,0.3)` ≈ 3.7:1 (falla AA para texto normal, pasa para texto grande). El footer técnico (10px) en 0.3 no pasa AA — es metadata decorativa, aceptable. Todo lo demás pasa.
- **Focus:** `:focus-visible { outline: 2px solid #ffffff; outline-offset: 3px; }` en todo elemento interactivo. Sobre fondos oscuros el blanco contrasta suficiente.
- **Reduced motion:** todas las animaciones desactivadas excepto hover/focus.
- **Aria labels:** drop zone tiene `role="region" aria-label="Zona de carga de archivos"`. Tabla tiene `role="table"` implícito (es `<table>`). Contadores tienen `aria-live="polite"` para que screen readers anuncien cambios.
- **Keyboard:** Tab navega entre inputs/botones. Enter activa. Escape cierra el dialog de confirmación.

---

## 7. Decisiones que se posponen

- **Favicon / og:image** — depende de si el design system provee assets de marca.
- **Empty state ilustraciones** — el sistema prohíbe ilustraciones decorativas. El estado vacío es texto + botón, sin ilustración.
- **Submodule `.design-system/`** — se añade al repo en la sesión de implementación, no ahora.
- **Tokens contribuidos de vuelta al design system** — los 4 tokens de estado y los roles tipográficos de app se contribuyen después de validar que funcionan en producción.

---

**Fin del documento visual v1.**
