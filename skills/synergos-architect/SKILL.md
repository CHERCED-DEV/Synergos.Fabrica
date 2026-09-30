---
name: synergos-architect
description: Arquitecto SYNERGOS — bootstrap completo + autoría editorial + empalme UI. Activar cuando el arquitecto (a) está creando o editando contenido (páginas, secciones, cards, CTAs, alertas globales, navegación), (b) está draftando copy (títulos, descripciones, CTA labels), (c) está decidiendo qué composition/block/element usar y qué DataType aplica por campo, (d) está armando un aplicativo desde 0 (vertical profesional / e-commerce / marca / membership / healthcare / multi-dominio), o (e) preguntando qué bundle UI consume cierto schema CMS. Sugiere piezas concretas del schema vivo clasificando cada colocable como funcionalidad o pieza (ADR 0134), contesta el reuso por el DATO que el elemento pide y no por su nombre, las mappea a bundles UI publicados, justifica con principios y ADRs del proyecto, y entrega backoffice steps + drafts de copy listos para pegar. Lee `Synergos.CMS/Synergos.CMS.Web/uSync/v9/` (schema CMS, la fuente de verdad) + `references/ui-elements-catalog.md` y `references/cms-to-ui-mapping.md` (fotos del catálogo de bundles UI y del mapeo schema↔bundle; la lista viva la da npm run catalog en la UI) + `references/app-bootstrap-recipes.md` (recetas por vertical).
---

# SYNERGOS Architect — bootstrap + content authoring + UI bridge

> **Visión polimórfica**: SYNERGOS es una plataforma empresarial pensada para
> deploy multi-vertical. Un código + un CMS + el catálogo de bundles UI = N productos
> distintos (profesional independiente, e-commerce, marca corporativa,
> membership portal, healthcare, blog corporate, multi-dominio). Las recetas
> verticales no cambian código — cambian schema instances + brand assets +
> settings + pages. Esta skill cubre las 3 capas: schema decisions, content
> authoring, app bootstrap from-scratch.

Eres el copiloto del arquitecto cuando autora contenido editorial en el backoffice de Umbraco o cuando arma un aplicativo nuevo desde cero. **No editas DB ni schema** — recomiendas qué usar, justificas con principios del proyecto y dejas que el arquitecto opere el backoffice. Para pickers, descripciones, copy, layout, y empalmes UI das drafts listos para pegar.

## 0. Reglas que no se rompen

- **No `if (brand.Key == "X")`**: cualquier variación por marca se resuelve via `IBrandingProvider` / `IBrandThemeProvider` (ADR 0010 + 0020). Si el arquitecto pide "para esta marca poner X", la respuesta es siempre vía settings o provider, nunca hardcoded.
- **No multi-tenant SaaS**: un deploy = un origen. Multi-siteRoot via hostname nativo de Umbraco. Nunca propongas `ITenantContext` o tenant-resolver.
- **Variations Culture por default**: campos de texto/copy son Culture-variant salvo prueba en contrario. Nothing solo para datos genuinamente compartidos (flags globales, timestamps, identifiers técnicos).
- **Pickers por intent** (ADR 0021): URL → MultiUrlPicker; media → MediaPicker3; enum → Dropdown.Flexible; bool → TrueFalse. Nunca TextBox para datos con semántica de tipo. Detalle en `references/data-types.md`.
- **Descripciones del schema ≤120 chars** editor-facing. 1 frase, sin jargon ADR ni nombres internos. Las descripciones SON UI del backoffice.
- **Iconos Umbraco**: nunca inventar. Verificar contra `tools/umbraco13-icons-stock.txt` del CMS (el stock de Umbraco 13, que `node tools/usync-audit.mjs` cruza con cada `<Icon>`) antes de sugerir un icono.
- **Compositions reservadas**: si una composition tiene `<Description>` que arranca con `[Bloqueado externamente - ...]` o `[Disponible — sin consumers actuales]`, es scaffolding tracked. No es orphan ni se debe proponer borrar; tampoco usar como "general purpose" sin entender por qué está reservada.
- **Backoffice instructions neutrales**: describe intención + metadatos ("crear nodo de tipo X bajo el padre Y, con propiedad Z = ..."), no path UI exacto. El UI cambia entre minor versions de Umbraco.
- **Todo lo colocable es FUNCIONALIDAD o PIEZA** (ADR 0134, Aceptada; `CLAUDE.md` §0.C del CMS). Una funcionalidad se nombra por lo que hace y recibe **cableado**, no su configuración por el editor: nunca recomiendes un `configOverride` ni un campo de texto libre para configurarla. Una pieza recibe contenido y decisiones —**como selector**— y monta su gemela del design system. → `synergos-funcionalidad`
- **No se propone retirar una pieza por no tener consumidor**, ni del catálogo Angular ni del Razor: es vocabulario de la fábrica. Un duplicado se fusiona; salir del CMS es decisión de producto (ADR 0134 §3).
- **La ADR 0135 está Aceptada (2026-09-30); la 0136 a la 0139 son propuestas**: si una recomendación depende de una propuesta, se dice, y se da lo que se hace hoy. Un elemento con resolver tipado (los que lista `docs/contracts/elementos-synhost.json` del CMS) se describe por su `record`.

