---
name: synergos-guardrails
description: LÉEME PRIMERO. Onboarding y guardrails del proyecto Synergos — cómo trabajamos, cómo lo hacemos y qué NO hacer NUNCA. Es un proyecto delicado (Umbraco 13 CMS que compone vitrinas SSR + apps Angular custom-element vía CDN local + design system tokenizado, temas por-siteRoot). Actívala al ENTRAR al proyecto o antes de proponer cualquier cambio, para no violar los principios inviolables. Consolida en un solo lugar los principios del árbol del CMS (grafo de dependencias, schema solo uSync no code-first, cero seeders, branding vía provider, no multi-tenant, CDN consumido no owned, GUIDs cuádruple), el modelo de lo que el editor coloca (ADR 0134: funcionalidad o pieza, el CMS da cableado y no la configuración completa, nada se retira por defecto, un elemento con gemela en el design system la monta), la disciplina de medición (un grep es una hipótesis, las cifras las imprime un gate), la premisa capital COMPONER-NUNCA-HARDCODEAR (spacing vía Layout Composer, colores vía tokens --syn-*), la verificación real (build verde ≠ hecho; navegador + todos los temas), el rebuild del runtime compartido, la higiene de commits/DB, y el pin de Umbraco 13. Es el índice que remite a las skills específicas y a los ADRs. Cubre los DOS árboles del repo: el del CMS (Umbraco/uSync/CDN) y el de servicios (capacidades agnósticas + orquestadores sobre Bff.Core), que tienen reglas distintas.
---

# SYNERGOS — Guardrails y forma de trabajo (LÉEME PRIMERO)

Este es un **proyecto delicado**. Muchos cambios que "compilan" igual violan un
principio de arquitectura o rompen la composabilidad. Esta skill es el **índice de
entrada**: lee esto, y salta a la skill específica para la tarea. Cuando dudes, la
verdad canónica vive en `Synergos.CMS/CLAUDE.md` —con las memorias `feedback_*` en su §5—, los
ADRs (`Synergos.CMS.Web/docs/adr/`) y `Synergos.UI/CLAUDE.md`. Dónde está cada repo y cada
carpeta en TU máquina: `references/entorno.md`.

## 0. Qué es Synergos (el modelo mental)

**Un motor, muchos productos.** Umbraco 13 (CMS) **compone** páginas (vitrinas SSR en
Razor) y **monta** apps Angular como **custom elements** (`<synergos-*>`) servidas desde
un **CDN** (en desarrollo, `Synergos.UI/public`, que construye `npm run build:cdn`). La identidad
(color/tipografía/logo) se aplica por **siteRoot** vía **tokens** `--syn-*` y `data-theme`. Los
temas no se copian acá: los enumera —y mide su contraste— `node tools/audit-themes.mjs --all` en
`Synergos.UI`. Cada dominio (Tienda, Booking,
Eventos, Propiedades, Educación, Blogs, Healthcare, Gobierno) es una **app real**, no una
fachada. **Es un producto, no un SaaS multi-tenant**: un deploy = un origen; multi-siteRoot
por hostname nativo de Umbraco.

**Lo que el editor coloca es una de dos cosas** (ADR 0134, Aceptada; §1.bis): una
**funcionalidad** —se nombra por lo que hace, es grande por dentro y hacia el CMS es un tag que
recibe sólo cableado— o una **pieza** suelta, que monta su gemela del design system. Es un
**refinado, no una mudanza**: lo agnóstico (registry, import map, SRI, SynHost, Layout Composer,
tokens) se conserva entero.

## 1. Los principios del árbol del CMS que NO se violan

