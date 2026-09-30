---
name: synergos-funcionalidad
description: Cómo se arma o se extiende lo que el editor coloca en una página de Synergos, con el modelo de ADR 0134 (Aceptada). Primero se clasifica —FUNCIONALIDAD (nombrada por lo que hace, grande por dentro, un tag hacia el CMS, recibe sólo cableado) o PIEZA (colocable suelta que monta su gemela del design system)—; después, qué le llega a cada una y por qué canal (diccionario con t(), configuración de negocio que el editor no toca, pocas decisiones del editor como selector, identidad por el runtime) y nunca la configuración completa por un JSON del editor; qué se hace HOY y qué cambiaría: la ADR 0135 está aceptada y la 0136-0139 son propuestas; y las comprobaciones que cierran el trabajo: el dato que viaja (vista SynHost contra sanitizador, el defecto D1), la regla de los dos pisos, los textos y las regiones vivas. Activar antes de crear, reusar o cablear un elemento colocable, al escribir el S11 de un spec, cuando alguien propone darle al editor un campo JSON para configurar algo, o cuando se discute si una pieza del catálogo sin consumidor se retira.
---

# SYNERGOS Funcionalidad — armar lo que el editor coloca

El arquitecto decidió el modelo al cerrar la auditoría de reutilización: **ADR 0134, Aceptada**, y
`CLAUDE.md` §0.C del CMS (principios 19-21). Es un **refinado, no una mudanza**: se conserva lo
agnóstico —registry por CDN, import map y SRI, SynHost, Layout Composer, tokens `--syn-*` por
siteRoot— y se ordena qué viaja por ahí. De NewShore se tomó **cómo funciona por dentro**, en cinco
ADRs: la 0135 está **Aceptada** (2026-09-30) y la 0136 a la 0139 son **Propuestas**. Esta skill dice
qué se hace HOY y qué cambiaría.

> **Antes de seguir, el estado de hoy, del disco y no de esta skill:**
> `grep -m1 -E "Estado|Status" $cms/Synergos.CMS.Web/docs/adr/013[4-9]-*.md`
> Si alguna de las 0135-0139 ya dice «Aceptado», manda su texto sobre lo que sigue.

Rutas: `synergos-guardrails/references/entorno.md` (`$cms`, `$ui`, `$base`).

---

## 1. Primero se clasifica: ¿funcionalidad o pieza?

Tres catálogos (ADR 0134 §1): las **piezas Razor** del CMS (SSR puro, contenido y SEO), las
**piezas del design system** en `platforms/angular/libs/shared/src/components/` de la UI (el
vocabulario chico) y las **funcionalidades** (apps de vertical y flujos). Lo que el editor coloca
en el Block Grid es una de dos cosas (ADR 0134 §2):

| | **FUNCIONALIDAD** | **PIEZA** |
|---|---|---|
| se nombra | por **lo que hace**: comprar una entrada, radicar un trámite (`eventos`, `gov`, `storefront`) | por lo que es: una valoración, un acordeón (`rating-stars`, `accordion`, `kpi-card`) |
| por dentro | grande: compone piezas del DS, habla HTTP, tiene flujo | chica: **monta su gemela del DS** |
| hacia el CMS | **un** tag, y sólo cableado | contenido y decisiones del editor + una sección de diccionario |

**Lo que las separa no es el tamaño: es qué necesita recibir para funcionar** (doc 12 §5.11,
pregunta 1). Si le hace falta configuración de negocio o técnica —moneda, comisión, alcance, un
endpoint—, o identidad de la sesión, o es el shell de un vertical, es una **funcionalidad**, y esa
configuración **no la escribe el editor**.

El registry **todavía no lo declara** (no hay `kind` junto al `tier`): hoy se infiere, y la
clasificación **se escribe** —en el spec (S11), en el ticket o en el PR— con su razón, para que la
próxima persona pueda discrepar con algo delante.

---

## 2. Qué le llega a cada una, y por qué canal

