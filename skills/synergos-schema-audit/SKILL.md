---
name: synergos-schema-audit
description: Auditoría completa del schema de Synergos — cruza uSync XMLs contra Razor views, Angular projects, registry.json y código C# para encontrar orphans, ElementTypes incompletos, DataTypes sin uso, compositions sin consumers, GUIDs rotos en BlockLists, y elementos "a medias". Genera un reporte accionable por categoría, con red por el vacío en cada conteo (un paso que da cero en todo está roto, no limpio), y sin proponer retirar nada por defecto: lo que no tiene consumidor es vocabulario hasta que el arquitecto decida (ADR 0134).
model: claude-opus-4-8
---

# SYNERGOS Schema Audit — auditoría cruzada del schema

Esta skill detecta inconsistencias entre las 5 fuentes de verdad del schema:
1. `uSync/v9/ContentTypes/` — XMLs de DocTypes/ElementTypes/Compositions
2. `uSync/v9/DataTypes/` — XMLs de DataTypes
3. `Views/Partials/SynHost/` — Razor renderers
4. `Synergos.UI/platforms/` — las fuentes de la UI (cada carpeta con `src/main.ts`)
5. `$CDN_ROOT/registry.json` — bundles publicados (`synergos-guardrails/references/entorno.md`)

---

## 0. Rutas base

```powershell
# $cms, $ui, $cdnRoot, $base: synergos-guardrails/references/entorno.md
$uSyncCT     = "$cms\Synergos.CMS.Web\uSync\v9\ContentTypes"
$uSyncDT     = "$cms\Synergos.CMS.Web\uSync\v9\DataTypes"
$synHostDir  = "$cms\Synergos.CMS.Web\Views\Partials\SynHost"
$bgridDir    = "$cms\Synergos.CMS.Web\Views\Partials\blockgrid\Components"
$uiPlatforms = Join-Path $ui "platforms"
$registryPath = Join-Path $cdnRoot "registry.json"
```

---

## 1. Inventario de ElementTypes en uSync

```powershell
$elementTypes = Get-ChildItem $uSyncCT -Filter "elementSyn*.config" -Recurse |
    ForEach-Object {
        [xml]$xml = Get-Content $_.FullName -Encoding UTF8
        [PSCustomObject]@{
            File     = $_.Name
            Alias    = $xml.ContentType.GetAttribute("Alias")
            Key      = $xml.ContentType.GetAttribute("Key")
            IsElement= $xml.ContentType.Info.IsElement
            Name     = $xml.ContentType.Info.Name
        }
    } | Where-Object { $_.IsElement -eq "true" }

Write-Output "ElementTypes en uSync: $($elementTypes.Count)"
$elementTypes | ForEach-Object { Write-Output "  · $($_.Alias)  ($($_.Key))" }
```

---

## 2. Inventario de Compositions en uSync

Una composition la **usa** un ContentType que la nombra en `<Info><Compositions><Composition Key="…">`.
Se cuenta por esa **estructura**, no buscando la Key como texto: el fichero de la propia composition
también contiene su Key, y el conteo por texto que vivía acá la excluía mal —comparaba la ruta con su
propio nombre de fichero, que siempre casa— y daba **cero consumidores a todas**. Medido sobre el
árbol: por texto, ninguna con consumidor; por estructura, casi todas. Es el sujeto que se cuenta a
sí mismo, del revés (`synergos-medir` §1).