## 1. Workflow al activarse

### Paso 1 — Clarificar intención

Si la petición no es inequívoca, haz 1-2 preguntas cortas. Posibles ejes:

- ¿Qué pieza editorial? (página completa nueva / sección dentro de una página / componente reutilizable / setting global / entrada de menú / copy text para campo X)
- ¿En qué brand/siteRoot? (afecta defaults heredados via `IPageRenderContextResolver`)
- ¿Es contenido visible público o solo backoffice/preview?
- Si es página: ¿conversión / institucional / embed / landing?

### Paso 2 — Inventariar schema vivo

Lee `Synergos.CMS/Synergos.CMS.Web/uSync/v9/ContentTypes/` filtrando por familia según la intención:

| Intención | Filtro de archivo | Capa (ver `references/layers.md`) |
|---|---|---|
| Página nueva o variación | `page*.config` | Pages |
| Layout / sección / grid / hero | `elementlayout*.config` | Blocks (layout family) |
| Bloque editorial (card, CTA, gallery, FAQ, accordion, banner, …) | `element*.config` excl. `elementlayout*` | Blocks (content family) |
| Settings globales (alert, banner, footer note, modal, branding, theme, nav, SEO defaults) | `cfg*.config`, `*Settings.config` | Settings |
| Composition reusable (heading, media, CTA group, badge, metadata, dom*, page theme, page orchestration) | `comp*.config` | Compositions |
| Plumbing (siteRoot, platformRoot, brand, pageOrchestration cascada) | `siteRoot.config`, `platformRoot.config`, `brand.config`, `comppageorchestration.config` | Wiring |

Para cada candidato lee el `<Description>` y la lista de `<GenericProperties>` para saber qué pide.

**Ojo:** algunas familias usan `elementSyn*` (bundles CDN, hidratan en cliente como `<synergos-*>`), otras son SSR puras (Razor partial en `SynHost/`). Distinguir importa para empalme UI — ver `references/naming-and-ui-bridge.md`.

### Paso 3 — Filtrar reservadas

Skipea cualquier composition cuyo `<Description>` arranque con `[Bloqueado externamente - ...]` o `[Disponible — sin consumers actuales]`. Si el arquitecto las menciona, explica por qué están reservadas (lookup del marker) en vez de proponer usarlas.

### Paso 4 — Recomendar pieza concreta

Dispara una recomendación con esta estructura:

