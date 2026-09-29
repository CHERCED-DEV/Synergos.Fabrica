---
name: synergos-cms-author
description: Authoring full-stack del SCHEMA de Synergos CMS — cuando no existe el ElementType/Composition/DataType necesario, lo crea completo (uSync XML + Razor view SynHost + componente Angular standalone), leyendo el schema vivo de uSync/v9/. El contenido editorial y la media no los crea esta skill: se autoran server-side (IContentService/IMediaService detrás del flag DevSeed) con synergos-content-fill y synergos-media-upload.
model: claude-opus-4-8
---

# SYNERGOS CMS Author — full-stack schema + content + media

Skill integral que cubre tres capas en un solo flujo:

1. **Schema** — crea ElementTypes, Compositions y DataTypes (uSync XML) cuando no existe el adecuado.
2. **Razor views** — crea los partials SynHost + Block Grid wrappers para SSR.
3. **Angular components** — crea el stub del Web Component (standalone, zoneless, signal inputs).
4. **Content** — NO es de esta skill: el contenido se autora server-side → `synergos-content-fill`.
5. **Media** — NO es de esta skill: generar y registrar imágenes → `synergos-media-upload`.

---

> ## ⚠️ AVISO (ADR 0093) — La autoría de contenido NO usa la Management API
> Umbraco 13 **no tiene Management API** (`/umbraco/management/api/*` → 404; el paquete `Umbraco.Cms.Api.Management` empieza en v14). Esta skill vivía de un flujo token + POST que no existe en este stack, y **se cortó** (#141): para crear/llenar contenido y media usa la vía server-side `IContentService`/`IMediaService` detrás del flag DevSeed — **`synergos-content-fill`**, **`synergos-media-upload`** y **ADR 0093**. Lo que queda acá es schema (uSync XML §2-§4), Razor (§5) y Angular (§6).

## 0. Reglas que no se rompen

- **Culture-variant por default** — todos los campos de texto van con `culture: "es-co"`. `Nothing` solo para flags/enums globales.
- **Pickers por intent** (ADR 0021): URLs → `DTUrlPickerSingle` (MultiUrlPicker MaxNumber=1); media → `MediaPicker3`; enums → `Dropdown.Flexible`; bool → `TrueFalse`.
- **GUID quad-check** antes de escribir cualquier XML uSync nuevo — nunca reusar un GUID existente.
- **uSync = source-of-truth** (ADR 0008) — schema se escribe en XML. Nunca code-first.
- **Composer no se toca** para schema nuevo — solo para wiring de seams.
- **Naming conventions**: `elementSyn{Pascal}` → `<synergos-{kebab}>` → Razor `SynHost/{Pascal}.cshtml`.
- **Angular standalone + zoneless** — `provideZonelessChangeDetection`, signal inputs, `createCustomElement`.
- **No seeders en boot** (ADR 0013) — content creation solo cuando el usuario invoca esta skill.
- **Alt text obligatorio** en toda imagen subida (WCAG 1.1.1).
- **Compositions reservadas** — skipear si `<Description>` arranca con `[Bloqueado externamente -` o `[Disponible — sin consumers`.

---

## 1. Pre-flight

Escribir schema no necesita el CMS corriendo: es XML en el disco. El CMS hace falta para el Import
(lo corre el arquitecto) y para verlo en el backoffice.

```powershell
# $cms, $ui, $base: synergos-guardrails/references/entorno.md
try { Invoke-WebRequest "$base/_health" -UseBasicParsing -TimeoutSec 5 | Out-Null; Write-Output "CMS OK" }
catch { if ($_.Exception.Response) { Write-Output "CMS arriba, con alguna probe en rojo" } else { Write-Warning "El CMS no contesta en $base — hará falta para el Import (synergos-run-dev)" } }
```

---

## 2. Descubrimiento de schema — 100% awareness

### 2A. Encontrar ElementTypes por familia

```powershell
$schemaRoot = Join-Path $cms "Synergos.CMS.Web\uSync\v9\ContentTypes"

# Por familia:
Get-ChildItem $schemaRoot "elementSyn*.config"     # CDN-hosted (elementSynHero, etc.)
Get-ChildItem $schemaRoot "elementLayout*.config"  # Layout presets
Get-ChildItem $schemaRoot "elementAction*.config"  # Botones, links
Get-ChildItem $schemaRoot "elementMedia*.config"   # Media, gallery, avatar
Get-ChildItem $schemaRoot "elementInfo*.config"    # Stat, FAQ, badge
Get-ChildItem $schemaRoot "elementCorp*.config"    # Corporate blocks
Get-ChildItem $schemaRoot "elementComp*.config"    # Composable blocks (Hero, Card, CtaBanner)
Get-ChildItem $schemaRoot "elementForm*.config"    # Form fields
Get-ChildItem $schemaRoot "elementShop*.config"    # E-commerce
Get-ChildItem $schemaRoot "elementMember*.config"  # Auth / member
Get-ChildItem $schemaRoot "elementNav*.config"     # Navigation
Get-ChildItem $schemaRoot "elementFlow*.config"    # Flows
Get-ChildItem $schemaRoot "elementInt*.config"     # Integraciones (iframe, script)
Get-ChildItem $schemaRoot "elementStruct*.config"  # Dividers, spacers
Get-ChildItem $schemaRoot "comp*.config"           # Compositions
Get-ChildItem $schemaRoot "page*.config"           # Page types
Get-ChildItem $schemaRoot "cfg*.config"            # Global settings
```

Para leer un schema específico:
```powershell
[xml]$schema = Get-Content "$schemaRoot\{alias}.config" -Encoding UTF8
$key           = $schema.ContentType.Key
$isElement     = $schema.ContentType.Info.IsElement
$variations    = $schema.ContentType.Info.Variations
$compositions  = $schema.ContentType.Info.Compositions.Composition | Select-Object -ExpandProperty "#text"
$props         = $schema.ContentType.GenericProperties.GenericProperty | ForEach-Object {
    [PSCustomObject]@{ Alias=$_.Alias; Type=$_.Type; Definition=$_.Definition
                       Mandatory=$_.Mandatory; Variations=$_.Variations; Tab=$_.Tab }
}
```

### 2B. GUIDs canónicos — Compositions (referencia fija)

| Alias | Key |
|-------|-----|
| compCoreBase | `5e2ec6b8-7f65-4c26-8c20-1b9a72bed2f8` |
| compSeo | `85e75635-b950-4583-b5ca-2a51c08892e3` |
| compDomClass | `46367d43-269b-418d-b54d-075fcf6d658b` |
| compDomVariant | `e11a9feb-fa1c-4740-9481-3dce56748473` |
| compDomVisibility | `7a383458-6ea6-4784-a4d1-17f8d4b01073` |
| compDomAttributes | `1d5bafbb-59af-4002-8709-ebade1be0392` |
| compDomSpacing | `0a2edb7e-8555-4044-bebc-bf0fe37662f2` |
| compDomDisplay | `f79a6dcc-aecd-4a2b-bd1e-0de3e08eb800` |
| compDomFlex | `610e39a0-bfd1-4786-9ddb-697884da5d4b` |
| compDomGrid | `b0bed49d-e17d-4da3-a0ec-453dcb9948f7` |
| compDomPresetChrome | `7ae5dcf3-5ed1-4ea1-a4e1-cc3a4a474138` |
| compContentHeading | `eb4bd93f-f9d1-44dd-b85e-d64b2084a3ad` |
| compContentText | `71d74897-c807-452c-83c3-04c94fd1414b` |
| compContentMedia | `e2a29901-8155-4d36-80ab-f42b2452a45b` |
| compContentCta | `92cb0070-0f4d-43a0-84a7-102f60dc41b4` |

### 2C. GUIDs canónicos — DataTypes base

| Alias | Key | EditorAlias |
|-------|-----|-------------|
| Textstring | `0cc0eba1-9960-42c9-bf9b-60e150b429ae` | Umbraco.TextBox |
| Textarea | `c6bac0dd-4ab9-45b1-8e30-e4b619ee5da3` | Umbraco.TextArea |
| Numeric | `2e6d3631-066e-44b8-aec4-96f09099b2b5` | Umbraco.Integer |
| True/false | `92897bc6-a5f3-4ffe-ae27-f2e7e33dda49` | Umbraco.TrueFalse |
| Richtext editor | `ca90c950-0aff-4e72-b976-a30b1ac57dad` | Umbraco.TinyMCE |
| Media Picker (single) | `4309a3ea-0d78-4329-a06c-c80b036af19a` | Umbraco.MediaPicker3 |
| Content Picker | `fd1e0da5-5606-4862-b679-5d0cf3a52a59` | Umbraco.ContentPicker |
| DTUrlPickerSingle | `49391109-580c-46d8-8408-f496b43b6409` | Umbraco.MultiUrlPicker (max=1) |
| Tags | `b6b73142-b9c1-4bf8-a16d-e1c23320b549` | Umbraco.Tags |
| DTBlockGridSections | `bdef3027-193b-4334-b3ee-738eded72215` | Umbraco.BlockGrid |
| DTBlockListCtaItems | `972ccc3d-ec95-4dd1-88f1-c9d8b8c1fc66` | Umbraco.BlockList |

Para DTSelect*, leer el DataType desde `uSync/v9/DataTypes/DTSelect{Name}.config` para obtener Key + values.

### 2D. GUIDs canónicos — Layout Presets (para BlockGrid)

| Alias | Key |
|-------|-----|
| elementLayoutSection | `1c68f4a9-24e9-49ac-9efa-05b3d4b1404a` |
| elementLayoutContainer | `f39c535a-879f-4bbf-8d94-8370c7f45f5a` |
| elementLayoutStack | `c3dd2aaa-7cdf-410a-873e-2a36d52ecc39` |
| elementLayoutGrid | `8247e825-1210-495a-a735-5ce8928fef07` |
| elementLayoutColumn | `4b075799-e7ee-4164-aef8-21911360cfc1` |
| elementLayout1Col | `57fc7792-c6d8-424b-be23-c7c217faedb3` |
| elementLayout2ColEven | `e8baf208-35d5-4c9f-9aa4-967fa5e070bf` |
| elementLayout2ColMainSidebar | `911a64ba-ccc4-4b21-a3f2-f9273c38c6b6` |
| elementLayout3Col | `1fc59d8b-7278-4a0a-9b4c-d596ae230372` |
| elementLayout4Col | `39e1538b-0ce7-40a3-9853-849354bb1c75` |
| elementLayoutHolyGrail | `c9356982-82a2-420f-a40d-84e509c0fa28` |
| elementLayoutSidebarMain | `e88e7c8b-0e74-447b-9cb7-51d8d642b9ec` |
| elementLayoutHero | `fef510f5-59c8-4ae8-b499-2188017df5c1` |

---

## 3. Decisión: reusar vs crear nuevo

**ANTES de proponer crear algo nuevo**, recorrer este árbol:

### Para una Composition nueva

Aplicar el filtro de 3 preguntas (ADR + `feedback_composition_design_solid`):
1. ¿Existe ya una composition que cubre esto? → Buscar en `comp*.config`. Si sí, reusar.
2. ¿Tiene 2+ consumers reales o un consumer + plan firme? → Si no, no crear.
3. ¿Captura capacidad transversal o es feature de un solo block? → Si es solo un block, ir inline.

Solo proceder si las 3 respuestas justifican la composition nueva.

### Para un ElementType nuevo

Crear cuando:
- La funcionalidad editorial no existe en ningún `element*.config` existente.
- No es un sub-caso de un elemento existente con prop diferente.
- Tiene al menos 1 consumer inmediato (una página o block grid que lo va a usar).

### Para un DataType nuevo

Crear cuando:
- Se necesita un enum/dropdown con valores nuevos que no están en ningún `DTSelect*.config`.
- No es una variación de una DTSelect existente que acepta esos valores.

---

## 4. Creación de schema nuevo

### 4A. Naming conventions (completo)

| Tipo | Patrón | Ejemplo |
|------|--------|---------|
| ElementType CDN | `elementSyn{Pascal}` | `elementSynPricingCard` |
| ElementType SSR action | `elementAction{Pascal}` | `elementActionDownload` |
| ElementType SSR media | `elementMedia{Pascal}` | `elementMediaVideo` |
| ElementType SSR layout | `elementLayout{Pascal}` | `elementLayoutMasonry` |
| ElementType SSR info | `elementInfo{Pascal}` | `elementInfoKeyFact` |
| ElementType SSR corp | `elementCorp{Pascal}` | `elementCorpTeamCard` |
| ElementType SSR comp | `elementComp{Pascal}` | `elementCompFeatureSplit` |
| ElementType SSR form | `elementForm{Pascal}` | `elementFormSelect` |
| ElementType SSR shop | `elementShop{Pascal}` | `elementShopWishlist` |
| ElementType SSR member | `elementMember{Pascal}` | `elementMemberBadge` |
| ElementType SSR nav | `elementNav{Pascal}` | `elementNavBreadcrumb` |
| ElementType SSR flow | `elementFlow{Pascal}` | `elementFlowConfirmation` |
| ElementType SSR int | `elementInt{Pascal}` | `elementIntChatWidget` |
| ElementType SSR struct | `elementStruct{Pascal}` | `elementStructRuler` |
| Composition | `comp{Pascal}` | `compContentRating` |
| DataType Dropdown | `DTSelect{Pascal}` | `DTSelectRatingScale` |
| DataType BlockList | `DTBlockList{Pascal}` | `DTBlockListRatingItems` |
| DOM tag (CDN) | `synergos-{kebab}` | `<synergos-pricing-card>` |
| Razor SynHost | `SynHost/{Pascal}.cshtml` | `SynHost/PricingCard.cshtml` |
| Block Grid wrapper | `blockgrid/Components/element{Family}{Pascal}.cshtml` | `blockgrid/Components/elementSynPricingCard.cshtml` |
| Angular component (selector) | `sg-{kebab}` | `sg-pricing-card` |
| Angular path | `platforms/angular/apps/elements/{tier}/{name}/` | `platforms/angular/apps/elements/compositions/pricing-card/` |

**Tiers Angular:** `primitive` (átomo), `composition` (molécula), `module` (organismo), `experience` (plantilla).

### 4B. GUID generation + quad-check

```powershell
# Generar GUID fresco
$g = [guid]::NewGuid().ToString()

# Quad-check contra TODOS los XMLs uSync (ContentTypes + DataTypes + Templates + Dictionary + MediaTypes)
$hits = Get-ChildItem (Join-Path $cms "Synergos.CMS.Web\uSync") -Recurse -Filter "*.config" |
    Select-String -Pattern $g -SimpleMatch
if ($hits) { Write-Error "GUID collision: $g. Generar nuevo."; exit 1 }

# También check en código C# por si acaso
$codeHits = Get-ChildItem $cms -Recurse -Filter "*.cs" |
    Select-String -Pattern $g -SimpleMatch
if ($codeHits) { Write-Error "GUID en código: $g. Generar nuevo."; exit 1 }

Write-Output "GUID verificado: $g — 0 colisiones"
```

### 4C. uSync XML — Nuevo ElementType

**Template completo para un `elementSyn{Name}` con un campo de texto + media:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<ContentType Key="{KEY-ELEMENT}" Alias="elementSyn{Name}" Level="1">
  <Info>
    <Name>Element — Syn — {DisplayName}</Name>
    <Icon>icon-{umbraco-icon-name} color-blue</Icon>
    <Thumbnail>folder</Thumbnail>
    <Description><![CDATA[{Descripción ≤120 chars, editor-facing, sin jargon ADR}]]></Description>
    <AllowAtRoot>False</AllowAtRoot>
    <IsListView>False</IsListView>
    <Variations>Culture</Variations>
    <IsElement>true</IsElement>
    <Folder>Blocks/Syn</Folder>
    <Compositions>
      <Composition Key="46367d43-269b-418d-b54d-075fcf6d658b">compDomClass</Composition>
      <Composition Key="e11a9feb-fa1c-4740-9481-3dce56748473">compDomVariant</Composition>
      <Composition Key="7a383458-6ea6-4784-a4d1-17f8d4b01073">compDomVisibility</Composition>
      <Composition Key="1d5bafbb-59af-4002-8709-ebade1be0392">compDomAttributes</Composition>
      <!-- Agregar según necesidad: -->
      <!-- <Composition Key="0a2edb7e-8555-4044-bebc-bf0fe37662f2">compDomSpacing</Composition> -->
      <!-- <Composition Key="eb4bd93f-f9d1-44dd-b85e-d64b2084a3ad">compContentHeading</Composition> -->
      <!-- <Composition Key="e2a29901-8155-4d36-80ab-f42b2452a45b">compContentMedia</Composition> -->
      <!-- <Composition Key="92cb0070-0f4d-43a0-84a7-102f60dc41b4">compContentCta</Composition> -->
    </Compositions>
  </Info>
  <GenericProperties>
    <!-- Prop de texto -->
    <GenericProperty>
      <Key>{KEY-PROP-1}</Key>
      <Name>{Label visible al editor}</Name>
      <Alias>{propAlias}</Alias>
      <Definition>0cc0eba1-9960-42c9-bf9b-60e150b429ae</Definition>
      <Type>Umbraco.TextBox</Type>
      <Mandatory>true</Mandatory>
      <Validation></Validation>
      <Description><![CDATA[{Help text ≤120 chars}]]></Description>
      <SortOrder>10</SortOrder>
      <Tab Alias="content">Contenido</Tab>
      <MandatoryMessage></MandatoryMessage>
      <ValidationRegExpMessage></ValidationRegExpMessage>
      <LabelOnTop>false</LabelOnTop>
      <Variations>Culture</Variations>
    </GenericProperty>
    <!-- Prop de imagen -->
    <GenericProperty>
      <Key>{KEY-PROP-2}</Key>
      <Name>Imagen</Name>
      <Alias>media</Alias>
      <Definition>4309a3ea-0d78-4329-a06c-c80b036af19a</Definition>
      <Type>Umbraco.MediaPicker3</Type>
      <Mandatory>false</Mandatory>
      <Validation></Validation>
      <Description><![CDATA[Imagen asociada al bloque.]]></Description>
      <SortOrder>20</SortOrder>
      <Tab Alias="content">Contenido</Tab>
      <MandatoryMessage></MandatoryMessage>
      <ValidationRegExpMessage></ValidationRegExpMessage>
      <LabelOnTop>false</LabelOnTop>
      <Variations>Culture</Variations>
    </GenericProperty>
    <!-- Override de config CDN (siempre presente en elementSyn*) -->
    <GenericProperty>
      <Key>{KEY-PROP-3}</Key>
      <Name>Config Override (JSON)</Name>
      <Alias>configOverride</Alias>
      <Definition>c6bac0dd-4ab9-45b1-8e30-e4b619ee5da3</Definition>
      <Type>Umbraco.TextArea</Type>
      <Mandatory>false</Mandatory>
      <Validation></Validation>
      <Description><![CDATA[JSON override de configuración CDN. Avanzado — dejar vacío salvo necesidad técnica.]]></Description>
      <SortOrder>90</SortOrder>
      <Tab Alias="advanced">Avanzado</Tab>
      <MandatoryMessage></MandatoryMessage>
      <ValidationRegExpMessage></ValidationRegExpMessage>
      <LabelOnTop>false</LabelOnTop>
      <Variations>Nothing</Variations>
    </GenericProperty>
  </GenericProperties>
  <Structure />
  <Tabs>
    <Tab>
      <Key>{KEY-TAB-1}</Key>
      <Caption>Contenido</Caption>
      <Alias>content</Alias>
      <Type>Group</Type>
      <SortOrder>10</SortOrder>
    </Tab>
    <Tab>
      <Key>{KEY-TAB-2}</Key>
      <Caption>Avanzado</Caption>
      <Alias>advanced</Alias>
      <Type>Group</Type>
      <SortOrder>90</SortOrder>
    </Tab>
  </Tabs>
</ContentType>
```

**Guardar en:** `Synergos.CMS\Synergos.CMS.Web\uSync\v9\ContentTypes\elementSyn{name}.config`

### 4D. uSync XML — Nueva Composition

```xml
<?xml version="1.0" encoding="utf-8"?>
<ContentType Key="{KEY}" Alias="comp{Name}" Level="1">
  <Info>
    <Name>Comp — {Name}</Name>
    <Icon>icon-molecular color-orange</Icon>
    <Thumbnail>folder</Thumbnail>
    <Description><![CDATA[{Descripción ≤120 chars}]]></Description>
    <AllowAtRoot>False</AllowAtRoot>
    <IsListView>False</IsListView>
    <Variations>Culture</Variations>
    <IsElement>false</IsElement>
    <Folder>Compositions</Folder>
    <Compositions />
  </Info>
  <GenericProperties>
    <GenericProperty>
      <Key>{KEY-PROP}</Key>
      <Name>{Label}</Name>
      <Alias>{alias}</Alias>
      <Definition>{DataType-GUID}</Definition>
      <Type>{EditorAlias}</Type>
      <Mandatory>false</Mandatory>
      <Validation></Validation>
      <Description><![CDATA[{Help text}]]></Description>
      <SortOrder>10</SortOrder>
      <Tab Alias="{tab}">{Tab Caption}</Tab>
      <MandatoryMessage></MandatoryMessage>
      <ValidationRegExpMessage></ValidationRegExpMessage>
      <LabelOnTop>false</LabelOnTop>
      <Variations>Culture</Variations>
    </GenericProperty>
  </GenericProperties>
  <Structure />
  <Tabs>
    <Tab>
      <Key>{KEY-TAB}</Key>
      <Caption>{Tab Caption}</Caption>
      <Alias>{tab}</Alias>
      <Type>Group</Type>
      <SortOrder>10</SortOrder>
    </Tab>
  </Tabs>
</ContentType>
```

### 4E. uSync XML — Nuevo DataType DTSelect

```xml
<?xml version="1.0" encoding="utf-8"?>
<DataType Key="{KEY}" Alias="DTSelect{Name}" DatabaseType="Nvarchar"
          EditorAlias="Umbraco.DropDown.Flexible" Level="1">
  <Info>
    <Name>DT.Select.{Name}</Name>
    <Folder>DTSelect</Folder>
    <Thumbnail>list</Thumbnail>
  </Info>
  <Config><![CDATA[{"items":[{"id":1,"value":"option1"},{"id":2,"value":"option2"},{"id":3,"value":"option3"}],"multiple":false}]]></Config>
</DataType>
```

### 4F. uSync XML — Nuevo DataType DTBlockList

```xml
<?xml version="1.0" encoding="utf-8"?>
<DataType Key="{KEY}" Alias="DT.BlockList.{Name}" DatabaseType="Ntext"
          EditorAlias="Umbraco.BlockList" Level="1">
  <Info>
    <Name>DT.BlockList.{Name}</Name>
    <Folder>DTBlockList</Folder>
    <Thumbnail>list</Thumbnail>
  </Info>
  <Config><![CDATA[{"blocks":[{"contentElementTypeKey":"{ELEMENT-TYPE-KEY}","label":"{{ propAlias }}","editorSize":"small","forceHideContentEditorInOverlay":false,"stylesheet":null,"view":null,"settingsElementTypeKey":null}],"validationLimit":{"min":0,"max":null},"useSingleBlockMode":false,"useLiveEditing":false,"useInlineEditingAsDefault":false,"maxPropertyWidth":null}]]></Config>
</DataType>
```

### 4G. Trigger uSync Import

**Después de escribir cualquier XML nuevo**, el arquitecto debe:
1. Abrir el backoffice en `$base/umbraco/` (`synergos-guardrails/references/entorno.md`)
2. Ir a Settings → uSync → Import
3. Seleccionar "Import All" (no-destructive first pass)
4. Verificar que el nuevo tipo aparece en Content Types (Content Types section)

**El agente NO ejecuta el import** — solo escribe los XMLs y avisa al arquitecto.

---

## 5. Creación de Razor views

### 5A. Block Grid Wrapper (convención)

**Ruta:** `Synergos.CMS.Web/Views/Partials/blockgrid/Components/elementSyn{Name}.cshtml`

```razor
@*
    Block Grid convention wrapper. Unwraps the BlockGridItem and
    delegates to the SynHost renderer (Views/Partials/SynHost/{Name}.cshtml)
    so the same partial is reusable from LayoutComposer. ADR 0015.
*@
@model Umbraco.Cms.Core.Models.Blocks.BlockGridItem<Umbraco.Cms.Core.Models.PublishedContent.IPublishedElement>
@await Html.PartialAsync("SynHost/{Name}", Model.Content)
```

### 5B. SynHost Renderer — Elemento CDN (con ISynHostEmitter)

**Ruta:** `Synergos.CMS.Web/Views/Partials/SynHost/{Name}.cshtml`

```razor
@*
    SynHost renderer — <synergos-{kebab}>. {Descripción del elemento}.
    Ola {N}, ADR 0015.
*@
@using Umbraco.Cms.Core.Models
@using Umbraco.Cms.Core.Models.PublishedContent
@model IPublishedElement
@inject Synergos.CMS.Interfaces.ISynHostEmitter Emitter
@{
    // — Extraer props del ElementType —
    var heading = Model.Value<string>("heading") ?? "";
    var body    = Model.Value<string>("body") ?? "";
    var media   = Model.Value<IPublishedContent>("media");
    var ctaLink = Model.Value<Link>("ctaLink");

    var props = new Dictionary<string, object?>(StringComparer.Ordinal)
    {
        ["heading"]  = heading,
        ["body"]     = body,
        ["imageSrc"] = media?.Url(mode: UrlMode.Absolute),
        ["ctaLabel"] = Model.Value<string>("ctaLabel"),
        ["ctaUrl"]   = ctaLink?.Url,
    };

    var request = new Synergos.CMS.Interfaces.SynHostEmitRequest(
        BlockAlias: "{kebab-name}",    // alias kebab del custom element (sin prefijo synergos-)
        Props: props,
        ConfigOverrideJson: Model.Value<string>("configOverride"),
        Culture: System.Globalization.CultureInfo.CurrentUICulture);

    var result = await Emitter.EmitAsync(request);
}
@await Html.PartialAsync("SynHost/_Wrapper", (Model, result.ScriptHtml, result.ElementHtml))
```

**Notas de implementación:**
- `BlockAlias` debe coincidir con el `name` registrado en `registry.json` (kebab, sin prefijo `synergos-`).
- Si el CDN bundle no está publicado, `StubBundleRegistryClient` retorna null → `EmitAsync` emite un placeholder HTML comment. No hay error, solo silencio en UI.
- `configOverride` permite al editor forzar props en JSON — propagado by value al Web Component.

### 5C. Layout Renderer (Block Grid con Areas)

**Ruta:** `Synergos.CMS.Web/Views/Partials/blockgrid/Components/elementLayout{Name}.cshtml`

```razor
@*
    elementLayout{Name} renderer (Ola {N}). {Descripción de las areas}.
*@
@model Umbraco.Cms.Core.Models.Blocks.BlockGridItem<Umbraco.Cms.Core.Models.PublishedContent.IPublishedElement>
@using Synergos.CMS.Web.Services
@{
    var element  = Model.Content;
    var variant  = element.Value<string>("variantKey");
    var cssClass = element.Value<string>("cssClass");
    var classes  = string.Join(" ", new[]
    {
        "syn-layout",
        "syn-layout--{kebab-name}",
        string.IsNullOrWhiteSpace(variant)  ? null : $"syn-layout--v-{variant}",
        string.IsNullOrWhiteSpace(cssClass) ? null : cssClass,
    }.Concat(LayoutCssBuilder.Build(element)).Where(s => !string.IsNullOrWhiteSpace(s)));
}
<div class="@classes">
    @foreach (var area in Model.Areas)
    {
        <div class="syn-layout__area syn-layout__area--@area.Alias">
            @await Html.GetBlockGridItemsHtmlAsync(area)
        </div>
    }
</div>
```

### 5D. Dónde va cada archivo

| Caso | Ruta del archivo |
|------|-----------------|
| `elementSyn*` wrapper | `Views/Partials/blockgrid/Components/elementSyn{Name}.cshtml` |
| `elementSyn*` renderer | `Views/Partials/SynHost/{Name}.cshtml` |
| `elementLayout*` renderer | `Views/Partials/blockgrid/Components/elementLayout{Name}.cshtml` |
| `elementAction*`, `elementInfo*`, etc. | `Views/Partials/blockgrid/Components/element{Family}{Name}.cshtml` |
| Partials globales | `Views/Shared/_{Name}.cshtml` |

---

## 6. Creación de Componente Angular

### 6A. Estructura de archivos

**La plantilla viva es un elemento existente del mismo tier**, no esta skill: copiá su forma. Hoy un
elemento es:

```
platforms/angular/apps/elements/<tier>/<name>/
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.spec.json
└── src/
    ├── main.ts
    ├── app.config.ts
    ├── index.html
    └── <name>/
        ├── <name>.ts
        ├── <name>.html
        ├── <name>.scss
        └── <name>.spec.ts
```

Los tiers son las carpetas que existan bajo `platforms/angular/apps/elements/` (en plural); el
valor `tier` del registro va en singular (`primitive` / `composition` / `module`).

### 6B. No hay descriptor de proyecto

El build no se configura por elemento: `platforms/angular/tools/build.mjs` compila todas las carpetas
que tengan un `src/main.ts`, y ése es su nombre en `dist/` y en el CDN. El presupuesto de tamaño es
uno para todo el CDN (`tools/lib/cdn-size-budget.mjs`), no un campo del elemento.

### 6C. {name}.ts — Componente principal (standalone, zoneless, signal inputs)

```typescript
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for <synergos-{kebab}>.
 * CMS element: elementSyn{Pascal}.
 * Each CMS property alias becomes a TypeScript input.
 */
@Component({
  selector: 'sg-{kebab}',
  standalone: true,
  templateUrl: './{name}.html',
  styleUrl: './{name}.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-{name}' },
})
export class {Pascal}ElementComponent {
  // Mirror de cada prop del ElementType (alias = nombre del input)
  readonly heading       = input<string | undefined>(undefined);
  readonly body          = input<string | undefined>(undefined);
  readonly imageSrc      = input<string | undefined>(undefined);
  readonly ctaLabel      = input<string | undefined>(undefined);
  readonly ctaUrl        = input<string | undefined>(undefined);
  readonly configOverride = input<string | undefined>(undefined);
  // compDom* (siempre presentes en elementSyn*)
  readonly cssClass      = input<string | undefined>(undefined);
  readonly variantKey    = input<string | undefined>(undefined);
}
```

**Reglas:**
- `readonly propName = input<string | undefined>(undefined)` — siempre string o undefined (los Web Component attrs son strings).
- Un input por prop del ElementType (aliases idénticos al uSync).
- NO usar `@Input()` decorator ni `BehaviorSubject`. Solo signal inputs.
- Si la prop es booleana en CMS (TrueFalse), el attr llega como `"true"`/`"false"` string — parsear en template.

### 6D. {name}.html — Template placeholder

```html
<!--
  Placeholder de {Pascal}. El diseño visual va aquí o en una
  implementación real del componente.
