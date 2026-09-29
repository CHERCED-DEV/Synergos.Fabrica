---
name: synergos-element-inventory
description: Genera un mapa cruzado completo de todos los elementos de Synergos — cruza uSync XMLs (ElementTypes), Razor views (SynHost + Block Grid wrappers), las fuentes de la UI (cada carpeta con src/main.ts, lo mismo que compila build.mjs), y los bundles publicados (registry.json del CDN construido). Detecta elementos incompletos ("a medias") y los clasifica por nivel de completitud. Útil antes de una Ola para saber el estado real.
model: claude-opus-4-8
---

# SYNERGOS Element Inventory — mapa cruzado de todos los elementos

Un elemento "completo" en Synergos tiene exactamente 5 capas presentes:
1. **uSync XML** — `elementSyn*.config` (schema)
2. **Block Grid wrapper** — `blockgrid/Components/elementSyn*.cshtml` (punto de entrada Razor)
3. **SynHost renderer** — `SynHost/{Pascal}.cshtml` (delegación a ISynHostEmitter)
4. **Fuente en la UI** — una carpeta `<kebab>/` con `src/main.ts` bajo `Synergos.UI/platforms/`
5. **Bundle publicado** — entrada en `registry.json` + archivo en el CDN (`$CDN_ROOT`)

---

## 0. Rutas base

```powershell
# $cms, $ui, $cdnRoot: synergos-guardrails/references/entorno.md
$uSyncCT     = Join-Path $cms "Synergos.CMS.Web\uSync\v9\ContentTypes"
$synHostDir  = Join-Path $cms "Synergos.CMS.Web\Views\Partials\SynHost"
$bgridDir    = Join-Path $cms "Synergos.CMS.Web\Views\Partials\blockgrid\Components"
$uiPlatforms = Join-Path $ui "platforms"
$regPath     = Join-Path $cdnRoot "registry.json"
```

---

## 1. Paso 1 — Recolectar todos los ElementTypes de uSync

```powershell
$elements = [System.Collections.Generic.List[PSCustomObject]]::new()

Get-ChildItem $uSyncCT -Filter "elementSyn*.config" -Recurse | ForEach-Object {
    try {
        [xml]$xml   = Get-Content $_.FullName -Encoding UTF8
        $alias      = $xml.ContentType.GetAttribute("Alias")
        $key        = $xml.ContentType.GetAttribute("Key")
        $isElement  = $xml.ContentType.Info.IsElement
        $name       = $xml.ContentType.Info.Name

        if ($alias -and $isElement -eq "true") {
            # Derivar pascal y kebab del alias
            $pascal = $alias -replace '^elementSyn', ''
            $kebab  = ($pascal -creplace '(?<=[a-z])(?=[A-Z])', '-').ToLower()

            $elements.Add([PSCustomObject]@{
                Alias   = $alias
                Pascal  = $pascal
                Kebab   = $kebab
                Key     = $key
                Name    = $name
                File    = $_.Name
                # Layers — se llenarán en pasos siguientes
                HasXml      = $true
                HasBgrid    = $false
                HasSynHost  = $false
                HasAngular  = $false
                HasBundle   = $false
                AngularTier = ""
                BundleVer   = ""
            })
        }
    } catch {
        Write-Warning "Error leyendo $($_.Name): $_"
    }
}

Write-Output "ElementTypes en uSync: $($elements.Count)"
```

---

## 2. Paso 2 — Verificar Block Grid wrappers

```powershell
foreach ($el in $elements) {
    # El wrapper puede tener el nombre del alias directamente o en subcarpeta
    $candidates = @(
        "$bgridDir\$($el.Alias).cshtml",
        "$bgridDir\$($el.Pascal).cshtml"
    )
    $bgridFiles = Get-ChildItem $bgridDir -Filter "*.cshtml" -Recurse |
        Where-Object { $_.Name -match $el.Pascal -or $_.Name -match $el.Alias }

    $el.HasBgrid = $bgridFiles.Count -gt 0
}
```

---

## 3. Paso 3 — Verificar SynHost renderers

```powershell
foreach ($el in $elements) {
    $synHostFile = "$synHostDir\$($el.Pascal).cshtml"
    $el.HasSynHost = Test-Path $synHostFile
}
```

---

## 4. Paso 4 — Verificar las fuentes de la UI

Se descubre **lo mismo que compila el build**: toda carpeta que tenga un `src/main.ts` es un
elemento, y su nombre de carpeta es su nombre en `dist/` y en el CDN. Los tiers no se listan: salen
de la ruta.