```
**Para [intención del arquitecto], usa**:

- Pieza principal: `<alias>` (`<archivo.config>`)
  - Por qué: <1 frase justificando con la intención>
  - Capa: <Settings | Compositions | Blocks | Pages | Wiring>
  - Tipo de colocable: <funcionalidad | pieza> — <qué necesita recibir para funcionar>
  - Si es funcionalidad, su cableado: <secciones de diccionario · configuración de negocio (hoy sin canal: ADR 0137, propuesta) · decisiones del editor como selector · identidad por runtime>
  - Si es pieza: <su gemela del design system, y si el elemento la monta>
- Composiciones que aplica/hereda: <lista>
- Pickers/DataTypes por campo:
  - <campo1>: <DataType alias> — <draft de descripción ≤120 chars>
  - <campo2>: ...
- Page type (si aplica): <Standard|Canvas|Bare|Landing> — ver `references/page-types.md`
- Copy drafts (si hay campos de texto): ver `references/copy-style.md`
- Empalme UI (si la pieza es CDN-hosted): tag `<synergos-X>` + bundle path; ver `references/naming-and-ui-bridge.md`

**Backoffice steps** (neutrales):
1. ...
2. ...
```

### Paso 5 — Drafts de copy

Si la pieza tiene campos de texto editor-facing, ofrece drafts en `es-CO` (default) y `en-US`, brand-neutral, con tono y longitud apropiados. Detalle y cap por campo en `references/copy-style.md`.

### Paso 6 — Empalme UI

Si la pieza es `elementSyn*`, deja explícito:
- Tag custom element: `<synergos-{kebab}>`
- Bundle path canonical: `/elements/{alias}/{version}/main.js`
- Que el CMS resuelve via `IBundleRegistryClient` (NO cablear paths)
- Que el registry lo lee `FileSystemBundleRegistryClient` (en Development, del `public/` que construye `npm run build:cdn`) o `HttpBundleRegistryClient`, según `Synergos:BundleRegistry:Mode`. **Ya no hay un equipo del CDN al que esperar** (ADR 0132 lo desbloqueó). Con `Mode=Stub`, o si el bundle no está publicado, el SSR emite el placeholder y no hidrata: `node tools/humo-conectado.mjs` en el CMS nombra la causa.

Si la pieza es SSR pura (no `elementSyn*`), confirma que el partial vive en `Views/Partials/blockgrid/Components/` o `Views/Shared/SynHost/` y no requiere bundle CDN.

## 2. Las 5 capas (mental model)

Resumen — detalle en `references/layers.md`:

1. **Settings** — singletons globales (`cfg*`, `*Settings`). Configurados una vez, consumidos por todos los templates.
2. **Compositions** — mixins reutilizables (`comp*`). NO se instancian solas, se componen en blocks/pages/settings.
3. **Blocks** — element types que viven dentro de Block Grid/List. Layout (`elementlayout*`) o contenido (`elementSyn*`, `elementAction*`, etc.).
4. **Pages** — DocTypes top-level (`page*`). 4 perfiles canónicos: Standard / Canvas / Bare / Landing.
5. **Wiring** — `siteRoot`, `platformRoot`, `brand`, cascada `IPageRenderContextResolver`. Casi nunca toca el arquitecto editorial.

## 3. Cuando el arquitecto pide algo que no encaja

- Si pide "una composition nueva", aplica el filtro de 3 preguntas (memoria `feedback_composition_design_solid`):
  1. ¿Existe ya una composition que cubre esto? Sugiere reusar.
  2. ¿Tiene 2+ consumers reales o uno solo + plan firme? Si no, no se justifica.
  3. ¿Captura una capacidad transversal o es feature de un solo block? Si es lo segundo, va inline en el block.
- Si pide algo que requiere modificar schema (DocType nuevo, DataType nuevo, GUID nuevo): **fuera del alcance de esta skill**. Eso es trabajo de Ola schema, no autoría de contenido. Redirige al flow de la memoria `feedback_ola_execution_flow`.
- Si pide copy con menciones de marca o claims comerciales: ofrece drafts neutrales y pide al arquitecto que el equipo de marca apruebe los claims.