| # | Principio | Por qué / dónde |
|---|-----------|-----------------|
| 1 | **Grafo de dependencias unidireccional** `Interfaces ← Application ← Web ← Tests`. `Application` NO referencia `Umbraco.Cms.*` ni `Microsoft.AspNetCore.*`. | ADR 0002. La lógica de presentación vive en Web. |
| 2 | **Schema vía uSync XML, NO code-first**. DocTypes/DataTypes/MediaTypes/Dictionary se autoran como XML en `Synergos.CMS.Web/uSync/v9/`. | ADR 0008 · `synergos-usync-author` · `synergos-usync-import` |
| 3 | **Composers centralizados** en `Synergos.CMS.Web/Composers/`. Ningún `IComposer` en Application. | ADR 0005 |
| 4 | **Seeders prohibidos**. Cero seeding automático en boot. El tooling dev va tras flag `Synergos:DevSeed:Enabled`. | ADR 0013 · `feedback_no_automatic_seeders` |
| 5 | **Branding vía provider**, nunca `if (brand.Key == "X")` en core. Usar `IBrandingProvider`/`IBrandThemeProvider`. | ADR 0010/0020 · `feedback_branding_via_provider` |
| 6 | **Framework-agnóstico para CDN**: los blocks CDN son `elementSyn*` (alias) + `<synergos-*>` (tag). El framework se resuelve en runtime, no en schema/C#. | ADR 0015 · `feedback_synhost_naming_convention` |
| 7 | **CDN contract es CONSUMIDO, no owned**. `IBundleRegistryClient` es la seam; cero paths cableados. | ADR 0012 · `feedback_cdn_contract_consumed` |
| 8 | **No multi-tenant SaaS**. Un deploy = un origen. Multi-siteRoot por hostname. Prohibido `ITenantContext` o tenant middleware. | `feedback_product_not_saas_multitenant` |
| 9 | **Tests por seam** (empty/happy/filter/idempotent). Cada seam nuevo ship con tests. | ADR 0075 · `synergos-test-author` |
| 10 | **GUIDs verificados cuádruple** antes de cualquier XML uSync nuevo. El agente escribe XML con GUID fresco; el arquitecto corre Import. | `feedback_no_preassigned_guids_usync` · `feedback_guid_block_element_collision` |

Los del árbol de servicios (capacidades y orquestadores) son otros: `CLAUDE.md` §0.B del CMS,
`synergos-capability-author` y `synergos-bff-author`.

## 1.bis Lo que el CMS coloca, y lo que le da (`CLAUDE.md` §0.C · ADR 0134)

| principio | en una línea | dónde |
|---|---|---|
| **Tres catálogos, dos colocables** | piezas Razor (SSR), piezas del design system, funcionalidades. Lo colocable es **funcionalidad** o **pieza**, y se contesta **antes** de crear, reusar o cablear: se clasifica por **qué necesita recibir** (si le hace falta configuración de negocio o técnica, es funcionalidad). El registry no lo declara todavía | §0.C.19 · doc 12 §5.11 · `synergos-funcionalidad` §1 |
| **El CMS da CABLEADO, no la configuración completa** | a una funcionalidad: sus secciones de diccionario, su configuración de negocio (que el editor no toca), pocas decisiones del editor **como selector**, y la identidad por el runtime. `configOverride` —el JSON libre del editor que pisa todo— es la puerta contraria, no el camino | §0.C.20 · `synergos-funcionalidad` §2 |
| **Regla de los dos pisos** | un elemento publicado con gemela en el design system **la monta**, nunca la reimplementa. Y antes de crear una pieza se busca por **concepto**, no por nombre | ADR 0134 §4 · UI reglas 40-41 · `synergos-funcionalidad` §4 |
| **Nada se retira por defecto** | una pieza sin consumidor es **vocabulario** de la fábrica: se usa, se mejora, se **fusiona** si duplica un concepto, o se declara con su disparador. Que un colocable salga del CMS no es retirar su pieza | §0.C.21 · ADR 0134 §3 · `feedback_the_catalog_is_vocabulary_not_debt` |

**Las ADR 0135 y 0136 están ACEPTADAS** (2026-09-30 y 2026-10-01): el resolver tipado por elemento
es la forma de todo colocable nuevo o tocado (`synergos-cms-author` §5B), y sus textos viajan por las
secciones de diccionario que declara su record. **Las 0137-0139 son PROPUESTAS** —configuración de
negocio fuera del editor, coordinación de página por eventos DOM, bundles con varias entradas— y
describen el rumbo, no lo que ya está. Una skill no las enseña como hechas: qué
se hace HOY con cada una está en `synergos-funcionalidad` §2-§3. Su estado se lee del disco
(`Estado` en cada fichero de `docs/adr/`), no de acá.

## 2. La premisa capital: COMPONER, nunca hardcodear

Todo el look es **código**; el contenido **no**. Nada de contenido baked ni estilos
ad-hoc. Se **compone** en el CMS (Umbraco → front) y se **estila** vía tokens.

- **Contenido y estructura** → se componen en el CMS (Block Grid, element types,
  data types). El editor arma la página; el agente provee los "bloques de Lego".