| canal | funcionalidad | pieza | HOY | si se acepta la propuesta |
|---|---|---|---|---|
| **Contenido por instancia** (títulos, textos, imágenes) | poco (título, bajada) | sí | propiedades del ElementType (uSync) → el resolver las pone en el `record` del elemento (ADR 0135, Aceptada); en los que todavía no migraron, la vista las mete en `config` | igual |
| **Decisiones del editor** (variante, mostrar/ocultar, página destino) | **pocas** | sí | **como selector, nunca texto libre**: `DTSelect*`/Dropdown.Flexible, TrueFalse, pickers (ADR 0021). Un editor que teclea un enum lo teclea mal | igual |
| **Textos de la UI** (labels, errores, `aria-*`) | la funcionalidad **traduce** con `t(clave, respaldo)` | la pieza colocable declara su sección y traduce lo suyo; una **hoja** del DS recibe strings por input | `t` se importa de `@synergos/vitals-core`; la clave vive en uSync y **tiene que caer en un prefijo que el bridge publica** (`I18nKeyPrefixes` de `HostBridgeSettings`), o sale siempre el respaldo y parece traducida (UI regla 44) | cada elemento declara sus secciones; fallback por clave a la cultura por defecto, en el servidor (ADR 0136) |
| **Configuración de negocio** (moneda, comisión, endpoints, alcance) | sí — y el editor **no** la toca | **no**: una regla es una decisión del editor como selector, un ajuste es una constante | **no hay canal**. No se inventa uno: constante del componente con su default, y la deuda anotada en el ticket citando la ADR 0137. Nunca `configOverride`, nunca `environment.*.ts`, nunca JSON dentro de un string | `Synergos:Features:<X>` tipada, `IOptionsMonitor`, override por siteRoot **por fusión de claves**; llega sólo por el resolver (ADR 0137) |
| **Identidad, ruta, sesión** | sí | — | `window.synergos.member` (`getMember()` de `@synergos/vitals-core`); nunca un campo del editor con un paciente o un usuario por defecto | igual |
| **La forma de lo que viaja** | | | en los elementos con resolver tipado (los que lista `docs/contracts/elementos-synhost.json`), un `record` C# atado al `name` del registry: el tipo TS se genera de él y D1 no compila (ADR 0135, Aceptada; `synergos-cms-author` §5B). En los que faltan, la vista arma un diccionario libre y el **sanitizador** decide qué conserva: **tienen que coincidir** (§5.1) | todos migrados (piezas: #180; funcionalidades, tras la ADR 0137) |

### `configOverride` no es el camino

Es el JSON libre del editor que casi todas las vistas SynHost pasan (ADR 0015 §1): se fusiona
**encima** de todo lo demás y, si no parsea, se descarta **en silencio** (`DefaultSynHostEmitter`).
Es exactamente «pasar la configuración completa desde el CMS», lo que el arquitecto no quiere
(`CLAUDE.md` §0.C.20). **Si una funcionalidad necesita un `configOverride` para arrancar, lo que
falta es una de las filas de arriba, no un campo más en el backoffice** (doc 12 §5.11, pregunta 2).

Hoy sigue en el schema: sacarlo de un ElementType es cambio de schema (ADR 0008) y lo importa el
arquitecto. La ADR 0135 (Aceptada) lo saca de las funcionalidades y, en las piezas con resolver, sólo
pisa los campos que el record declara; medido el 2026-09-30, ningún contenido de la base lo usa.
Quitarlo del schema sigue siendo una decisión aparte.

---

## 3. Armar (o extender) una funcionalidad

1. **Grande por dentro, un tag hacia el CMS.** Una funcionalidad no expone su configuración interna
   al editor (ADR 0134 §2).
2. **Por dentro compone piezas del DS** y las **monta**; no las reescribe (§4). Si le falta una, se
   busca por concepto antes de crearla (§4.1).
3. **Traduce ella**: `t('Seccion.Clave', 'respaldo es-CO')` en la funcionalidad; a sus hojas les
   pasa el texto ya traducido por input. No se pasa el diccionario de mano en mano (lo que NewShore
   hace y la ADR 0136 no copia). El diccionario **no** es un catálogo de datos maestros: nombres de
   ciudades o categorías van en su origen (la API los resuelve en el servidor, como las fichas de
   Realty y Gobierno).
4. **Lee la identidad del runtime**, no del editor.
5. **Lo compartido entre apps va a una lib; una app no importa otra app** (ADR 0113). Si necesita
   otro elemento dentro, lo **embebe** declarando `dependencies` en
   `vitals/contracts/src/element-registry.json` (ADR 0126/0127): ese elemento no lleva DocType.
