---
name: synergos-cdn-build
description: Compila y publica los elementos de Synergos.UI al CDN que lee el CMS — npm run build:cdn deja en public/ los elementos de todas las plataformas, sus runtimes, registry.json con la integridad de cada bundle, y mide el presupuesto de tamaño. Cubre el ciclo de un solo elemento (dev:cdn --solo), el rebuild obligatorio del runtime al tocar libs/shared, y la verificación contra el disco (registry.json), /_health del CMS y humo-conectado para la hidratación. Usar después de crear o modificar un elemento.
model: claude-opus-4-8
---

# SYNERGOS CDN Build — compilar y publicar los elementos al CDN

Esta skill cierra el loop entre el componente (en `Synergos.UI`) y el CMS, que lo sirve como Web
Component. Sin publicar, el CMS no tiene bundle que servir y el `<synergos-*>` queda como el
comentario de relleno del SSR.

Las rutas salen de `synergos-guardrails/references/entorno.md` (`$ui`, `$cms`, `$cdnRoot`, `$base`).
La referencia viva del build es `Synergos.UI/CLAUDE.md` (Quick reference): si esta skill y ese
fichero difieren, **manda el fichero**.

## Flujo completo

```
platforms/<plataforma>/apps/**/<nombre>/src/main.ts      ← un elemento = una carpeta con src/main.ts
    │
    ▼  platforms/angular/tools/build.mjs                  (UN compilador para todos; esbuild detrás)
    │
platforms/<plataforma>/dist/<nombre>/browser/main.js
    │
    ▼  tools/publish.mjs --cdn public                     (lo corre build:cdn)
    │
public/synergos/<nombre>/<framework>/{<versión>,v<major>,latest}/main.js   (+ manifest.json, meta.json)
public/synergos/registry.json                             ← el índice global, con la integridad de cada bundle
public/synergos/runtime/<framework>/<versión>/            ← los runtimes compartidos y su import-map.json
    │
    ▼  el CMS en Development lo lee del disco (Synergos:BundleRegistry:LocalPath) y recarga al cambiar
    │
$base/cdn-bundles/synergos/<nombre>/<framework>/latest/main.js
```

No hay un proyecto por elemento ni un descriptor por proyecto: la purga de 2026-08-04 se llevó
eso, y `build.mjs` compila todos los `src/main.ts` de una vez.

---

## 1. Qué hace falta saber del elemento

| Dato | De dónde sale |
|------|---------------|
| El nombre | la carpeta que tiene su `src/main.ts` — es su nombre en `dist/` y en el CDN |
| El tag | `synergos-<nombre>` (lo declara `vitals/contracts/src/element-registry.json`) |
| La versión | **no se pasa**: `publish.mjs` resuelve la de cada elemento por contenido. Un `--version=` explícito manda para TODO el lote (salto deliberado) |

Para ver qué elementos existen, se deriva del disco en vez de copiar una lista:

```bash
cd "$ui"
find platforms -path '*/node_modules' -prune -o -path '*/src/main.ts' -print | sed 's|/src/main.ts||'
```

---

## 2. Compilar y publicar (el camino canónico)

```bash
cd "$ui"
npm run setup        # la primera vez en un clon: npm ci en la raíz Y en cada plataforma
npm run build:cdn    # compila las plataformas, rehace los runtimes, publica en public/ y mide
```

Termina en `✓ listo en <repo>/public`. **Sale con 1 si algo se pasó del presupuesto de tamaño**: no
es un aviso, es el gate. Si se queja, mirá **qué** creció antes de tocar un techo
(`tools/lib/cdn-size-budget.mjs`).

La integridad de cada bundle la calcula `publish.mjs` y viaja en el `registry.json`; si faltara, el
CMS la calcula al leer (`ComputeIntegrityIfMissing` en `appsettings.Development.json`). No hace falta
escribirla a mano.

## 3. Un solo elemento, mientras se desarrolla

```bash
cd "$ui"
npm run dev:cdn -- --solo=<nombre>     # watch + servidor del CDN en http://127.0.0.1:4321
```

Sirve el layout COMPLETO del CDN desde el watch, sin pasar por `build:cdn`, y rehace el runtime
cuando tocás `libs/`. `/probar/<nombre>` monta el elemento suelto. Para que el CMS lo consuma, se
arranca con `Synergos__BundleRegistry__Mode=Http` y `Synergos__BundleRegistry__PublicBaseUrl` apuntando
ahí (`synergos-run-dev` §5) — **no** con `SYNERGOS_CDN_MODE`, que sólo existe dentro de compose.

Cuando esté listo, `npm run build:cdn` deja `public/` al día para el modo FileSystem.

---

## 4. GOTCHA CRÍTICO — tocar `libs/shared` OBLIGA a rehacer el RUNTIME

> **Síntoma:** el bundle de la app carga 200, el registry lo lista… y el custom element **NO
> hidrata**: `customElements.get('synergos-<x>')` es `undefined`. En consola:
> - `SyntaxError: The requested module '@synergos/shared' does not provide an export named 'X'`
> - `TypeError: Failed to fetch dynamically imported module`
>
> No es el elemento, ni el registry, ni el SynHostEmitter. Es el **runtime compartido viejo**.