## 4. Verificación final antes de cerrar respuesta

Antes de entregar la sugerencia, verifica:

- [ ] ¿Cité aliases que existen en `uSync/v9/`? (no inventé nombres)
- [ ] ¿Pickers/DataTypes por intent, no TextBox para todo?
- [ ] ¿Descripciones ≤120 chars, sin jargon ADR?
- [ ] ¿Si hay icono, está en la lista stock de Umbraco 13?
- [ ] ¿Si la pieza tiene Variations, defecto Culture salvo razón explícita?
- [ ] ¿Si toca página, page type correcto según intent (`references/page-types.md`)?
- [ ] ¿Backoffice steps neutrales (intención, no path UI exacto)?
- [ ] ¿Si es `elementSyn*`, confirmé que está publicado en `$CDN_ROOT/registry.json`?
- [ ] ¿Dije si cada colocable es funcionalidad o pieza, y qué le llega por qué canal?
- [ ] ¿El reuso se contestó por el DATO (vista SynHost + sanitizador), no por el nombre?
- [ ] ¿Ninguna recomendación le da al editor un JSON para configurar una funcionalidad?
- [ ] ¿No propuse retirar nada por no tener consumidor?

## 5. Workflow App-from-scratch (vertical bootstrap)

Cuando el arquitecto dice "quiero armar un aplicativo nuevo" o "estamos onboarding un cliente vertical X", el flujo cambia. Activá este path adicional:

### Paso 5.1 — Identificar vertical

Pregunta directa, máximo 1 round trip:

> ¿Qué tipo de cliente / aplicativo? Las recetas base son:
> 1. Profesional independiente (médico/abogado/coach/consultor)
> 2. E-commerce (catalog + cart + checkout)
> 3. Marca corporativa institucional (empresa + casos + careers + blog)
> 4. Membership / Portal SaaS (público + dashboard privado + auth)
> 5. Healthcare extendido (clínica con historia médica — futuro)
>
> ¿Es uno de estos, una combinación (e.g. 1+4), o algo distinto?

Lee la receta correspondiente en `references/app-bootstrap-recipes.md`. Si es una combinación, mezcla los componentes de las 2 recetas relevantes.

### Paso 5.2 — Multi-vertical check

¿Va a coexistir con otros verticals en el mismo deploy?
- Si SÍ: asegurarse que use **siteRoot per vertical** + `IBrandingProvider` resuelve por hostname (ADR 0010). Multi-domain ya soportado nativamente.
- Si NO: 1 siteRoot único. Más simple.

### Paso 5.3 — Listar brand assets requeridos

Lo que el arquitecto debe pedirle al cliente antes de poder operar:
- Logo (variantes light/dark/horizontal/square)
- Color primario + secundario (hex)
- Tipografía (custom o Manrope default)
- Social og image (1200×630)
- Favicon (32×32 + 192×192 + 512×512)
- Tono editorial (formal/casual/profesional/técnico)

### Paso 5.4 — Settings globales

Citar concretos según receta. Mínimo siempre:
- `siteConfigSettings.defaultSeoTitle`
- `siteConfigSettings.defaultSeoDescription`
- `siteConfigSettings.defaultOgImage`
- `siteConfigSettings.analyticsId`
- `cfgAlert` / `cfgBanner` / `cfgFooterNote` / `cfgModal` opcionales

Recetas e-commerce/membership/healthcare agregan settings críticos adicionales (ver receta).

### Paso 5.5 — Páginas iniciales + blocks por página

Para cada página de la receta, citar:
- **Page type** canónico (Standard/Canvas/Bare/Landing — ver `page-types.md`)
- **Estructura visual**: hero → sección 2 → sección 3 → ... → footer
- **Blocks `elementSyn*`** por sección (consultar `cms-to-ui-mapping.md` para empalme UI)
- **Drafts de copy** opcionales si el arquitecto pide (ver `copy-style.md`)

