---
name: synergos-contract-drift
description: Diagnostica y arregla DRIFT de contrato entre el CMS y las apps Angular custom-element, en sus DOS superficies. (1) La API: los DTOs record de Synergos.CMS.Web/Controllers/ contra lo que la app lee en <app>.model.ts y en el normalizeX() de <app>-api.client.ts — actívala cuando una ficha (eventos, realty, storefront, academy, ehr, gov, booking, blogs) muestra datos vacíos, precio en 0 o Gratis erróneo, separadores colgantes, mapa sin pines o campos por defecto. (2) El config que emite la vista SynHost contra lo que conserva el sanitizador del elemento (el defecto D1): el SSR se ve bien y al hidratar el elemento se pinta vacío encima, sin error, porque la vista manda claves que el elemento no lee — ahí ningún normalizador tapa nada. Cubre hallar las claves que la UI lee, compararlas con lo que emite el CMS, evaluar la severidad REAL (en la API casi nada crashea porque cada cliente hace value[uiKey] ?? value[legacyKey]; D1 en cambio borra lo que escribió el editor), el reshape build-safe (agregar campos, [property: JsonPropertyName] para la clave exacta, conservar las legacy, params opcionales con default en records de dominio) y verificar ejecutando: curl al endpoint sin leaks, el sanitizador alimentado con el config exacto de la vista, y el navegador con una consulta de control. La UI es la fuente de verdad del nombre (ADR 0083): se mueve el backend o la vista, no el elemento, y el fallback del cliente no es el arreglo.
model: claude-opus-4-8
---

# synergos-contract-drift