`@synergos/shared` **no se empaqueta** dentro de cada app: es un módulo del runtime (`sg-shared.js`)
que la página carga UNA vez por import map. Publicar sólo la app no lo rehace. `npm run build:cdn`
rehace los runtimes siempre, y `dev:cdn` lo hace al tocar `libs/`.

**Por qué hace falta Ctrl+Shift+R (no F5):** el runtime se sirve `immutable` y su URL está
versionada **sólo por la versión de Angular** (`…/runtime/angular/<versión>/sg-shared.js`), no por su
contenido. Un F5 reusa el viejo aunque el CDN ya tenga el nuevo.

**Verificación:**
```bash
# 1) el CDN ya tiene el símbolo nuevo
grep -c "NuevoSymbol" "$cdn_root"/runtime/angular/*/sg-shared.js      # > 0
```
```js
// 2) el navegador no sirve caché vieja (consola del sitio)
fetch(url).then(r => r.text()).then(t => t.length)                    // cacheado
fetch(url, { cache: 'reload' }).then(r => r.text()).then(t => t.length) // fresco — si difieren, Ctrl+Shift+R
// 3) tras el hard reload
customElements.get('synergos-<x>')                                    // una función
```

## 5. GOTCHA — los secondary entry points de `@angular/core`

Si **ningún** elemento hidrata aunque todo carga 200, mirá el runtime antes que el elemento. Los
secondary entry points (`@angular/core/rxjs-interop`, `@angular/core/primitives/*`) viven en dos
sitios acoplados a propósito, y los dos tienen que nombrar lo mismo:

- `tools/build-runtime.mjs` — los **produce** (un `buildModule` por entry point)
- `tools/lib/mapa-del-runtime.mjs` — la ruta que el **navegador resuelve** (`importsDelRuntimeAngular()`)

La lista de lo que un elemento **no** empaqueta es `platforms/angular/cdn.config.mjs` (`EXTERNALS`),
y su cabecera dice qué más hay que tocar al cambiarla. Del lado del CMS, el import map lo emite
`_SynHostRuntime.cshtml` a partir del `import-map.json` publicado: sin él, nada resuelve.

---

## 6. Verificar — contra el disco, contra el CMS, y en la página

```powershell
# $cdnRoot, $base, $cms: synergos-guardrails/references/entorno.md
$nombre = '<nombre>'

# 6A. El registry del disco lo lista, con sus frameworks y versiones
$reg = Get-Content (Join-Path $cdnRoot 'registry.json') -Raw | ConvertFrom-Json
$el  = @($reg.elements) | Where-Object { $_.name -eq $nombre }
if ($el) { Write-Output "registry: $($el.tag) → $($el.implementations | ConvertTo-Json -Compress)" }
else     { Write-Warning "$nombre NO está en $cdnRoot\registry.json — ¿corrió build:cdn?" }

# 6B. El CMS lo ve: la probe del bundle registry en /_health
try { $salud = (Invoke-WebRequest "$base/_health" -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json }
catch { $r = $_.Exception.Response; if ($r) { $salud = (New-Object IO.StreamReader($r.GetResponseStream())).ReadToEnd() | ConvertFrom-Json } }
$salud.checks | ForEach-Object { Write-Output ("  {0} {1}: {2}" -f $(if ($_.healthy) { '✓' } else { '✗' }), $_.name, $_.message) }

# 6C. El CMS lo sirve
$url = "$base/cdn-bundles/synergos/$nombre/angular/latest/main.js"
$r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 10
Write-Output "$url → $($r.StatusCode) · Cache-Control: $($r.Headers['Cache-Control'])"
```

**Cache-Control esperado:** `/latest/` → no-cache/must-revalidate (puntero mutable); la versión exacta
→ `immutable`.

**Y la prueba que importa, que la página hidrate** — con su propio CMS, sin depender del tuyo:

```bash
cd "$cms"
node tools/humo-conectado.mjs     # import map con cada framework, un <script> por tag, cada bundle 200
```

En el navegador: `synergos-app-verify` (hidratación real, leak-scan, 375px, todos los temas).

---

## 7. Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| `Cannot find module 'sass'` o similar al compilar | faltan dependencias de una plataforma | `npm run setup` (`npm ci` a secas no instala las plataformas) |
| `build:cdn` sale con 1 al final | el presupuesto de tamaño | mirá **qué** creció; la razón de cada techo está en `tools/lib/cdn-size-budget.mjs` |
| Bundle 200 pero **ningún** elemento hidrata | runtime sin un entry point, o sin import map | §5 |
| Bundle 200 pero **este** elemento no hidrata tras tocar `libs/shared` | runtime viejo o caché | §4 |
| Bundle 404 en el CMS | el CMS lee otra carpeta | `Synergos:BundleRegistry:LocalPath` de `appsettings.Development.json`, resuelto contra la raíz de contenido |
| El CMS no arranca y habla de `LocalPath` | `Mode=FileSystem` sin `registry.json` ahí | `npm run build:cdn`, o `Synergos__BundleRegistry__Mode=Stub` |
| El elemento no hidrata (placeholder visible) | el `name` del registry no coincide con el `BlockAlias` del Razor | la identidad de un elemento es el `name` del registro; si divergen queda dormido en silencio |
| Hot-reload no detecta el cambio | el watcher agrupa cambios (`HotReloadDebounceMilliseconds` en `appsettings.Development.json`) | esperar ese intervalo y volver a pedir el bundle |