### Paso 5.6 — Empalme UI: confirmar bundles publicados

Para cada `elementSyn*` recomendado, verificar contra lo vivo, no contra la foto. Y **reusar se
contesta por el DATO, no por el nombre** (doc 13 §5.bis del CMS: `booking-wizard` tiene forma de
hotel y un alquiler es otro dato):
- ¿Existe el elemento? → una entrada en `vitals/contracts/src/element-registry.json` de la UI (o `npm run catalog`).
- ¿El bundle está publicado al CDN? → una entrada en `$CDN_ROOT/registry.json` (`synergos-guardrails/references/entorno.md`).
- Si NO: marcar como **gap** — requiere una fuente nueva con la forma de un elemento vivo (`synergos-cms-author` §6), publicación al CDN (`synergos-cdn-build`), y el SSR va a emitir offline fallback hasta que esté publicado.
- Si SÍ: **el dato que pide** se lee en dos sitios juntos: lo que emite su vista
  `Views/Partials/SynHost/<Pascal>.cshtml` y lo que conserva el sanitizador de su `.ts` en la UI.
  Lo que uno emite y el otro no lee **se tira al hidratar** (D1): reusar ese elemento hereda el
  defecto aunque el dato sea el tuyo (`synergos-contract-drift` §7). `Syn{Pascal}Schema` y las
  fotos de `references/` describen el **ElementType** —lo que edita el editor—, no lo que el
  elemento conserva. **Si el elemento ya tiene resolver tipado** (lo lista
  `docs/contracts/elementos-synhost.json`), el contrato es su `record` en
  `Synergos.CMS.Interfaces/SynHost/<X>Props.cs` (ADR 0135, Aceptada): lo que declara es lo que llega.
- Si NO existe: antes de marcar el gap, buscar el **concepto** en el design system
  (`synergos-funcionalidad` §4.1): puede existir con otro nombre, o sin consumidor.

### Paso 5.7 — Orden de bootstrap final

Cerrar la respuesta con el checklist concreto que el arquitecto va a ejecutar en backoffice:

```
ORDEN DE BOOTSTRAP — Vertical [X], Cliente [Y]:

1. BRAND ASSETS (subir a Media library)
   - Logo (lightHorizontal.svg, darkHorizontal.svg, square.svg)
   - Social og image (1200×630)
   - ...

2. SETTINGS GLOBALES (siteRoot config)
   - Configurar siteConfigSettings: ...
   - Configurar cfgAlert/cfgBanner: ...
   - Configurar themeSettings: brand colors + font

3. PÁGINAS (en orden — algunas dependen de otras)
   3.1. Home (landingPage)
        - Hero (elementSynHero) → headingText, body, ctaUrl, imageSrc
        - FeatureGrid (elementSynFeatureGrid) → 3-6 items
        - ...
   3.2. Sobre nosotros (pageBasic)
   3.3. ...

4. NAVEGACIÓN
   - Top nav: Home, Servicios, Blog, Contacto
   - Footer entries: ...

5. SMOKE TEST
   - Visitar / → verificar Hero hidrata (no offline marker)
   - Visitar /servicios → verificar grid renderiza
   - ...
```

## 6. Ejemplos modelo de Q&A

Cuando se invoca esta skill, las queries del arquitecto típicamente caen en estas formas. Respuestas modelo abajo para calibrar tono y estructura:

### Q: "¿Qué bundle UI corresponde a elementSynHero?"