-->
<div
  class="sg-{name}__placeholder"
  [class]="cssClass() ?? ''"
  [attr.data-variant]="variantKey() ?? null"
  role="region"
  [attr.aria-label]="heading() ?? 'synergos-{kebab}'"
>
  @if (imageSrc()) {
    <img [src]="imageSrc()" [alt]="heading() ?? ''" class="sg-{name}__image" />
  }
  <div class="sg-{name}__content">
    @if (heading()) {
      <h2 class="sg-{name}__heading">{{ heading() }}</h2>
    }
    @if (body()) {
      <p class="sg-{name}__body">{{ body() }}</p>
    }
    @if (ctaLabel() && ctaUrl()) {
      <a [href]="ctaUrl()" class="sg-{name}__cta">{{ ctaLabel() }}</a>
    }
  </div>
</div>
```

### 6E. {name}.scss — Estilos mínimos

```scss
:host {
  display: block;
  max-width: 100%;
  container-type: inline-size;
}

.sg-{name}__placeholder {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 2rem;
  border: 1px dashed #cbd5e1;
  border-radius: 0.5rem;
  background: #f8fafc;
}

.sg-{name}__heading {
  font-size: clamp(1.5rem, 4cqi, 3rem);
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.sg-{name}__body {
  color: #475569;
  margin: 0;
}

.sg-{name}__image {
  width: 100%;
  height: auto;
  object-fit: cover;
  border-radius: 0.25rem;
}

.sg-{name}__cta {
  display: inline-block;
  padding: 0.625rem 1.25rem;
  background: #0f58a7;
  color: #fff;
  text-decoration: none;
  border-radius: 0.25rem;
  font-weight: 500;
}
```

### 6F. app.config.ts

```typescript
import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection()],
};
```

### 6G. main.ts — Registro del Custom Element

La forma viva es la de cualquier elemento existente: registra por `@synergos/core`, que es lo que
honra el protocolo de elementos de la plataforma (Synergos.UI#62).

```typescript
import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { {Pascal}ElementComponent } from './{name}/{name}';