```powershell
# Quién compone qué: la estructura del XML, no la Key como texto
$usos = @{}
foreach ($f in Get-ChildItem $uSyncCT -Recurse -Filter "*.config") {
    [xml]$x = Get-Content $f.FullName -Encoding UTF8
    foreach ($c in @($x.ContentType.Info.Compositions.Composition)) {
        if ($c -and $c.Key) { $usos[$c.Key] = 1 + [int]$usos[$c.Key] }
    }
}

$compositions = @(Get-ChildItem $uSyncCT -Filter "comp*.config" -Recurse | ForEach-Object {
    [xml]$xml = Get-Content $_.FullName -Encoding UTF8
    $key  = $xml.ContentType.GetAttribute("Key")
    $desc = [string]$xml.ContentType.Info.Description
    [PSCustomObject]@{
        Alias     = $xml.ContentType.GetAttribute("Alias")
        Key       = $key
        Reserved  = ($desc -match '^\[Bloqueado externamente' -or $desc -match '^\[Disponible')
        Consumers = [int]$usos[$key]
    }
})

# Red por el vacío: si TODAS salen sin consumidor, lo roto es el conteo, no el schema
if ($compositions.Count -gt 0 -and @($compositions | Where-Object { $_.Consumers -gt 0 }).Count -eq 0) {
    throw "Ninguna composition tiene consumidor: el conteo está roto, no reportar."
}

$sinConsumidor = @($compositions | Where-Object { -not $_.Reserved -and $_.Consumers -eq 0 })
Write-Output "Compositions totales: $($compositions.Count)"
Write-Output "  Sin consumidor y sin marker: $($sinConsumidor.Count)"
$sinConsumidor | ForEach-Object { Write-Warning "  SIN CONSUMIDOR: $($_.Alias)  ($($_.Key))" }
```

---

## 3. Inventario de DataTypes en uSync

```powershell
$dataTypes = Get-ChildItem $uSyncDT -Filter "*.config" -Recurse |
    ForEach-Object {
        [xml]$xml = Get-Content $_.FullName -Encoding UTF8
        [PSCustomObject]@{
            Alias  = $xml.DataType.GetAttribute("Alias")
            Key    = $xml.DataType.GetAttribute("Key")
            Editor = [string]$xml.DataType.Info.EditorAlias   # en el disco va en <Info>, no como atributo
            Config = [string]$xml.DataType.Config.InnerText   # JSON en CDATA; no hay <PreValues>
            File   = $_.FullName
        }
    }

# Encontrar DataTypes no usados en ningún ContentType
$usedDTKeys = [System.Collections.Generic.HashSet[string]]::new()
Get-ChildItem $uSyncCT -Recurse -Filter "*.config" | ForEach-Object {
    [xml]$xml = Get-Content $_.FullName -Encoding UTF8
    $xml.ContentType.GenericProperties.GenericProperty | ForEach-Object {
        $usedDTKeys.Add($_.Type) | Out-Null
        $usedDTKeys.Add($_.Definition) | Out-Null
    }
}

$unusedDTs = $dataTypes | Where-Object { -not $usedDTKeys.Contains($_.Key) }
Write-Output "DataTypes totales: $($dataTypes.Count)"
Write-Output "DataTypes sin uso en ContentTypes: $($unusedDTs.Count)"
$unusedDTs | ForEach-Object { Write-Output "  · $($_.Alias) [$($_.Editor)]" }
```

---

## 4. Cruzar ElementTypes contra Razor views

```powershell
$razorIssues = [System.Collections.Generic.List[string]]::new()

foreach ($et in $elementTypes) {
    # Alias: elementSynHeroBanner → esperar HeroBanner.cshtml en SynHost/
    $pascal     = $et.Alias -replace '^elementSyn', ''
    $synHostFile = "$synHostDir\$pascal.cshtml"
    $bgridFile   = "$bgridDir\$($et.Alias).cshtml"  # o similar

    if (-not (Test-Path $synHostFile)) {
        $razorIssues.Add("MISSING Razor SynHost: $pascal.cshtml  (para $($et.Alias))")
    }
    if (-not (Test-Path $bgridFile)) {
        # Block grid wrapper puede tener nombre diferente — buscar por alias
        $found = Get-ChildItem $bgridDir -Filter "*.cshtml" |
            Select-String -Pattern $et.Alias -SimpleMatch -List
        if (-not $found) {
            $razorIssues.Add("MISSING BGrid wrapper para $($et.Alias)")
        }
    }
}

Write-Output "Razor issues: $($razorIssues.Count)"
$razorIssues | ForEach-Object { Write-Warning "  $_" }
```

---

## 5. Cruzar ElementTypes contra las fuentes de la UI