Diagnóstico y corrección de **drift de contrato** CMS(Razor/C#) ↔ UI(Angular), en sus dos
superficies: la **API** (DTOs del controller contra el cliente de la app, §1-§6) y el **`config`
que emite la vista SynHost** contra el sanitizador del elemento (§7, el defecto D1). La segunda es
la peor: ahí no hay normalizador que tape nada.

**Regla rectora (ADR 0083):** la UI es la **fuente de verdad**. El backend
mapea a **DTOs JSON estables** con las claves que la UI ya lee. No hay shared
code package entre repos; la única superficie de acople son los contratos y el
shape del JSON runtime. Un drift = el DTO backend emite una clave distinta (o no
la emite) de la que la UI consume.

**Antiregla capital:** cada app Angular tiene un `normalizeX()` **defensivo** que
hace `value['uiKey'] ?? value['legacyKey']` y rellena defaults (`''`, `0`, `[]`).
Eso significa que **la mayoría de los drifts NO crashean la vista** — el
normalizador los tapa. Pero tapado ≠ arreglado: la dirección canónica sigue
siendo emitir la clave correcta desde el backend. No trates el `?? fallback`
como el fix.

## 0. Prerrequisitos

- Repo backend: `$cms/Synergos.CMS.Web/`; repo UI: `$ui/platforms/angular/apps/elements/modules/<app>/`
  (`synergos-guardrails/references/entorno.md` resuelve `$cms`, `$ui` y `$base`).
- Para verificar vía HTTP el CMS debe estar corriendo en `$base` (usa **synergos-run-dev** si no
  lo está).
- Contratos canónicos: `Synergos.CMS.Web/docs/contracts/` (README + dom-events +
  css-tokens + i18n-bridge + host-bridge). ADR: `docs/adr/0083-cms-ui-alignment-via-contracts.md`.
- Memoria relacionada: `feedback_cms_ui_contracts_alignment` (naming canónico +
  realidad del normalizador), `feedback_parallel_agents_contract_and_input_race`
  (UI = fuente de verdad; backend reshape).

Convención de nombres de archivo por app (verificado en `eventos` y `realty`):

| Pieza | Ruta |
|---|---|
| Controller + DTOs | `Synergos.CMS.Web/Controllers/<App>Controller.cs` |
| Interfaces UI (claves que lee) | `Synergos.UI/.../modules/<app>/src/<app>/<app>.model.ts` |
| Cliente HTTP + `normalizeX()` | `Synergos.UI/.../modules/<app>/src/<app>/<app>-api.client.ts` |

Rutas de API confirmadas: `[Route("api/eventos")]`, `[Route("api/realty")]`. El
patrón `api/<app>` se repite en los controllers verificados; aun así, **confirma
el `[Route(...)]` del controller específico** antes de asumirlo (algunas apps
—Shop, Travel— exponen sub-rutas como `api/shop/search`, `api/travel/search/hotel`).

## 1. Hallar las claves que la UI lee (dos fuentes, no una)

La UI declara su contrato en **dos** lugares y hay que leer **ambos**:

1. **`<app>.model.ts`** — las `interface` TS = las claves esperadas y sus tipos.
   Ej. `EventSummary` lee `fromAmount:number`, `startsAt:string`, `venueName`,
   `cover`, `badges:string[]`, `subtitle`, `status`. `TicketTier` lee `id`,
   `amount`, `remaining`, `maxPerOrder`, `perks:string[]`, `zoneId?`.

2. **`normalizeX()` en `<app>-api.client.ts`** — la lectura REAL, con los
   fallbacks. Aquí ves qué clave prefiere y a cuál cae:

```ts
// eventos-api.client.ts — normalizeEvent()
fromAmount: readNumber(value['fromAmount'] ?? value['price'] ?? value['amount']),
venueName:  readString(value['venueName'] ?? value['venue']).trim(),
startsAt:   readString(value['startsAt'] ?? value['startDate'] ?? value['date']).trim(),
cover:      readString(value['cover']).trim() || readString(value['image']).trim(),
// normalizeTier()
amount:     readNumber(value['amount'] ?? value['price']),
// normalizeDetail()
artist.name: readString(artist['name']).trim() || event.title,   // fallback POBRE
```

**Lectura clave:** la primera clave del `??` es la **canónica** (la que el
backend debe emitir); las siguientes son legacy/compat. Si el backend solo emite
la legacy, funciona pero está driftado. Si no emite ninguna, cae al default
(`0`, `''`, `[]`) o a un fallback pobre (p.ej. `artist.name → event.title`).

> Grep útil: `grep -nE "value\['|\?\?" <app>-api.client.ts` lista todas las
> claves leídas y sus fallbacks de un vistazo.

## 2. Comparar contra lo que emite el DTO backend

Abre `<App>Controller.cs` y localiza:
- El **mapper** `To<X>Dto(...)` — qué campos rellena y con qué fuente de dominio.
- El **record DTO** `public sealed record <X>Dto(...)` — las claves emitidas
  (recuerda: System.Text.Json serializa camelCase por defecto salvo
  `[property: JsonPropertyName(...)]`).

Cruza cada clave de la lista del paso 1 contra el DTO. Marca cada una como:

| Estado | Significado |
|---|---|
| **MATCH** | el DTO emite la clave canónica que la UI lee. Nada que hacer. |
| **LEGACY-ONLY** | el DTO emite solo la clave legacy del `??`. Funciona por fallback; agregar la canónica. |
| **MISSING** | el DTO no emite ninguna variante. La UI cae a default/fallback pobre. |
| **CASE/NAME** | el DTO emite la clave pero con casing distinto al contrato (p.ej. `seatMap` vs `seatmap`). Necesita `JsonPropertyName`. |
| **VOCAB** | el valor difiere del vocabulario UI (p.ej. `"venta"` vs `"sale"`). Reshape en el mapper, no en el DTO. |

Ejemplos reales ya resueltos en el repo (úsalos de patrón):
- **eventos** `EventSummaryDto`: emite `startUtc` **y** `startsAt`, `imageUrl` **y**
  `cover`, `priceFrom` **y** `fromAmount` — el segundo de cada par es la clave que
  la UI lee; el primero se conserva para consumers previos.
- **eventos** venue anidado: `[property: JsonPropertyName("seatmap")]` (minúscula)
  y `[property: JsonPropertyName("rowNumber")]` calcan el contrato exacto que
  lee `<synergos-seat-map>`.
- **realty** `ListingDto`: emite `geo` (LocationDto) y `specs` (SpecsDto)
  anidados + `subtitle`/`badges` derivados; `MapOperation` traduce
  `venta→sale`, `arriendo→rent` (VOCAB).

## 3. Evaluar la severidad REAL (contra el normalizador)

**No asumas crash.** Antes de clasificar, lee el `normalizeX()` y decide:

| Severidad | Síntoma | Causa | Acción |
|---|---|---|---|
| **CRASH** | la ficha no renderiza / excepción JS | la UI lee una clave **sin** guard ni `??` (raro — casi todo está guardado) | fix backend URGENTE |
| **FALLBACK-POBRE** | dato equivocado pero visible (p.ej. "Artista: <título del evento>", precio "Gratis" por `0`) | backend MISSING → normalizador cae a otra clave/default | fix backend (emitir la clave) + si el dato no existe en dominio, enriquecer dominio/stub |
| **COSMÉTICO / DATA** | subtítulo " · ", mapa sin pines, chip ausente | el campo **existe** en el contrato pero el **dominio** no tiene la fuente → default legítimo | NO es drift de contrato; se arregla enriqueciendo dominio+stub, no el DTO |
| **LEGACY-OK** | todo se ve bien | backend emite legacy, normalizador la toma vía `??` | additivo: emitir también la canónica; baja prioridad |
| **BORRA-LO-DEL-EDITOR (D1)** | sin JavaScript la página se ve bien; al hidratar, el elemento queda vacío o en su default | la **vista SynHost** emite en `config` claves que el sanitizador del elemento no lee | no es de esta tabla: §7 |

Regla de oro de la memoria `feedback_cms_ui_contracts_alignment`: *me equivoqué
asumiendo crash en eventos — el cliente lo cubría*. **Verifica el `normalizeX`
ANTES de declarar severidad.** Los nits que quedan tras el normalizador suelen
ser de DATA (dominio/stub sin el campo), no de contrato.

## 4. Reshape backend build-safe

Principios (todos verificables en `EventosController.cs` / `RealtyController.cs`):

1. **Additivo, nunca rompedor.** Agrega la clave canónica; **conserva** la
   legacy en el mismo DTO. Ambas portan el mismo valor. Así no rompes consumers
   previos (ADR 0083 §Backward compatibility mandatoria).

   ```csharp
   private EventTierDto ToTierDto(EventTier t) => new(
       Id: t.Code,        // la UI lee tier.id (checkout); mismo valor que code
       Code: t.Code,      // legacy conservado
       Name: t.Name,
       Amount: t.Price,   // la UI lee tier.amount (major units)
       Price: t.Price,    // legacy conservado
       ...);
   ```

2. **`[property: JsonPropertyName("claveExacta")]`** cuando el casing camelCase
   por defecto no coincide con el contrato. El default daría `seatMap`; el
   contrato es `seatmap` → fíjalo explícito:

   ```csharp
   [property: JsonPropertyName("seatmap")] EventSeatMapDto? SeatMap,
   [property: JsonPropertyName("venue")]   EventVenueDto?   Venue);
   ```

3. **Null-safe en los mappers.** Si el dominio no provee el objeto, emite un DTO
   con campos vacíos en vez de `null` cuando la UI espera un objeto:

   ```csharp
   private static EventArtistDto ToArtistDto(EventArtist? a) =>
       a is null ? new EventArtistDto(string.Empty, string.Empty, 0)
                 : new EventArtistDto(a.Name, a.Headline, a.Followers);
   ```

4. **Derivaciones en helpers**, no en el DTO. Subtítulos/badges/status/vocabulario
   se calculan en métodos `private static` (`BuildSubtitle`, `BuildBadges`,
   `MapOperation`, `DeriveEventStatus`) y se pasan al DTO ya listos.

5. **Params opcionales con default en records de dominio.** Si el reshape exige
   un campo nuevo en un record de `Application`/dominio y no quieres tocar todos
   los call-sites, agrégalo como parámetro **opcional con default**
   (`string? Agency = null, double? Rating = null` — patrón real en `AgentDto`).
   Así el build queda verde sin editar cada constructor existente.

6. **Grafo de dependencias.** El reshape vive en la capa **Web** (controller). No
   metas `Umbraco.Cms.*` ni lógica de presentación en `Application` (ADR 0002).

Build de verificación (desde el clon del CMS, `$cms`):

```powershell
dotnet build Synergos.CMS.Web\Synergos.CMS.Web.csproj -v quiet --no-dependencies
# Esperar 0 errores CS. Los MSB3021 (file-lock) son esperados si el Web corre.
```

## 5. Verificar (API + navegador)

### 5.1 Vía HTTP — la forma REAL del JSON

```powershell
# La forma cruda del endpoint (confirma que la clave canónica sale):
curl.exe -s "$base/api/eventos/event/EVT-1" | ConvertFrom-Json | ConvertTo-Json -Depth 6

# Confirmar una clave puntual (ej. que 'seatmap' minúscula existe y 'fromAmount' viene):
curl.exe -s "$base/api/eventos/events?q=" |
  Select-String -Pattern '"fromAmount"','"startsAt"','"cover"' -AllMatches
```

Bash equivalente (agente). Con `node` y no con `python`: en la máquina Windows del arquitecto
`python`/`python3` es el alias vacío de la Store (uno de los rojos de entorno del #170):

```bash
curl -s "$base/api/eventos/event/EVT-1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s),null,2)))" | head -60
```

**Scan de leaks** — que el DTO no filtre campos internos/dominio no contratados
(precios en minor units crudos, flags internas, PII). Revisa que las claves
emitidas ⊆ contrato de la UI + legacy documentados. Si aparece una clave que ni
la UI ni el contrato conocen, quítala del DTO.

### 5.2 En navegador — que hidrata y muestra el dato

Usa **synergos-app-verify** (o synergos-smoke-test) para abrir la app en vivo,
confirmar que el custom element `<synergos-<app>>` hidrata (no queda como
comentario HTML) y que el campo antes vacío ahora muestra el dato real. Chequea
la consola: el cliente loguea `Eventos API "<endpoint>" unavailable — using mock
data.` cuando cae al fallback; si ves ese warn, el endpoint no respondió y estás
viendo mock, no tu fix.

> Recuerda verificar en todos los temas por-siteRoot si el drift afecta algo visual
> (ver `feedback_verify_all_siteroot_themes`).

## 6. Qué NO hacer

| ❌ No hagas | ✅ En su lugar |
|---|---|
| Tratar el `?? fallback` del cliente como el arreglo | Emitir la clave canónica desde el DTO backend (ADR 0083); el fallback es red de seguridad, no el fix |
| Renombrar el campo del DTO al nombre UI **sin** `[property: JsonPropertyName]` | Cambiar el nombre C# es libre, pero fija la clave JSON con `JsonPropertyName` a la que lee la UI |
| Quitar el campo legacy al agregar la clave nueva | Conservar ambos en el mismo DTO (additivo, backward-compat); portan el mismo valor |
| Editar `normalizeX()` para que lea la clave que el backend ya emite | La UI es la fuente de verdad; se mueve el backend, no el contrato de la UI |
| Asumir que un drift crashea la ficha | Leer `normalizeX()` primero: casi todo está guardado con `??`/defaults |
| Cambiar la firma de un record de dominio rompiendo call-sites | Parámetro opcional con default (`= null`/`= 0`) para build verde |
| "Arreglar" un campo COSMÉTICO/DATA tocando el DTO | Si el dominio no tiene la fuente, enriquecer dominio+stub; el contrato ya está bien |
| Meter lógica de reshape/presentación en `Application` | Vive en el controller (capa Web); `Application` no referencia Umbraco/ASP.NET (ADR 0002) |
| Serializar precios en minor units crudos o filtrar campos internos | Emitir major units + `PriceFormatted` (IPriceFormatter es-CO) y solo las claves contratadas |
| Verificar solo con `dotnet build` verde | Build verde no atrapa drift de claves JSON — verificar `curl` + navegador |
| Dar por bueno un elemento colocable porque el SSR se ve bien | Cruzar la vista SynHost con el sanitizador y **ejecutarlo** con el `config` exacto (§7) |
| Un spec del elemento que hace `setInput` de SUS claves | Un spec que le da el `config` que emite la vista, tal cual (§7) |

## 7. La otra superficie — el `config` de la vista SynHost (D1)

**La hidratación puede BORRAR lo que el SSR pintó bien, y ningún test de SSR lo ve, porque el SSR
está bien** (`CLAUDE.md` §5 del CMS, `feedback_hydration_can_erase_what_ssr_painted`; UI regla
43). El caso del disco: `Views/Partials/SynHost/KpiCard.cshtml` arma el `config` con `kpiLabel`,
`kpiValue`, `kpiTrend`… y `kpi-card` lee `label`, `value`, `trend`. La vista pinta su respaldo con
el texto del editor, el bundle arranca, no encuentra ninguna de sus claves y **se pinta vacío
encima**. En `dropdown`, el CMS manda `optionsJson` y el elemento lee `options`: un botón sin
opciones.

**Por qué no lo ve nadie:** el SSR se prueba contra su HTML (bien), el elemento con `setInput` de
**sus** claves (bien), y el cable entre los dos no lo prueba nadie. `element-inputs.json` declara
atributos, no la forma de `config` (doc 13 §5.bis del CMS). Y el mismo elemento puede afirmar en su
cabecera que «cada propiedad del CMS es un input con el mismo alias» — `kpi-card` lo afirma.

| | la API (§1-§6) | el `config` de la vista (D1) |
|---|---|---|
| quién emite | el DTO record del controller | el diccionario de props de `SynHost/<X>.cshtml`, más lo que el editor escriba en `configOverride`, más `culture` (que agrega el emitter y no lee nadie) |
| quién lee | `normalizeX()` del cliente de la app | el `sanitize*`/`normalize*` que el `.ts` del elemento pasa a `createConfigInputTransform`, y sus `this.config()?.x` |
| ¿lo tapa un fallback? | casi siempre | **no**: cae al default y borra lo del editor |

### 7.1 Las claves que emite la vista — de la fuente y del HTML servido

Dos métodos (`synergos-medir` §1): leer el diccionario `props` de la vista, **y** sacar el
atributo `config` de la página que sirve el CMS, que es lo que de verdad llega:

```powershell
# $base: synergos-guardrails/references/entorno.md. La ruta y el tag, los de la página que interesa.
$html = (Invoke-WebRequest "$base/<ruta>" -UseBasicParsing).Content
[regex]::Matches($html, "<synergos-kpi-card\b[^>]*\bconfig='([^']*)'") | ForEach-Object {
    [System.Net.WebUtility]::HtmlDecode($_.Groups[1].Value)   # el JSON exacto que recibe el elemento
}
```

### 7.2 Las claves que conserva el elemento

```bash
cd "$ui"   # synergos-guardrails/references/entorno.md
grep -nE "createConfigInputTransform|config\(\)\?\.\w+|value\[['\"]\w+['\"]\]" \
  platforms/angular/apps/elements/*/kpi-card/src/kpi-card/kpi-card.ts
```

Y el cuerpo de la función que recibe `createConfigInputTransform`: lo que ese `sanitize*` copia es
lo que sobrevive (en `kpi-card`, `value.label`, `value.value`…). El grep es la hipótesis; §7.3 la
confirma.

Cruce, clave por clave: **LEÍDA Y EMITIDA** (bien) · **EMITIDA Y NO LEÍDA** (se tira al hidratar:
D1) · **LEÍDA Y NO EMITIDA** (cae al default). Lo que viaja y no lee nadie (`culture`) no rompe,
pero es ruido que la ADR 0135 propone dejar de mandar.

### 7.3 Confirmarlo ejecutando — con el `config` exacto, y con control

Un grep dice qué claves **menciona** el `.ts`; qué **conserva** el sanitizador se sabe
ejecutándolo. En el spec del elemento (UI), el JSON **tal cual** lo sacó §7.1, y al lado el control
con las claves que el elemento lee:

```ts
it('pinta lo que el CMS manda de verdad', () => {
  fixture.componentRef.setInput('config', '{"kpiLabel":"Ventas del mes","kpiValue":"1.234"}'); // §7.1, sin tocar
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Ventas del mes'); // ROJO mientras haya D1
});
it('control: con las claves que lee, pinta', () => {
  fixture.componentRef.setInput('config', '{"label":"Ventas del mes","value":"1.234"}');
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Ventas del mes'); // verde: el elemento funciona
});
```

Rojo con el payload de la vista y verde con el control = **D1 confirmado**: el elemento está bien y
el cable está mal. En vivo, el mismo par en el navegador: `synergos-app-verify` §4.bis.

### 7.4 El arreglo, y lo que lo cierra de verdad

- **Se mueve la vista, no el elemento**: el nombre de la clave lo elige lo que el elemento lee
  (ADR 0083). En `SynHost/<X>.cshtml`, el diccionario de props emite las claves del sanitizador.
  Las vistas compilan al servirlas, no con `dotnet build`: `node tools/compilan-las-vistas.mjs` en
  el CMS lo comprueba (en Windows es uno de los rojos de entorno del #170: correrlo en CI o leer su
  causa antes de creerle).
- **El spec de §7.3 se queda** como regresión, con el payload de la vista.
- **Lo que lo cierra**: el contrato tipado por elemento —un `record` C# del que se genera el tipo
  TS— hace de `optionsJson` contra `options` un error de compilación. Es la **ADR 0135, Propuesta**:
  hasta que se acepte, el cierre es el spec y la comprobación a mano.

## 8. Checklist de cierre

1. `<app>.model.ts` + `normalizeX()` leídos → lista de claves canónicas.
2. DTO backend cruzado → cada clave MATCH / LEGACY-ONLY / MISSING / CASE / VOCAB.
3. Severidad decidida contra el normalizador (no asumida).
4. Reshape additivo aplicado (canónica + legacy, `JsonPropertyName` donde toque).
5. `dotnet build` Web → 0 CS.
6. `curl` al endpoint → clave canónica presente, sin leaks.
7. Navegador (synergos-app-verify) → hidrata + dato real, sin warn de mock.
8. Si tocaste algo estructural, actualiza §11.x en
   `refactor-docs/architecture/00-current-state-synergos-cms.md`.
9. Si el drift era de un elemento **colocable**: vista SynHost cruzada con el sanitizador (§7.1-§7.2),
   el spec con el `config` exacto de la vista en verde y su control al lado (§7.3), y el par en vivo
   (`synergos-app-verify` §4.bis).