registrarElementoAngular('synergos-{kebab}', {Pascal}ElementComponent, appConfig);
```

### 6H. El registry del CDN NO se edita a mano

`registry.json` lo escribe `tools/publish.mjs` al publicar, a partir del registro fuente (6I) y de lo
que haya en `dist/`. Editarlo a mano se pisa en la próxima publicación. Publicar es
`synergos-cdn-build` (`npm run build:cdn`).

### 6I. Actualizar vitals/contracts/

Agregar al final de `vitals/contracts/src/elements-syn.contract.ts`:

```typescript
/** elementSyn{Pascal} — tier:{tier} → tag:<synergos-{kebab}> */
export interface Syn{Pascal}Schema {
  readonly heading?: string;
  readonly body?: string;
  readonly imageSrc?: string;
  readonly ctaLabel?: string;
  readonly ctaUrl?: string;
  readonly cssClass?: string;
  readonly variantKey?: string;
  readonly configOverride?: string;
}
```

Agregar al `element-registry.json`:
```json
{ "name": "{name}", "alias": "elementSyn{Pascal}", "tag": "synergos-{kebab}", "tier": "{tier}" }
```

El catálogo de elementos se consulta del disco, no de una foto: `npm run catalog` en la UI genera
`catalog.html` desde `element-registry.json`, `element-inputs.json` y el `registry.json` publicado.

---

## 7. Contenido y media — no son de esta skill

El contenido editorial y la media se autoran **server-side** (ADR 0093): `IContentService` /
`IMediaService` detrás del flag `Synergos:DevSeed:Enabled`, invocados por un endpoint `/dev/*`.

- Contenido, con TODOS los campos: **`synergos-content-fill`** — su §4 es la tabla canónica del
  valor de almacenamiento por DataType (verificada en vivo), su §6 el BlockGrid editor-safe.
- Imágenes: **`synergos-media-upload`** — generarlas y registrarlas (`DevMediaFactory` o el
  backoffice).

> Esta sección era un flujo token + `POST /v1/document` contra una API que Umbraco 13 no tiene; se
> cortó en el #141. Los formatos de valor que servían están en `synergos-content-fill` §4.

---

## 8. Checklist completo antes de cerrar

### Si se creó schema nuevo:
- [ ] GUIDs generados con `[guid]::NewGuid()` y quad-checked
- [ ] XML uSync escrito en la carpeta correcta con encoding UTF-8
- [ ] Alias sigue naming convention (§4A)
- [ ] Icono verificado contra `tools/umbraco13-icons-stock.txt` del CMS (`node tools/usync-audit.mjs` lo cruza)
- [ ] Descripciones ≤120 chars, sin jargon ADR
- [ ] Se avisó al arquitecto para hacer uSync Import manual
- [ ] Si es `elementSyn*`: Razor wrapper + SynHost renderer creados (§5A, §5B)
- [ ] Si es `elementSyn*` CDN: Angular component creado (§6) + entrada en `element-registry.json` (6I)
- [ ] `vitals/contracts/src/elements-syn.contract.ts` actualizado
- [ ] Publicado con `synergos-cdn-build` y verificado que hidrata (`synergos-app-verify`)

### Si hizo falta contenido:
- [ ] Lo autoró `synergos-content-fill` y pasó SU checklist (§9 de esa skill)

---

## 9. Troubleshooting

| Error | Causa | Solución |
|-------|-------|----------|
| uSync Import falla | GUID collision o XML malformado | Re-verificar quad-check; abrir XML en editor para validar |
| Razor `CS0234 IUmbracoHelper` | No usar `@inject IUmbracoHelper` en Razor | Usar `@inherits UmbracoViewPage<T>` + `ISynHostEmitter` (ADR 0059) |
| `System.Drawing` no carga | GDI+ no disponible | Usar fallback SVG (generar como texto plano) |
| Custom element no hidrata | bundle no publicado, o el CMS en `Mode=Stub` | Publicar con `synergos-cdn-build` (`npm run build:cdn`); `node tools/humo-conectado.mjs` nombra la causa |
| Angular `NG0100` change detection | Zona activa (no zoneless) | Verificar `provideZonelessChangeDetection` en `app.config.ts` |
| `customElements.get` ya definido | Doble import del script | El guard `if (!customElements.get(...))` en `main.ts` previene esto |

---

## 10. Referencias del proyecto

- `Synergos.CMS/CLAUDE.md` — 10 principios + dónde está la verdad
- `refactor-docs/architecture/00-current-state-synergos-cms.md §11` — estado real
- `refactor-docs/architecture/06-composition-design-principles.md` — filtro 3 preguntas
- `Synergos.CMS.Web/docs/contracts/` — los contratos CMS↔UI (ADR 0083)
- `Synergos.CMS.Web/docs/adr/` — los ADRs ratificados (su `README.md` es el índice)
- `synergos-architect/references/ui-elements-catalog.md` — foto de los bundles publicados (la lista viva: `npm run catalog` en la UI)
- `synergos-architect/references/cms-to-ui-mapping.md` — alias CMS ↔ tag DOM ↔ bundle URL
- `vitals/contracts/src/elements-syn.contract.ts` — schema mirrors TS