- **Espaciado** → se **compone** con los knobs del Layout Composer
  (`compDomSpacing`: spacingTop/Bottom/Inline), **NUNCA** con padding/margin en CSS.
  El arquitecto insiste mucho en esto. → `feedback_compose_spacing_via_layout_composer`
- **Color/tipografía/radios/sombras** → tokens `--syn-*` con fallback obligatorio
  (`var(--syn-X, default)`), por `data-theme`. Cero HEX hardcodeado en SCSS de UI.
  → ADR 0094 · `reference_design_line_canonical` · `feedback_design_system_8pt_grid`
- **Lógica pesada** → puede vivir dentro del Angular (si el bloque viene por CDN). Lo
  que NO puede es que el contenido/estilo esté cableado: debe ser ajustable, editable.
- Espaciados = múltiplos de 8 (grilla de 8pt). Auditar `--syn-space-*` antes de aprobar UI.

> Filtro de 3 preguntas antes de crear una `comp*` nueva: ver
> `feedback_composition_design_solid` (doc 06). Preferir los `elementSyn*` de la CDN que
> hidratan, no stubs (`feedback_prefer_cdn_angular_components`).

## 3. Schema, GUIDs y uSync (lo más frágil)

- Schema = **XML uSync** (SSOT). El agente escribe el XML; **el arquitecto corre uSync
  Import manualmente** desde el backoffice. El agente NO ejecuta import ni toca la DB.
- **Pickers por semántica**: URLs→MultiUrlPicker, media→MediaPicker3, enums→Dropdown,
  booleans→TrueFalse. → `feedback_picker_semantics` (ADR 0021)
- **Key nueva** si cambia el `<Type>` (storage). Reusar corrompe data legacy.
- `IsElement` es **inmutable** post-creación (false→true no propaga vía uSync).
- Descripciones editor-facing ≤120 chars, 1 frase, sin jerga ADR.
- Iconos: **no inventar** — verificar contra `tools/umbraco13-icons-stock.txt` del CMS (el stock
  de Umbraco 13; `node tools/usync-audit.mjs` lo cruza con cada `<Icon>`).
- Detalle operativo: `synergos-usync-author` · `synergos-usync-import` · `synergos-schema-audit`.

## 4. Verificar de verdad — "build verde ≠ hecho"

Un `dotnet build` verde y hasta un smoke HTTP verde **NO** garantizan integración viva.
"Hecho" = verificado en navegador.

- ⚠️ **Una verificación mal montada NO es una verificación, y engaña más que no hacerla.**
  Antes de creerte cualquier cifra, corre lo que la refutaría:
  - **curl → query de CONTROL primero.** Un `[FromQuery]` mal nombrado **no falla: devuelve
    TODO**. `?text=` sobre un endpoint cuyo param es `q` no da 400 — da el catálogo entero,
    y tu "filtro funciona" es humo. Corre `?q=xxnoexiste` (debe dar **0**) y compara contra
    el total sin filtro: si tu resultado "filtrado" == el total, no filtró.
    **Los catálogos usan `q`, no `text`** — mirá el `[FromQuery]` del controller antes de armar
    la query. → `feedback_live_check_needs_control_query`
  - **test → mutar y confirmar que FALLA.** Un test que pasa con el código roto es peor que
    ninguno. Si no puedes romperlo a propósito, no prueba lo que dice su nombre.
  - **workflow de revisión → mirar `agents_error` antes que el resultado.** Si los
    refutadores mueren, devuelve `confirmed: []`, que parece un aprobado y es un artefacto.
  - **Desconfía del resultado que confirma demasiado bien.**
- **Hidratación**: `customElements.get('synergos-X') === true` + data real a la vista
  (no `undefined`/`NaN`/mock). → `synergos-app-verify`
- **Contrato CMS↔UI**: la UI es la fuente de verdad; el backend emite las claves que la
  UI lee (ADR 0083). Build verde no atrapa drift de claves JSON. → `synergos-contract-drift`
- **La hidratación puede BORRAR lo que el SSR pintó bien (D1)**: la vista SynHost emite unas
  claves en `config` y el sanitizador del elemento lee otras; el SSR se ve bien, el bundle se pinta
  vacío encima y ningún test lo ve. Se comprueba **ejecutando**, con control. →
  `feedback_hydration_can_erase_what_ssr_painted` (CMS §5) · `synergos-contract-drift` §7 ·
  `synergos-app-verify` §4.bis