6. **Coordinación con otros widgets de la página: hoy no existe.** Cada vertical se coordina por
   dentro. No se inventa un bus ni un objeto con estado en `window.synergos`: choca con la premisa
   de `docs/contracts/dom-events.md` («no hay shared store»). La ADR 0138 propone un protocolo de
   eventos DOM; mientras sea propuesta, un caso que lo necesite va a su ticket.
7. **Varias entradas colocables que comparten estado: hoy no.** Un bundle es un elemento, y dos
   bundles que importan la misma lib tienen cada uno su instancia (ADR 0113). La ADR 0139 propone
   varias entradas por bundle con un store de módulo; hasta que se acepte, una pieza que tiene que
   mostrar el estado de su funcionalidad es un caso para ese ticket, no un store global.

---

## 4. Armar (o extender) una pieza

### 4.1 Antes de crear: buscar en el catálogo por CONCEPTO

Por nombre no aparece. Así nació `syn-segmented` al lado de `syn-segmented-control` —el mismo
selector exclusivo, dos veces— y así se pidió «crear» un resumen con enlace *Cambiar* que ya era
`syn-detail-summary` (doc 12 §5.11, pregunta 4; UI regla 40).

- Se busca **qué hace** («elegir uno de varios», «repasar lo que se va a enviar», «avisar un
  resultado») entre **todas** las piezas del DS, **incluidas las que no usa nadie**: las de la línea
  base de `npm run gate:design-system` (`tools/consumidores-del-design-system.baseline.json` de la
  UI) son vocabulario, no restos.
- Dos métodos (`synergos-medir` §1): los nombres y las plantillas de
  `libs/shared/src/components/**`, **y** la semántica —el rol ARIA (`role="radiogroup"`,
  `role="dialog"`, `role="tablist"`), el `aria-pressed`, el tipo de control—.
- Si existe y le falta algo, **se mejora**. Si hay dos del mismo concepto, **se fusionan**: la que
  sobrevive absorbe lo mejor de las dos (ADR 0134 §3).

### 4.2 La regla de los dos pisos

**Un elemento publicado que tiene gemela en el DS la monta; nunca la reimplementa** (ADR 0134 §4,
UI regla 41). Montarla es que su plantilla use el tag `<syn-x>` **y** importe la clase del DS que lo
declara; importar `Badge` y `Button` y rehacer la tarjeta no es montar la tarjeta.

- Si el elemento es **mejor** que la pieza, el DS **absorbe** lo mejor y el elemento queda como host
  delgado.
- Si comparten nombre y son **dos conceptos** (`stepper`: un indicador de pasos contra un `+/-`
  numérico), no se fusionan: se renombra el que cuesta menos.
- Convertir un elemento en host delgado **pierde** lo que al DS le falte: colores fijos que no
  siguen el tema por siteRoot, textos en inglés. Tokens e i18n de la pieza son prerrequisito de la
  conversión, no un detalle (ADR 0134, consecuencias).

---

## 5. Las comprobaciones que cierran el trabajo

### 5.1 El dato que viaja (D1)

**La hidratación puede borrar lo que el SSR pintó bien, y ningún test de SSR lo ve** (`CLAUDE.md`
§5 del CMS, `feedback_hydration_can_erase_what_ssr_painted`; UI regla 43). La vista
`Views/Partials/SynHost/KpiCard.cshtml` emite `kpiLabel` y `kpi-card` lee `label`: el SSR sale con
el texto del editor y el bundle se pinta vacío encima.

1. **Lo que emite la vista**: las claves del diccionario de props de
   `Views/Partials/SynHost/<X>.cshtml` (más las de `configOverride`, si el editor escribió algo).
2. **Lo que conserva el elemento**: el `sanitize*`/`normalize*` que su `.ts` pasa a
   `createConfigInputTransform`, en `platforms/angular/apps/elements/<tier>/<x>/`.
3. Toda clave emitida se lee; toda clave leída se emite o tiene un default legítimo. **El nombre lo
   elige lo que el elemento lee** (ADR 0083): se corrige la vista, no el elemento.
4. **Se comprueba ejecutando**: un spec de la UI que alimente el `config` **exacto** que emite la
   vista, no el que el elemento espera (UI regla 43), y en vivo con su control
   (`synergos-app-verify` §4.bis). La mitad API de este mismo problema es `synergos-contract-drift`.

Para **reusar** un elemento existente es la misma comparación: *¿qué DATO pide, y es el mío?* —
nunca por el nombre (doc 13 §5.bis del CMS). Reusar uno con D1 **hereda el defecto** aunque el dato
sea el tuyo.

