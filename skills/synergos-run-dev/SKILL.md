---
name: synergos-run-dev
description: Arranca el entorno de desarrollo completo de Synergos — CMS Umbraco (la URL del Kestrel de Development), el CDN que construye Synergos.UI (FileSystem desde public/, o HTTP con dev:cdn) y opcionalmente el ciclo editor→navegador de un elemento. Verifica prerequisitos (hosts, cert, CDN construido), detecta si ya está corriendo, y comprueba al terminar con /_health y las herramientas de humo del CMS. Usar antes de invocar synergos-content-fill o synergos-cdn-build.
model: claude-opus-4-8
---

# SYNERGOS Run Dev — arrancar el stack completo de desarrollo

Esta skill levanta y verifica el entorno de desarrollo de Synergos en orden. La guía canónica, medida
de punta a punta, es `Synergos.CMS.Web/docs/onboarding/arrancar-los-dos-arboles.md` del CMS: esta
skill es su versión ejecutable, y cuando las dos difieran **manda la guía**.

Todas las rutas y la URL salen de las variables de `synergos-guardrails/references/entorno.md`
(`$cms`, `$ui`, `$cdnRoot`, `$base`). Resolvelas primero; nada de esta skill supone una máquina.

## Stack completo

```
$base (Kestrel Http de appsettings.Development.json)   → Umbraco CMS (dotnet)
el endpoint Https del mismo fichero                     → Umbraco CMS (HTTPS, con el cert de dev)
$base/cdn-bundles/*                                     → el CDN, leído del disco (FileSystem)
http://127.0.0.1:4321                                   → npm run dev:cdn (opcional, el ciclo editor→navegador)
```

En `Development` el CMS lee el CDN del disco: `Synergos:BundleRegistry:LocalPath` apunta, relativo a
la raíz de contenido, al `public/` del clon hermano de la UI, y lo sirve bajo `PublicBaseUrl`
(`/cdn-bundles`). No hace falta un proceso aparte — pero sí que el hermano esté **construido**.

---

## 1. Verificar prerequisitos

```powershell
# $cms, $ui, $cdnRoot, $base: synergos-guardrails/references/entorno.md
$ok = $true

# 1A. El host de desarrollo resuelve (lo nombra el Kestrel de Development)
$hostDeDev = ([Uri]$base).Host
$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
if ($hostDeDev -ne 'localhost' -and -not ((Get-Content $hostsPath -Raw) -match [regex]::Escape($hostDeDev))) {
    Write-Warning "PREREQUISITO: $hostDeDev no está en el fichero hosts. 'node tools/cert-dev.mjs' imprime el comando."
    $ok = $false
}

# 1B. El certificado de desarrollo — se CREA, no se descarga (#137)
$crt = Join-Path $cms 'certs\synergos-dev.crt'
if (-not (Test-Path $crt)) {
    Write-Warning "PREREQUISITO: falta el cert de dev. Desde $cms`: node tools/cert-dev.mjs (y confiarlo; el script dice cómo)."
    Write-Warning "O levantar sólo por HTTP quitando Kestrel:Endpoints:Https de appsettings.Development.json."
}

# 1C. El CDN está CONSTRUIDO. No se crea un registry vacío: con uno vacío el CMS arranca, sirve
#     la portada en 200 con todo el SSR y no hidrata nada — el defecto #126 fabricado a mano.
if (-not (Test-Path (Join-Path $cdnRoot 'registry.json'))) {
    Write-Warning "PREREQUISITO: no hay registry en $cdnRoot. Desde $ui`: npm run setup; npm run build:cdn"
    Write-Warning "Sin CDN, el CMS en Mode=FileSystem NO arranca (y lo dice). Para levantarlo igual sin hidratar:"
    Write-Warning "  `$env:Synergos__BundleRegistry__Mode = 'Stub'"
    $ok = $false
}

# 1D. La contraseña del admin viene del entorno (#150); no está en el árbol
if (-not $env:Umbraco__CMS__Unattended__UnattendedUserPassword -and
    -not (Test-Path (Join-Path $cms 'Synergos.CMS.Web\umbraco\Data\Umbraco.sqlite.db'))) {
    Write-Warning "PRIMER ARRANQUE: definí Umbraco__CMS__Unattended__UnattendedUserPassword (o dotnet user-secrets)."
    $ok = $false
}