- **Regiones vivas**: una región que nace con su mensaje calla; un mensaje de evento se le pide a
  `LiveAnnouncerService`. → UI regla 42 · `synergos-app-verify` §4.ter
- **Todos los temas por-siteRoot**: un token puede romper contraste en UN solo tema. Verificar
  en todos, no solo `light` (`node tools/audit-themes.mjs` en la UI los recorre). → `feedback_verify_all_siteroot_themes`
- **Responsive**: sin overflow horizontal a 375px. El fix se compone/tokeniza.
- **Runtime híbrido**: 3 gotchas de montaje (alias camelCase, `Layout=null` sin
  `_SynHostRuntime`, prop JSON-array como string). → `feedback_synhost_mount_hydration_gotchas`

## 4.bis Medir — cuando una cifra va a decidir algo

La auditoría de reutilización se equivocó tres veces por la forma de la búsqueda, nunca por el
disco. El protocolo entero es `synergos-medir`; lo que no se olvida:

- **Un grep es una hipótesis.** Toda cifra que decide sale de **dos métodos distintos**, y se dice
  cuáles. Las trampas: el sujeto que se cuenta a sí mismo, el tag partido en líneas, la
  indirección. → `feedback_a_grep_is_a_hypothesis` (CMS §5)
- **Las cifras las imprime un gate**; la skill y la guía citan el comando. *Una cifra en una skill
  es una cifra que se va a desviar* (doc 13 §10.1). → `synergos-medir` §3
- **Nada de un agente llega al arquitecto sin comprobar en el disco lo que decide** — y el
  orquestador también se equivoca. → `synergos-medir` §7
- **La máquina de desarrollo no es CI**: los rojos de entorno de Windows se nombran por su test y
  su ticket (#170, UI#79); un rojo fuera de esa lista es real; y **uno sale en verde** (G-7 con
  CRLF). En Windows los tramos de `npm test` se corren sueltos: la cadena `&&` corta en el primer
  rojo. → `feedback_a_dev_machine_is_not_ci` (CMS §5)
- **Un aviso en prosa no es un gate**: antes de mergear algo que depende de otra cosa, *¿qué se
  pone ROJO si lo de fuera no está?* → `feedback_a_merge_order_warning_in_prose_is_not_a_gate`
- **La decisión de producto va antes que el gate**: un gate mide alcance; qué hacer con lo que no
  alcanza nadie lo decide el arquitecto (§1.bis, nada se retira por defecto).

## 5. El runtime compartido (te va a morder si no lo sabes)

`@synergos/shared` está **externalizado** como un único `sg-shared.js` (import map), NO
bundleado en cada app. Si tocas `Synergos.UI/platforms/angular/libs/shared/`, **OBLIGA**
regenerar el runtime, o las apps no hidratan (a veces sin error claro):

```bash
cd "$ui"            # $ui: references/entorno.md
npm run build:cdn    # compila, rehace los runtimes y publica todo en public/, que es lo que lee el CMS
```
Mientras desarrollás, `npm run dev:cdn` rehace el runtime solo cuando tocás `libs/` (ver
`Synergos.UI/CLAUDE.md`). Luego **Ctrl+Shift+R** (el runtime es immutable/versionado; F5 sirve cache viejo). Síntoma:
`customElements.get()=false` / `Failed to fetch dynamically imported module` /
`does not provide an export named 'X'`. → `synergos-cdn-build` · `synergos-app-verify` ·
`feedback_shared_runtime_rebuild_required`.

## 6. Higiene: commits, DB, ops

- **SON VARIOS REPOS GIT, no uno.** Te va a morder el primer día:

  | Repo | Qué contiene | Ojo |
  |---|---|---|
  | `Synergos.CMS` | Todo el C# + Razor + uSync + **los ADRs** | Repo propio |
  | `Synergos.UI` | Angular, Preact, los runtimes y el CDN (`public/`) | Repo propio |
  | `Synergos.Fabrica` | **Este arnés**: las skills, en UNA copia | Los otros dos lo fijan por SHA en `arnes.lock.json` |
  | el contenedor de los clones, si en tu máquina es un repo | `refactor-docs/` (docs rectores + índice §11.2 de ADRs) | **Ignora `Synergos.CMS/` y `Synergos.UI/`** |

  Consecuencia práctica: un cambio backend+UI son **dos commits**, uno por repo, y un
  `git add` que cruce la frontera falla o no ve nada. Un ADR y su fila del índice
  versionado (`docs/adr/README.md`) van juntos en el CMS; el §11.2 de `refactor-docs/`, si tu
  máquina lo tiene, es otro repo. → `synergos-adr-author`