Se descubre lo mismo que compila el build: toda carpeta con un `src/main.ts` es un elemento, y su
nombre de carpeta es su nombre. Los tiers no se listan (son carpetas en plural, y una lista a mano
en singular fue la que dejó a `element-inventory` sin acertar nunca — #141).

```powershell
$angularIssues = [System.Collections.Generic.List[string]]::new()

$fuentes = @(Get-ChildItem $uiPlatforms -Recurse -Filter "main.ts" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -eq "src" -and $_.FullName -notmatch "[\\/]node_modules[\\/]" } |
    ForEach-Object { $_.Directory.Parent.Name })
# Red de seguridad: cero fuentes es un descubrimiento roto, y marcaría TODO como faltante
if ($fuentes.Count -eq 0) { throw "No encontré ningún src/main.ts bajo $($uiPlatforms): el paso está roto, no reportar." }

foreach ($et in $elementTypes) {
    $pascal   = $et.Alias -replace '^elementSyn', ''
    $kebab    = ($pascal -creplace '(?<=[a-z])(?=[A-Z])', '-').ToLower()
    # elementSynHeroBanner → hero-banner
    if ($kebab -notin $fuentes) {
        $angularIssues.Add("MISSING fuente en la UI para $($et.Alias) (esperado: una carpeta $kebab con src/main.ts)")
    }
}

Write-Output "Angular project issues: $($angularIssues.Count)"
$angularIssues | ForEach-Object { Write-Warning "  $_" }
```

---

## 6. Cruzar ElementTypes contra registry.json

```powershell
$registryIssues = [System.Collections.Generic.List[string]]::new()

try {
    $reg      = Get-Content $registryPath -Raw | ConvertFrom-Json
    $regNames = @($reg.elements) | ForEach-Object { $_.name }

    foreach ($et in $elementTypes) {
        $pascal = $et.Alias -replace '^elementSyn', ''
        $kebab  = ($pascal -creplace '(?<=[a-z])(?=[A-Z])', '-').ToLower()

        if ($kebab -notin $regNames) {
            $registryIssues.Add("NOT IN REGISTRY: $($et.Alias) (esperado name: $kebab)")
        }
    }

    # Elementos en registry sin ElementType en uSync
    $etAliases = $elementTypes | ForEach-Object {
        ($($_.Alias -replace '^elementSyn', '') -creplace '(?<=[a-z])(?=[A-Z])', '-').ToLower()
    }
    foreach ($entry in @($reg.elements)) {
        if ($entry.name -notin $etAliases) {
            $registryIssues.Add("REGISTRY ORPHAN: $($entry.name) no tiene ElementType en uSync")
        }
    }
} catch {
    $registryIssues.Add("registry.json no legible: $_")
}

Write-Output "Registry issues: $($registryIssues.Count)"
$registryIssues | ForEach-Object { Write-Warning "  $_" }
```

---

## 7. Verificar GUIDs en BlockLists (collision check)

La configuración de un DataType está en `<Config>` como JSON dentro de CDATA (`Blocks` con
mayúscula); este paso leía `<PreValues>`, que ningún fichero del disco tiene, así que **nunca
revisaba nada** y siempre daba cero. Por eso la red de abajo.

```powershell
$blockListCollisions = [System.Collections.Generic.List[string]]::new()

$blockListDTs = @($dataTypes | Where-Object { $_.Editor -in @("Umbraco.BlockList", "Umbraco.BlockGrid") })
if ($blockListDTs.Count -eq 0) { throw "Ningún DataType BlockList/BlockGrid leído: el paso 3 está roto, no reportar." }

foreach ($dt in $blockListDTs) {
    try { $cfg = $dt.Config | ConvertFrom-Json } catch { Write-Warning "  Config ilegible: $($dt.Alias)"; continue }
    foreach ($block in @($cfg.Blocks)) {
        foreach ($k in @($block.contentElementTypeKey, $block.settingsElementTypeKey)) {
            if ($k -and $k -eq $dt.Key) {
                $blockListCollisions.Add("GUID COLLISION en $($dt.Alias): la Key del DataType es la de un bloque ($k)")
            }
        }
    }
}

Write-Output "BlockList/BlockGrid revisados: $($blockListDTs.Count) - GUID collisions: $($blockListCollisions.Count)"
$blockListCollisions | ForEach-Object { Write-Error "  $_" }
```

---

## 8. Verificar encoding de XMLs

```powershell
$encodingIssues = [System.Collections.Generic.List[string]]::new()

Get-ChildItem "$uSyncCT", "$uSyncDT" -Recurse -Filter "*.config" | ForEach-Object {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        $encodingIssues.Add("UTF-16 LE BOM: $($_.Name)")
    } elseif ($bytes.Length -ge 4 -and $bytes[0] -eq 0x00 -and $bytes[1] -eq 0x3C) {
        $encodingIssues.Add("UTF-16 BE: $($_.Name)")
    }
}

Write-Output "Encoding issues: $($encodingIssues.Count)"
$encodingIssues | ForEach-Object { Write-Warning "  $_" }
```

---

## 9. Reporte final

```powershell
Write-Output ""
Write-Output "═══════════════════════════════════════════════════════════"
Write-Output "  SYNERGOS Schema Audit — $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Write-Output "═══════════════════════════════════════════════════════════"
Write-Output "  ElementTypes      : $($elementTypes.Count)"
Write-Output "  Compositions      : $($compositions.Count)  ($($sinConsumidor.Count) sin consumidor ni marker)"
Write-Output "  DataTypes         : $($dataTypes.Count)  ($($unusedDTs.Count) sin uso)"
Write-Output ""
Write-Output "  Razor issues      : $($razorIssues.Count)"
Write-Output "  Angular issues    : $($angularIssues.Count)"
Write-Output "  Registry issues   : $($registryIssues.Count)"
Write-Output "  BlockList GUID    : $($blockListCollisions.Count)"
Write-Output "  Encoding issues   : $($encodingIssues.Count)"
Write-Output "═══════════════════════════════════════════════════════════"

$total = $sinConsumidor.Count + $unusedDTs.Count + $razorIssues.Count +
         $angularIssues.Count + $registryIssues.Count +
         $blockListCollisions.Count + $encodingIssues.Count

if ($total -eq 0) {
    Write-Output "  Estado: LIMPIO — sin issues detectados"
} elseif ($blockListCollisions.Count -gt 0 -or $encodingIssues.Count -gt 0) {
    Write-Output "  Estado: CRITICO — resolver BlockList/encoding antes del próximo Import"
} else {
    Write-Output "  Estado: CON GAPS — elementos incompletos detectados"
}
Write-Output "═══════════════════════════════════════════════════════════"
```

---

## 10. Acciones por tipo de issue

**Nada de lo que este reporte encuentra se retira por defecto** (ADR 0134 §3, `CLAUDE.md` §0.C.21
del CMS). El reporte mide **alcance**; qué hacer con lo que nadie alcanza es una decisión de producto,
con cuatro salidas —usar, mejorar, fusionar un duplicado, declararlo con su disparador— y retirar
sólo con evidencia de que el concepto sobra, decidido por el arquitecto. Lo mismo vale para el piso
Razor: una pieza SSR con gemela Angular sin usar es una decisión **por concepto** (cuál gana), no
una baja automática.

| Issue | Acción |
|-------|--------|
| Razor MISSING | Crear `SynHost/{Pascal}.cshtml` con patrón ISynHostEmitter (ver synergos-cms-author §5), con las claves que conserva el sanitizador del elemento |
| Angular MISSING | Crear la fuente copiando la forma de un elemento vivo (synergos-cms-author §6); si el concepto ya existe en el design system, montarlo |
| NOT IN REGISTRY | Ejecutar synergos-cdn-build para ese elemento |
| REGISTRY ORPHAN | **No es «sobra»**: puede ser un elemento que otro bundle embebe (`dependencies`, sin DocType por diseño: ADR 0126), uno con alias de otro prefijo, o vocabulario sin colocar. Clasificarlo (`synergos-element-inventory` §7). `registry.json` no se edita a mano: lo escribe la publicación |
| DataType sin uso | Puede ser legacy o vocabulario — verificar si lo usa un MediaType, un MemberType o un bloque antes de decidir nada |
| Composition sin consumidor | Si tiene marker `[Disponible…]`/`[Bloqueado…]` es scaffolding; si no, se anota para el arquitecto — no se propone eliminarla |
| BlockList GUID collision | Asignar Key nuevo al DataType (ver synergos-usync-author §1A) |
| Encoding UTF-16 | Reescribir con `[IO.File]::WriteAllText(path, content, [Text.Encoding]::UTF8)` |