if ($ok) { Write-Output 'Prerequisitos OK.' }
```

---

## 2. Detectar si el CMS ya está corriendo

`/_health` es el endpoint propio del CMS (`HealthController`). **200 y 503 significan los dos que el
proceso está arriba**: 503 es «arriba, con alguna probe en rojo» — el cuerpo dice cuál.

```powershell
function Test-CmsArriba {
    try { Invoke-WebRequest "$base/_health" -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true }
    catch { return [bool]$_.Exception.Response }   # un 503 también es un proceso que contesta
}
if (Test-CmsArriba) { Write-Output "El CMS ya contesta en $base — no hace falta arrancarlo." }
```

---

## 3. Arrancar el CMS

### Opción A — Bash tool con `run_in_background` (recomendado desde Claude)

```bash
cd "$cms"    # synergos-guardrails/references/entorno.md
dotnet run --project Synergos.CMS.Web --launch-profile SynergosLocal
```

⚠️ El perfil se llama `SynergosLocal` (ver `Synergos.CMS.Web/Properties/launchSettings.json`), NO
"Development". Un nombre de perfil inexistente **no falla ahí**: `dotnet run` sigue, no setea
`ASPNETCORE_ENVIRONMENT`, arranca como **Production** y revienta con `InvalidOperationException: The
factory has not been configured with a proper connection string` — que parece un problema de DB y es
del perfil (el connection string vive en `appsettings.Development.json`).

Después esperar a que conteste:

```powershell
$maxWait = 90; $elapsed = 0
while ($elapsed -lt $maxWait -and -not (Test-CmsArriba)) { Start-Sleep -Seconds 3; $elapsed += 3 }
if (Test-CmsArriba) { Write-Output "CMS arriba en $elapsed s." }
else { Write-Error "El CMS no contestó en $maxWait s. Revisar el log del proceso (§4)." }
```

### Opción B — PowerShell background job

```powershell
$cmsJob = Start-Job -Name 'SynCMS' -ScriptBlock {
    Set-Location $using:cms
    dotnet run --project Synergos.CMS.Web --launch-profile SynergosLocal
}
Write-Output "CMS iniciado como job — ID: $($cmsJob.Id)"
```

### Opción C — Instrucción al arquitecto

Si el agente no puede arrancar procesos en segundo plano:

```
En una terminal, desde el clon de Synergos.CMS:

  dotnet run --project Synergos.CMS.Web --launch-profile SynergosLocal

Dejarla abierta. El CMS queda en la URL del endpoint Http de Kestrel de
appsettings.Development.json (y en la Https, si el cert está confiado).