- **El remoto de los repos Synergos es el alias SSH `github-cherced`** (la cuenta CHERCED-DEV):
  `git remote -v` tiene que mostrar `git@github-cherced:CHERCED-DEV/<repo>.git`. La entrada
  `github.com` de la máquina es la **cuenta de trabajo**: un remoto `git@github.com:…` empuja con
  la identidad equivocada. Sin escritura en GitHub no hay ticket, y sin ticket no hay código →
  `synergos-ticket-first` §6.
- **Una sesión, su worktree**: dos sesiones en el mismo disco se pisan. Worktree propio,
  `git status` y fechas al retomar, lo ajeno no se toca, commits con rutas explícitas
  (`git commit -- <rutas>`). → `synergos-medir` §6
- **Commits atómicos** por fase, con prefijo (`feat`/`fix`/`refactor`/`docs`/`chore`),
  subject <70 chars, body con el POR QUÉ. **Nunca mezclar feature + refactor.**
- **La DB nunca se commitea.** Backups SQLite **externos** al repo, en `$SYNERGOS_BACKUP_DIR`
  (`references/entorno.md`). → `feedback_backups_external_to_repo`
- **Operar la DB** solo con el protocolo seguro (stop CMS → checkpoint WAL → backup →
  operar). → `synergos-db-ops`
- **PowerShell** para ops del arquitecto; ediciones bulk con `[IO.File]::WriteAllBytes`
  + BOM (Set-Content da mojibake). → `feedback_powershell_utf8_bulk_edits`
- **No skippear hooks** git (`--no-verify`, `--no-gpg-sign`) sin pedido explícito.
- **Instrucciones backoffice neutrales**: describir intención + metadatos, no el path UI exacto.

## 7. Umbraco 13 — pinned

- **La rama 13 LTS, NO upgrade a 14+** sin un ADR nuevo (14+ descontinuó Macros, cambió Block Grid a
  Lit/TS, requiere .NET 9+). NU1902 (moderate, sin patch en 13.x) es aceptado. → ADR 0001