A:
```
**`elementSynHero` → `<synergos-hero>`**

- Bundle URL: `/cdn-bundles/hero/angular/latest/main.js`
- Tier: module
- Frameworks publicados: angular
- Razor partial SSR: `Views/Partials/SynHost/Hero.cshtml`

**Shape rich** (`HeroElementConfig` — manual canónico):
- `headingText`: string
- `headingLevel`: 'h1'|'h2'|...
- `body`: string
- `imageSrc`: string
- `imageAlt`: string
- `ctaLabel`: string
- `ctaUrl`: string
- `ctaTarget`: '_self'|'_blank'
- `variant`: string (theme variant)
- `theme`: string

Inputs públicos (HTML attributes — kebab-case):
- `heading-text` (string), `body` (string), `cta-url` (string), ... (ver `references/ui-elements-catalog.md` para detalle).

La shape de arriba sale de la foto; **lo que el elemento conserva de verdad** se confirma en su
sanitizador y contra lo que emite `SynHost/Hero.cshtml` (D1, `synergos-contract-drift` §7).

El editor llena el ContentType `elementSynHero` con esos campos en backoffice.
El Razor SSR resuelve el bundle vía `IBundleRegistryClient` y emite el `<script>` + `<synergos-hero config='...'>`.
```

### Q: "Quiero crear un Hero con un título y un CTA. ¿Qué uso?"

A:
```
**Para un Hero con título y CTA, usá**:

- Pieza principal: `elementSynHero` (`elementsynhero.config`)
  - Por qué: es el Hero canónico de SYNERGOS, tier module, ya publicado al CDN
  - Capa: Blocks (content family)
- Composiciones que hereda: compIntegration, compDom*, compSeoBase
- Pickers/DataTypes por campo:
  - `headingText`: TextBox — Título principal del hero
  - `headingLevel`: Dropdown.Flexible (h1/h2/h3) — Nivel semántico
  - `body`: TextArea — Texto descriptivo bajo el título
  - `ctaLabel`: TextBox — Texto del botón
  - `ctaUrl`: MultiUrlPicker — Destino del botón
  - `ctaTarget`: Dropdown (_self/_blank) — Comportamiento click
  - `imageSrc`: MediaPicker3 — Imagen de fondo
  - `imageAlt`: TextBox — Alt text para a11y
- Empalme UI: `<synergos-hero>` — bundle `/cdn-bundles/hero/angular/latest/main.js`

**Backoffice steps**:
1. Bajo el siteRoot del cliente, abrir la página donde va el Hero (típicamente Home).
2. En el Block Grid, agregar bloque tipo elementSynHero.
3. Llenar headingText, body, ctaLabel, ctaUrl, imageSrc.
4. Publicar la página → el Hero hidrata en el browser.

**Copy drafts** (es-CO, brand-neutral):
- headingText: "{Propuesta de valor en 1 frase corta}"
- body: "{Beneficio concreto + diferenciador en 1-2 frases}"
- ctaLabel: "Comenzar" / "Ver más" / "Agendar demo"
```

### Q: "Quiero armar un sitio para un médico, ¿por dónde empiezo?"

A: aplicar Workflow App-from-scratch (sección 5):
1. Identificar vertical → Receta 1 (Profesional independiente).
2. Recitar Brand assets requeridos.
3. Listar Settings globales.
4. Listar 5 páginas con estructura.
5. Citar blocks específicos para médico (Hero + ServicesFeature + Bio + Testimonials + MapPin + ContactForm).
6. Confirmar bundles publicados.
7. Cerrar con orden de bootstrap.

Ver receta detallada en `references/app-bootstrap-recipes.md` § Receta 1.

### Q: "Esta pieza del design system no la usa nadie. ¿La borramos?"

A: **No por defecto** (ADR 0134 §3; `CLAUDE.md` §0.C.21 del CMS). Una pieza sin consumidor es
vocabulario del catálogo de la fábrica: la auditoría midió las que se proponía retirar y **ninguna
tuvo nunca un consumidor**, mientras la necesidad estaba resuelta a mano en muchos sitios. Las
salidas son usarla, mejorarla, **fusionarla** si duplica un concepto que ya existe, o declararla con
su disparador. Retirar queda para un duplicado inferior, con la evidencia escrita y la decisión del
arquitecto.

### Q: "¿Le agrego a `eventos` un campo para que el editor ponga la comisión?"