### 5.2 Los dos pisos

El elemento monta su gemela, contado con las dos señales y **sin** el fichero del propio elemento
(`synergos-element-inventory` §5.bis). El gate que lo vigilaría está propuesto y no construido
(ADR 0134, «Qué la vigila»).

### 5.3 Textos

Ningún literal visible nuevo en una funcionalidad sin `t()`; cada clave existe en
`uSync/v9/Dictionary/` con el formato del disco (`synergos-usync-author` §7) y cae en un prefijo
publicado; las hojas no saben que existe un diccionario.

### 5.4 Regiones vivas

**Una región viva no nace con su mensaje**: tiene que existir antes de que el texto cambie, o el
lector de pantalla calla (UI regla 42). Un mensaje de **evento** —agregado al carrito, página
cargada, copiado— se le pide a `LiveAnnouncerService`
(`libs/shared/src/services/live-announcer.service.ts`); una región propia, sólo si existe desde el
primer render y su texto cambia después; y un reloj **se describe** en su `aria-label`, no se
anuncia cada segundo. Se comprueba en el navegador: `synergos-app-verify` §4.ter.

### 5.5 Lo de siempre

Hidrata, sin leaks, sin overflow a 375px, en todos los temas por siteRoot: `synergos-app-verify`.

---

## 6. Nada se retira por defecto

- **Una pieza sin consumidor es vocabulario del catálogo de la fábrica, no deuda.** Las salidas
  son usar, mejorar, **fusionar** si duplica un concepto, o declararla con su disparador. Retirar
  queda para un duplicado inferior cuya fusión no aporta nada, **con la evidencia escrita** (ADR
  0134 §3, `CLAUDE.md` §0.C.21, `feedback_the_catalog_is_vocabulary_not_debt`).
- **Que un colocable salga del CMS no es retirar su pieza.** Para que salga hacen falta dos
  preguntas con evidencia —*¿lo coloca algún DocType?* y *¿tiene efecto lo que el editor elige?*— y
  una **decisión de producto**, que no toma un agente.
- Lo mismo vale para una capacidad del backend sin segundo consumidor: `synergos-capability-author`.

---

## 7. Qué NO hacer

| ❌ No | ✅ En su lugar |
|---|---|
| Crear, reusar o cablear sin decir si es funcionalidad o pieza | Clasificar por lo que necesita recibir y escribirlo (§1) |
| Darle al editor un JSON (o un `configOverride`) para configurar una funcionalidad | El canal que corresponde de §2; si no existe, constante + deuda anotada (ADR 0137) |
| Un campo de texto libre para una decisión del editor | Un selector (ADR 0021) |
| Un literal visible en una funcionalidad, o pasar el diccionario a una hoja | `t()` en la funcionalidad; strings a la hoja |
| Una clave de diccionario fuera de los prefijos que el bridge publica | Una sección publicada, o se pide en el ticket (ADR 0136) |
| Leer la identidad de una propiedad del editor | `window.synergos.member` |
| Crear una pieza buscando por nombre | Buscar por concepto, incluidas las piezas sin consumidor (§4.1) |
| Un elemento que reimplementa su gemela del DS | Montarla; si el elemento es mejor, que el DS absorba (§4.2) |
| Proponer retirar una pieza porque nadie la usa | Usar, mejorar, fusionar o declarar (§6) |
| Enseñar las ADR 0136-0139 como hechas | Decir «Propuesta» y qué se hace hoy (§2, §3) |
| Escribir una vista SynHost nueva con diccionario libre | `record` + resolver + vista de dos líneas (`synergos-cms-author` §5B; ADR 0135) |
| Dar por bueno un colocable porque el SSR se ve bien | Vista contra sanitizador, ejecutado (§5.1) |
| Un bus o un store en `window` para coordinar widgets | Coordinar por dentro; el caso, a su ticket (ADR 0138) |

**Relacionadas:** `synergos-architect` (recomendar qué colocar) · `synergos-cms-author` (crear el
ElementType, la vista y el elemento) · `synergos-contract-drift` (D1 y el drift de la API) ·
`synergos-app-verify` (comprobarlo en el navegador) · `synergos-element-inventory` (los dos pisos
en el inventario) · `synergos-medir` (cómo se cuenta lo que decide).