Backoffice: <esa URL>/umbraco/
  Usuario: el UnattendedUserEmail de appsettings.Development.json
  Contraseña: la que pusiste en Umbraco__CMS__Unattended__UnattendedUserPassword (#150)
```

---

## 4. Logs de arranque — señales esperadas y errores

### Logs normales (ignorar)
```
warn: Umbraco.Cms.Core.Services.LocalizedTextService[0]
    Could not find localization file
info: BundleRegistry warmup OK: adapter=FileSystemBundleRegistryClient
info: Now listening on: <la URL de $base>
```

### Señales de éxito
- `Now listening on: …` → el CMS arrancó
- `BundleRegistry warmup OK: adapter=FileSystemBundleRegistryClient` → el CDN del disco conectado
- `uSync: Startup Complete` → terminó el import (si lo pediste). **Esperá esta línea antes de sembrar
  nada**: sembrar a mitad deja toda página de contenido en 500 (lo midió la guía de arranque).

### Señales de problema

| Log | Causa | Solución |
|-----|-------|----------|
| El CMS no arranca y habla de `LocalPath` | `Mode=FileSystem` y el hermano no está construido ahí | `npm run build:cdn` en la UI, o `Synergos__BundleRegistry__Mode=Stub` |
| `UNIQUE constraint failed` | GUID duplicado en uSync | Quad-check de GUIDs antes del import (`synergos-usync-author`) |
| `Address already in use` | Otro proceso usa el puerto de `$base` | `Get-NetTCPConnection -LocalPort ([Uri]$base).Port` y matar ese proceso |
| `Failed to bind to address https://…` | Falta el cert de dev | `node tools/cert-dev.mjs`, o levantar sólo por HTTP |
| `ModelsBuilder: FlagOutOfDateModels` | Schema cambió sin regenerar models | Normal con props untyped — "Running without models" no rompe nada |
| `Database does not exist` | Primer arranque sin SQLite | Esperar — Umbraco instala unattended (necesita la contraseña del §1D) |

---

## 5. El ciclo editor→navegador de un elemento (opcional)

Sólo si se está desarrollando un elemento. El dev server de un proyecto por elemento ya no existe:
la UI se compila de una vez (`platforms/angular/tools/build.mjs`). Lo que sirve es el watch del CDN:

```bash
cd "$ui"
npm run dev:cdn                     # o: npm run dev:cdn -- --solo=<elemento>
```

Sirve el layout COMPLETO del CDN en `http://127.0.0.1:4321` desde el watch. `/probar/<elemento>` monta
ese elemento suelto con su import map y valores de muestra — **no es una vista previa del producto**.
Para que el CMS lo consuma, arrancalo con las claves de configuración de .NET (**no** las de compose):

```powershell
$env:Synergos__BundleRegistry__Mode = 'Http'
$env:Synergos__BundleRegistry__PublicBaseUrl = 'http://127.0.0.1:4321'
```

`SYNERGOS_CDN_MODE` / `SYNERGOS_CDN_URL` sólo existen dentro de `compose.yml`: fuera de compose no las
lee nadie, y la portada sale en 200 sin import map (medido en la guía de arranque).

---

## 6. Comprobar que el entorno quedó arriba

### 6A. `/_health` — lo que el CMS dice de sí mismo

```powershell
try { $r = Invoke-WebRequest "$base/_health" -UseBasicParsing -TimeoutSec 5 }
catch { $r = $_.Exception.Response }
$cuerpo = if ($r -is [System.Net.HttpWebResponse]) {
    (New-Object IO.StreamReader($r.GetResponseStream())).ReadToEnd() } else { $r.Content }
$salud = $cuerpo | ConvertFrom-Json
Write-Output "Estado: $($salud.status) · versión: $($salud.version)"
$salud.checks | ForEach-Object {
    Write-Output ("  {0} {1}: {2}" -f $(if ($_.healthy) { '✓' } else { '✗' }), $_.name, $_.message)
}
```

Cada probe registrada aparece por nombre (incluida la del bundle registry). 503 = alguna en rojo.

### 6B. El CDN del disco

```powershell
$reg = Get-Content (Join-Path $cdnRoot 'registry.json') -Raw | ConvertFrom-Json
Write-Output "registry: $(@($reg.elements).Count) elementos — generado $($reg.generated)"
```

### 6C. La prueba que importa: que la página hidrate

Un proceso arriba no es un sitio que funciona: una portada en 200 sin import map **se ve bien y no
hace nada** (#126). Las herramientas del CMS lo comprueban levantando **su propio** CMS sobre una base
temporal — no necesitan el de §3 y no lo tocan:

```bash
cd "$cms"
node tools/humo-portada.mjs      # base vacía + XML + siembra = portada SERVIDA
node tools/humo-conectado.mjs    # …y además CONECTADA al CDN: import map, un <script> por tag, bundles 200
```

Y en el navegador, sobre el CMS de §3: `customElements.get('synergos-<elemento>')` tiene que ser una
función → `synergos-app-verify`.

---

## 7. Detener el CMS

```powershell
# Si se usó Start-Job:
Get-Job -Name 'SynCMS' -ErrorAction SilentlyContinue | Stop-Job -PassThru | Remove-Job

# Si se inició desde terminal: Ctrl+C en esa terminal.

# Verificar que el puerto de $base quedó libre:
$puerto = ([Uri]$base).Port
$procs = Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue
if ($procs) {
    Write-Warning "Puerto $puerto todavía en uso por PID $($procs.OwningProcess)"
    Stop-Process -Id $procs.OwningProcess -Force
}
```

---

## 8. Primer arranque (instalación unattended)

Si es la primera vez en esta máquina:

1. Umbraco detecta que no hay DB y crea `Synergos.CMS.Web/umbraco/Data/Umbraco.sqlite.db`.
2. Crea el admin con el nombre y el correo de `appsettings.Development.json:Unattended` y la
   contraseña de `Umbraco__CMS__Unattended__UnattendedUserPassword`. Sin ella el arranque falla con
   un mensaje que la nombra (#150) — a propósito: un admin sin contraseña es un sitio al que nadie
   puede entrar.
3. El schema **no** se importa solo (ADR 0008): uSync Import a mano, una vez → `synergos-usync-import`.
4. La portada la crea `POST $base/dev/seed-portada` (detrás del flag DevSeed), después del import.

**Señal de instalación completa:** `Application started. Press Ctrl+C to shut down.` en los logs.

---

## 9. Referencia rápida

| URL | Propósito |
|-----|-----------|
| `$base/umbraco/` | Backoffice |
| `$base/_health` | Salud del CMS: probes con nombre, 200/503 |
| `$base/cdn-bundles/synergos/` | Bundles del CDN servidos por el CMS (FileSystem) |
| `$base/` | Sitio público |
| `http://127.0.0.1:4321/probar` | El banco de elementos de `npm run dev:cdn` |