- **Lo clavado es la RAMA 13 LTS, no un parche**: subir dentro de 13.x no es el upgrade que
  ADR 0001 prohíbe. **La versión exacta no se copia acá**: se lee de `Directory.Packages.props`
  del CMS (`Umbraco.Cms`), donde la vigila `VersionDeUmbracoTests`. Decía 13.13.1 hasta el #149,
  que subió el pin porque apareció un aviso **high** con parche dentro de la rama (NU1903).
  **Y la rama que afirman esta sección y la fila de §8 sí se cruza**: el CI del CMS trae este
  arnés del SHA de su lock y `tools/lock.mjs` compara cada una de esas frases con ese fichero
  (#142). Sacar el arnés del CMS las había dejado fuera de todo gate (#141). Si el pin cambia de
  rama, las frases y la plantilla de ese script se mueven en el mismo commit.
- **Sin Management API para contenido** (esa REST es v14+). El contenido se autora
  **server-side** vía `IContentService` / el motor de fill (`POST /dev/fill-synergos-pages`).
  → `synergos-content-fill` · `synergos-cms-author`
- Trampas runtime: `@inherits UmbracoViewPage<T>` (no existe `IUmbracoHelper`, CS0234);
  BlockGrid server-side siembra multi-value con `"[]"`. → `feedback_razor_inject_inherits_pattern` ·
  `feedback_serverside_blockgrid_authoring`

## 8. Qué NO hacer NUNCA

| ❌ Nunca | ✅ En su lugar |
|---------|----------------|
| Code-first para schema (crear DocType/DataType en C#) | XML uSync + Import manual del arquitecto (ADR 0008) |
| Hardcodear padding/margin en CSS para espaciar secciones | Knobs `compDomSpacing` del Layout Composer |
| Hardcodear HEX de color en SCSS de UI | Tokens `var(--syn-*, fallback)` por tema |
| Bakear contenido en el template o en el DTO | Componer en CMS / poblar el stub o dominio |
| `if (brand.Key == "X")` en core | `IBrandingProvider` / `IBrandThemeProvider` (ADR 0010) |
| Seeder automático en boot | Tooling tras flag `Synergos:DevSeed:Enabled` (ADR 0013) |
| Tenant middleware / `ITenantContext` | Multi-siteRoot por hostname (no SaaS) |
| Cablear paths de bundles CDN | `IBundleRegistryClient` (CDN consumido, ADR 0012) |
| `Application` con `using Umbraco.Cms.*` / `Microsoft.AspNetCore.*` | Application es lógica pura (ADR 0002) |
| Escribir matching/facetado/orden propio en un catálogo | Descriptor declarativo sobre `ICatalogIndex` (ADR 0107). **Si hay que tocar el motor para acomodar un vertical, el descriptor está mal modelado** |
| Un store JSON dedicado nuevo | `IJsonEntityStore` + const `ResourceType` (ADR 0105) |
| Comparar texto es-CO con `.Contains(x, OrdinalIgnoreCase)` | `CatalogText` — pliega tildes y **preserva la ñ** (`año` ≠ `ano`). Sin esto, `"bogota"` devuelve CERO (ADR 0107) |
| Un campo que promete algo y nadie lo cumple (`Scope` sin lector, `Version` sin caché) | Borrarlo. Es peor que no tenerlo: el siguiente confía y el fallo es silencioso (ADR 0107) |
| Pre-asignar GUIDs en C# / reusar Key al cambiar `<Type>` | GUID fresco verificado cuádruple; Key nueva |
| Dar por "hecho" con build verde | Verificar en navegador (`customElements.get` + data + todos los temas) |
| Editar el `*.model.ts`/template Angular para que "calce con el backend" | La UI es fuente de verdad; el backend hace reshape (ADR 0083) |
| Publicar solo bundles de app tras tocar `libs/shared` | `npm run build:cdn` (rehace los runtimes) + Ctrl+Shift+R (§5) |
| Proponer **retirar** una pieza (o una capacidad) porque no tiene consumidor | Es vocabulario: usar, mejorar, fusionar si duplica, o declarar con su disparador. Retirar, sólo con evidencia y decisión del arquitecto (ADR 0134 §3) |
| Darle al editor un JSON (`configOverride`) para configurar una **funcionalidad** | Cableado: diccionario, configuración de negocio fuera del editor, decisiones como selector, identidad por runtime (§1.bis, `synergos-funcionalidad` §2) |
| Crear una pieza nueva buscando por **nombre** en el catálogo | Buscar por **concepto**, incluidas las piezas que no usa nadie; si hay dos del mismo concepto, fusionar |
| Un elemento publicado que **rehace** su gemela del design system | Montarla (tag + import de la clase); si el elemento es mejor, que el DS absorba |
| Una vista SynHost que emite claves que el elemento no lee | Emitir las que conserva su sanitizador, y comprobarlo ejecutando (D1, `synergos-contract-drift` §7) |
| Un literal visible en una funcionalidad, o el diccionario pasado a una hoja | `t()` en la funcionalidad, strings a las hojas (UI regla 44) |
| Enseñar una ADR **Propuesta** como si estuviera hecha | Decir que es propuesta y qué se hace hoy |
| Escribir una **cifra** en una skill o una guía | El comando o el gate que la imprime (doc 13 §10.1, `synergos-medir` §3) |
| Relayar al arquitecto la cifra o la severidad que midió un agente | Comprobar en el disco lo que decide (`synergos-medir` §7) |
| Commitear la DB / mezclar feature+refactor / skip hooks | DB externa; commits atómicos; hooks siempre |
| Correr uSync Import o tocar la DB como agente | Lo hace el arquitecto; el agente escribe XML y avisa |
| Upgrade de Umbraco a 14+ | La rama 13 LTS; la versión, en `Directory.Packages.props` (ADR 0001) |
| `.Root()` cuando quieres el siteRoot | `AncestorOrSelf("siteRoot")` (`.Root()` = platformRoot umbrella → barre todos los siteRoots) |
| 2+ agentes en paralelo sin pedido explícito | Uno, salvo que el arquitecto lo pida; y entonces, `synergos-medir` §7 |

## 9. Mapa de skills — a dónde ir

> **El repo tiene DOS árboles.** Casi todas las skills de abajo son del árbol del
> CMS (Umbraco + uSync + CDN). El árbol de servicios —las capacidades
> `Synergos.Api.*`, `Synergos.Bff.Core` y los orquestadores— tiene reglas
> **distintas**, sus propios gates ejecutables y sus propias skills al final de la
> tabla. Antes de tocar nada, mirá en cuál estás. Ver `CLAUDE.md` §0.A / §0.B.

| Tarea | Skill |
|-------|-------|
| Entender reglas / qué NO hacer | **synergos-guardrails** (esta) |
| **Encontré un bug / voy a abrir un PR** | **`synergos-ticket-first`** — nada se codifica sin ticket |
| **Crear, reusar o cablear algo que el editor coloca** (funcionalidad o pieza) | **`synergos-funcionalidad`** |
| **Una cifra va a decidir algo / repartir una auditoría entre agentes** | **`synergos-medir`** |
| Levantar el stack (CMS+CDN+dev) | `synergos-run-dev` · semáforo: `synergos-health-check` |
| Escribir/editar schema uSync | `synergos-usync-author` → import: `synergos-usync-import` |
| Auditar schema (orphans/drift) | `synergos-schema-audit` · mapa: `synergos-element-inventory` |
| Autorar contenido editorial | `synergos-content-fill` · `synergos-cms-author` |
| Subir una imagen a media | `synergos-media-upload` |
| Compilar y publicar un elemento a la CDN | `synergos-cdn-build` |
| Verificar apps en navegador (hidratación/leaks/temas) | `synergos-app-verify` |
| Smoke post-deploy (HTTP/placeholders/SEO) | `synergos-smoke-test` |
| Arreglar drift de contrato CMS↔UI | `synergos-contract-drift` |
| Enriquecer un dominio best-in-class | `synergos-domain-enrich` |
| Tests de un seam | `synergos-test-author` |
| Escribir un ADR | `synergos-adr-author` |
| Ops de DB (seguras) | `synergos-db-ops` |
| Abrir / cerrar una Ola | `synergos-ola-open` / `synergos-ola-close` |
| Bootstrap + empalme UI del arquitecto | `synergos-architect` |
| **Escribir una capacidad `Synergos.Api.*`** | **`synergos-capability-author`** |
| **Construir un orquestador `Synergos.Bff.*`** | **`synergos-bff-author`** |

## 10. Dónde vive la verdad

| Pregunta | Fuente |
|----------|--------|
| "¿Por qué esta decisión?" | `Synergos.CMS.Web/docs/adr/NNNN-*.md` — índice en `docs/adr/README.md` |
| "¿Esta ADR está aceptada o es propuesta?" | la línea `Estado`/`Status` de su fichero — nunca lo que diga una skill |
| "¿Esto que voy a colocar es funcionalidad o pieza?" | `Synergos.CMS/CLAUDE.md` §0.C · ADR 0134 · doc 12 §5.11 · `synergos-funcionalidad` |
| "¿Qué DATO pide un elemento? ¿Lo puedo reusar?" | **Si tiene resolver tipado** (lo lista `docs/contracts/elementos-synhost.json` del CMS): su `record`, ADR 0135 (Aceptada). **Si no**: su vista `Views/Partials/SynHost/<X>.cshtml` y el sanitizador de su `.ts`, leídos juntos. Nunca por el nombre |
| "¿Cuántos elementos hay? ¿Cuántos publica el CDN?" | No se recuerda: `npm run catalog` en la UI (el registry) y `$CDN_ROOT/registry.json` (lo publicado) |
| "¿Qué piezas del design system no alcanza nadie?" | `npm run gate:design-system` en la UI — y ninguna se retira por eso (§1.bis) |
| "¿Qué DocTypes/DataTypes/Dictionary hay?" | `Synergos.CMS.Web/uSync/v9/` |
| "¿Cómo se integran CMS↔UI?" | `Synergos.CMS.Web/docs/contracts/` (los contratos, ADR 0083) |
| "¿Estado de la migración?" | `refactor-docs/architecture/00-current-state-synergos-cms.md` §11 |
| "¿Guardrails no escritos en ADR?" | `Synergos.CMS/CLAUDE.md` §5 (memorias `feedback_*`) y las reglas de `Synergos.UI/CLAUDE.md` |
| "¿Dónde está cada cosa en MI máquina?" | `references/entorno.md` (las variables `SYNERGOS_*`, `CDN_ROOT`, y cómo resolverlas) |
| "¿Reglas del lado UI?" | `Synergos.UI/CLAUDE.md` (signals only, prefix `syn-`, tokens con fallback) |