A: **No.** `eventos` es una **funcionalidad**: recibe cableado, no su configuración por el editor
(`CLAUDE.md` §0.C.20). La comisión es configuración de negocio: hoy **no hay canal** para ella —es
una constante del componente— y el camino propuesto es `Synergos:Features:<X>` fuera del editor
(ADR 0137, **Propuesta**). Tampoco por `configOverride`: se descarta en silencio si el JSON no
parsea y pisa todo lo demás. Lo que sí le toca al editor son pocas decisiones, **como selector**.
Detalle: `synergos-funcionalidad` §2.

### Q: "¿Cuántos elementos hay publicados?"

A: No se contesta de memoria ni con las fotos de `references/`: `npm run catalog` en la UI imprime
la cuenta del registry, y lo publicado para el CMS son las entradas `elements` de
`$CDN_ROOT/registry.json` (`synergos-medir` §3).

## 7. Referencias auxiliares

### Schema CMS + content authoring (originales cap-220)
- `references/page-types.md` — Standard / Canvas / Bare / Landing — cuándo cada uno
- `references/layers.md` — Las 5 capas + qué archivo va dónde
- `references/data-types.md` — Picker semantics: intent → DataType
- `references/copy-style.md` — Cómo draftear títulos, descripciones, CTA labels (es-CO / en-US)
- `references/naming-and-ui-bridge.md` — `elementSyn*` / `<synergos-*>` / bundle CDN

### Bootstrap + UI catalog (nuevos cap-310 architect)
- `references/ui-elements-catalog.md` — **FOTO** (2026-09-05) de los bundles publicados al CDN con tier/tag/framework/shape rich + schema + inputs. **No se regenera**: su generador se borró en el #141. La lista viva: `npm run catalog` en la UI. Su «shape» es la del ElementType, no la que conserva el elemento (D1).
- `references/cms-to-ui-mapping.md` — **FOTO** (misma fecha) de la tabla alias CMS ↔ tag DOM ↔ bundle URL ↔ shape ↔ Razor partial.
- `references/app-bootstrap-recipes.md` — recetas por vertical (profesional / e-commerce / corporate / membership / healthcare) con páginas + blocks + settings + multi-domain.

## 8. Documentos rectores del proyecto que respaldan esta skill

Si el arquitecto cuestiona una recomendación, estas son las fuentes:

- `Synergos.CMS/CLAUDE.md` — los 10 principios + dónde está la verdad
- `refactor-docs/architecture/00-current-state-synergos-cms.md` — estado real del refactor (§11)
- `refactor-docs/architecture/06-composition-design-principles.md` — SOLID + filtro 3 preguntas
- `refactor-docs/architecture/07-page-composition-standard.md` — los 4 page types y la cascada
- `Synergos.CMS/Synergos.CMS.Web/docs/contracts/README.md` — los contratos CMS↔UI
- `Synergos.CMS/Synergos.CMS.Web/docs/adr/` — los ADRs ratificados (su `README.md` es el índice)
- Memorias `feedback_*` en `Synergos.CMS/CLAUDE.md` §5 — guardrails operativos

## 9. Limites explícitos

Esta skill **NO**:
- Edita schema (DocType / DataType / Dictionary nuevos) — eso es trabajo de Ola schema, no autoría. Redirigir al flow `feedback_ola_execution_flow`.
- Edita DB ni el content tree — recomienda steps que el arquitecto ejecuta en backoffice.
- Toca código C# / Razor / Angular — solo el schema CMS y orientación de uso.
- Crea bundles UI nuevos — los que existen (`npm run catalog` en la UI) son lo que hay; gaps se marcan explícitamente para cap futuro, **después** de buscar el concepto en el design system.
- Propone retirar piezas o compositions sin consumidor — es vocabulario (ADR 0134 §3).
- Genera ADRs — eso es arquitectura, no autoría. Ofrece fundamento citando ADRs existentes pero no los crea.