> Aquí vivía un descubrimiento con **dos pasadas rotas en fila, que no fallaba**: la primera probaba
> tiers en singular contra carpetas que son plurales (no acertaba nunca) y la segunda enumeraba el
> descriptor por proyecto que la purga de 2026-08-04 se llevó. Resultado: cero fuentes, «sin
> Angular» sobre elementos publicados, y un informe con aspecto de informe (#141). Por eso la red de
> seguridad de abajo **falla**, y se mide contra el disco, no contra una cifra.

```powershell
$fuentes = @(Get-ChildItem $uiPlatforms -Recurse -Filter "main.ts" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -eq "src" -and $_.FullName -notmatch "[\\/]node_modules[\\/]" } |
    ForEach-Object {
        $carpeta = $_.Directory.Parent
        [PSCustomObject]@{
            Nombre     = $carpeta.Name
            Tier       = $carpeta.Parent.Name
            Plataforma = ($carpeta.FullName.Substring($uiPlatforms.Length).TrimStart("\", "/") -split "[\\/]")[0]
        }
    })
$porNombre = @{}
foreach ($f in $fuentes) { if (-not $porNombre.ContainsKey($f.Nombre)) { $porNombre[$f.Nombre] = $f } }

# Red de seguridad: cero fuentes es un descubrimiento roto, no una UI vacía
if ($fuentes.Count -eq 0) { throw "No encontré ningún src/main.ts bajo $uiPlatforms — el descubrimiento está roto; no reportar." }

foreach ($el in $elements) {
    $f = $porNombre[$el.Kebab]
    if ($f) { $el.HasAngular = $true; $el.AngularTier = "$($f.Plataforma)/$($f.Tier)" }
}
```

---

## 5. Paso 5 — Verificar bundles en registry.json y en el CDN

```powershell
$reg = $null
try {
    $reg = Get-Content $regPath -Raw | ConvertFrom-Json
} catch {
    Write-Warning "registry.json no legible — paso 5 saltado"
}

if ($reg) {
    foreach ($el in $elements) {
        $entry = @($reg.elements) | Where-Object { $_.name -eq $el.Kebab } | Select-Object -First 1

        if ($entry) {
            $ver    = $entry.implementations.angular.latest
            $mainJs = Join-Path $cdnRoot "$($el.Kebab)\angular\$ver\main.js"
            $el.HasBundle  = Test-Path $mainJs
            $el.BundleVer  = $ver
        }
    }

    # Segunda red de seguridad, cruzada: si la mayoría de lo PUBLICADO no aparece como fuente, lo
    # roto es el descubrimiento del paso 4, no la UI. Se falla en vez de reportar «sin Angular».
    $publicados = @($reg.elements | ForEach-Object { $_.name })
    $sinFuente  = @($publicados | Where-Object { -not $porNombre.ContainsKey($_) })
    if ($publicados.Count -gt 0 -and $sinFuente.Count -gt ($publicados.Count / 2)) {
        throw "$($sinFuente.Count) de $($publicados.Count) elementos publicados no tienen fuente: el paso 4 está roto."
    }
}
```

---

## 6. Clasificar por nivel de completitud

```powershell
function Get-CompletionLevel {
    param($el)
    $layers = @($el.HasXml, $el.HasBgrid, $el.HasSynHost, $el.HasAngular, $el.HasBundle)
    $count  = ($layers | Where-Object { $_ }).Count
    switch ($count) {
        5 { return "COMPLETO" }
        4 { return "CASI (1 capa falta)" }
        3 { return "A MEDIAS" }
        { $_ -le 2 } { return "INCOMPLETO" }
    }
}

foreach ($el in $elements) {
    Add-Member -InputObject $el -NotePropertyName "Level" -NotePropertyValue (Get-CompletionLevel $el) -Force
    Add-Member -InputObject $el -NotePropertyName "Score" -NotePropertyValue (
        @($el.HasXml, $el.HasBgrid, $el.HasSynHost, $el.HasAngular, $el.HasBundle) |
        Where-Object { $_ } | Measure-Object | Select-Object -ExpandProperty Count
    ) -Force
}
```

---

## 7. Agregar elementos publicados en el CDN que NO están en uSync

```powershell
# Bundles huérfanos — en registry pero sin ElementType en uSync
if ($reg) {
    $uSyncAliases = $elements | ForEach-Object { $_.Kebab }
    $orphanBundles = @($reg.elements) | Where-Object { $_.name -notin $uSyncAliases }
    if ($orphanBundles.Count -gt 0) {
        Write-Warning "Bundles en registry SIN ElementType en uSync:"
        $orphanBundles | ForEach-Object { Write-Warning "  ORPHAN BUNDLE: $($_.name)" }
    }
}
```

---

## 8. Reporte de inventario

```powershell
Write-Output ""
Write-Output "═══════════════════════════════════════════════════════════════════════════"
Write-Output "  SYNERGOS Element Inventory — $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Write-Output "═══════════════════════════════════════════════════════════════════════════"
Write-Output "  Total ElementTypes: $($elements.Count)"
Write-Output ""

# Por nivel
$completos    = @($elements | Where-Object { $_.Level -eq "COMPLETO" })
$casiCompleto = @($elements | Where-Object { $_.Level -like "CASI*" })
$aMedias      = @($elements | Where-Object { $_.Level -eq "A MEDIAS" })
$incompletos  = @($elements | Where-Object { $_.Level -eq "INCOMPLETO" })

Write-Output "  COMPLETOS ($($completos.Count)):"
$completos | Sort-Object Alias | ForEach-Object {
    Write-Output "    ✓ $($_.Alias)  [tier:$($_.AngularTier) v$($_.BundleVer)]"
}

if ($casiCompleto.Count -gt 0) {
    Write-Output ""
    Write-Output "  CASI COMPLETOS — falta 1 capa ($($casiCompleto.Count)):"
    $casiCompleto | Sort-Object Alias | ForEach-Object {
        $missing = @()
        if (-not $_.HasBgrid)   { $missing += "BlockGrid wrapper" }
        if (-not $_.HasSynHost) { $missing += "SynHost Razor" }
        if (-not $_.HasAngular) { $missing += "Angular project" }
        if (-not $_.HasBundle)  { $missing += "Bundle CDN" }
        Write-Output "    ⚠ $($_.Alias)  [FALTA: $($missing -join ', ')]"
    }
}

if ($aMedias.Count -gt 0) {
    Write-Output ""
    Write-Output "  A MEDIAS — faltan 2+ capas ($($aMedias.Count)):"
    $aMedias | Sort-Object Score -Descending | ForEach-Object {
        $missing = @()
        if (-not $_.HasBgrid)   { $missing += "BlockGrid" }
        if (-not $_.HasSynHost) { $missing += "SynHost" }
        if (-not $_.HasAngular) { $missing += "Angular" }
        if (-not $_.HasBundle)  { $missing += "Bundle" }
        Write-Output "    ✗ $($_.Alias)  [$($_.Score)/5] FALTA: $($missing -join ', ')"
    }
}

if ($incompletos.Count -gt 0) {
    Write-Output ""
    Write-Output "  INCOMPLETOS — solo XML ($($incompletos.Count)):"
    $incompletos | Sort-Object Alias | ForEach-Object {
        Write-Output "    ✗✗ $($_.Alias)  — solo uSync XML, sin nada más"
    }
}

Write-Output ""
Write-Output "  Resumen: $($completos.Count) completos | $($casiCompleto.Count) casi | $($aMedias.Count) a medias | $($incompletos.Count) incompletos"
Write-Output "═══════════════════════════════════════════════════════════════════════════"
```

---

## 9. Tabla detallada (para análisis profundo)

```powershell
Write-Output ""
Write-Output "Tabla detallada:"
Write-Output ("  {0,-35} {1,-5} {2,-5} {3,-6} {4,-7} {5,-6} {6}" -f "Alias","XML","BGrid","Razor","Angular","Bundle","Tier")
Write-Output ("  " + ("-" * 80))

$elements | Sort-Object Alias | ForEach-Object {
    $row = "  {0,-35} {1,-5} {2,-5} {3,-6} {4,-7} {5,-6} {6}" -f `
        $_.Alias,
        $(if ($_.HasXml)     { "OK" } else { "NO" }),
        $(if ($_.HasBgrid)   { "OK" } else { "NO" }),
        $(if ($_.HasSynHost) { "OK" } else { "NO" }),
        $(if ($_.HasAngular) { "OK" } else { "NO" }),
        $(if ($_.HasBundle)  { "OK" } else { "NO" }),
        $_.AngularTier
    Write-Output $row
}
```

---

## 10. Plan de acción sugerido

Para cada elemento incompleto, el plan de remediación:

```powershell
Write-Output ""
Write-Output "Plan de acción para elementos incompletos:"

$needsWork = @($elements | Where-Object { $_.Level -ne "COMPLETO" }) | Sort-Object Score -Descending

foreach ($el in $needsWork) {
    Write-Output ""
    Write-Output "  $($el.Alias) [$($el.Level)]:"
    if (-not $el.HasBgrid)   { Write-Output "    1. Crear Views/Partials/blockgrid/Components/$($el.Alias).cshtml" }
    if (-not $el.HasSynHost) { Write-Output "    2. Crear Views/Partials/SynHost/$($el.Pascal).cshtml" }
    if (-not $el.HasAngular) { Write-Output "    3. Crear la fuente en platforms/angular/apps/elements/<tier>/$($el.Kebab)/ (copiando la forma de un elemento vivo)" }
    if (-not $el.HasBundle)  { Write-Output "    4. Ejecutar /synergos-cdn-build para $($el.Kebab)" }
}
```
