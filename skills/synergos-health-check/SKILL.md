---
name: synergos-health-check
description: Diagnóstico rápido del stack de Synergos — /_health del CMS (sus probes con nombre), bundle registry y CDN estático, sitio público, integridad de la DB, respaldo reciente y el audit del schema uSync. Genera un reporte semáforo (OK/WARN/FAIL) en segundos. Punto de partida de cualquier sesión de trabajo o verificación post-deploy.
model: claude-opus-4-8
---

# SYNERGOS Health Check — diagnóstico del stack

Ejecutar al inicio de cada sesión y después de cualquier cambio de infraestructura.

> **Un chequeo que no puede dar verde no es un chequeo.** Esta skill vivía de la Management API,
> que Umbraco 13 no tiene (ADR 0093): reportaba `FAIL` en TODA corrida, por diseño, y un semáforo
> siempre rojo deja de leerse y arrastra a los que sí dicen algo (#141, #142). Cada chequeo de abajo
> pregunta algo que el stack de hoy puede contestar que sí.

---

## Script completo (ejecutar todo junto)

```powershell
# $cms, $cdnRoot, $base, $backups: synergos-guardrails/references/entorno.md
$dbPath = Join-Path $cms 'Synergos.CMS.Web\umbraco\Data\Umbraco.sqlite.db'
$report = New-Object System.Collections.Generic.List[PSCustomObject]
function Add-Check([string]$Name, [string]$Status, [string]$Detail) {
    $report.Add([PSCustomObject]@{ Check = $Name; Status = $Status; Detail = $Detail })
}

# ─── 1. /_health — el CMS dice cómo está, probe por probe ───────────────────
try {
    $r = Invoke-WebRequest "$base/_health" -UseBasicParsing -TimeoutSec 8
    $cuerpo = $r.Content
} catch {
    $resp = $_.Exception.Response
    $cuerpo = if ($resp) { (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } else { $null }
}
if ($cuerpo) {
    $salud = $cuerpo | ConvertFrom-Json
    $rojas = @($salud.checks | Where-Object { -not $_.healthy })
    $estado = if ($rojas.Count -eq 0) { 'OK' } else { 'FAIL' }
    Add-Check 'CMS /_health' $estado "status=$($salud.status) · versión=$($salud.version) · $(@($salud.checks).Count) probes"
    foreach ($p in $rojas) { Add-Check "  probe $($p.name)" 'FAIL' $p.message }
} else {
    Add-Check 'CMS /_health' 'FAIL' "El CMS no contesta en $base — synergos-run-dev"
}

# ─── 2. Bundle registry, del disco ──────────────────────────────────────────
$regPath = Join-Path $cdnRoot 'registry.json'
$reg = $null
try {
    $reg = Get-Content $regPath -Raw | ConvertFrom-Json
    Add-Check 'Bundle Registry' 'OK' "$(@($reg.elements).Count) elementos — generado $($reg.generated)"
} catch {
    Add-Check 'Bundle Registry' 'FAIL' "No hay registry legible en $regPath — npm run build:cdn en la UI"
}

# ─── 3. CDN estático, servido por el CMS ────────────────────────────────────
if ($reg -and $cuerpo) {
    $el = @($reg.elements) | Where-Object { $_.implementations.angular } | Select-Object -First 1
    if ($el) {
        $url = "$base/cdn-bundles/synergos/$($el.name)/angular/latest/main.js"
        try {
            $r2 = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 8
            Add-Check 'CDN Static' 'OK' "$($el.name) → $($r2.StatusCode) — Cache-Control: $($r2.Headers['Cache-Control'])"
        } catch { Add-Check 'CDN Static' 'FAIL' "Bundle no accesible: $url" }
    } else { Add-Check 'CDN Static' 'WARN' 'El registry no trae ningún elemento con implementación angular' }
}

# ─── 4. Sitio público ───────────────────────────────────────────────────────
try {
    $pub = Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 8
    $vacio = $pub.Content -match 'No published content'
    $importMap = $pub.Content -match '<script type="importmap"'
    $estado = if ($vacio) { 'WARN' } elseif ($importMap) { 'OK' } else { 'FAIL' }
    Add-Check 'Sitio Público' $estado "HTTP $($pub.StatusCode) · portada: $(-not $vacio) · import map: $importMap"
} catch { Add-Check 'Sitio Público' 'WARN' 'El sitio no responde — ¿sin portada? (POST /dev/seed-portada)' }

# ─── 5. Integridad de la DB ─────────────────────────────────────────────────
if (Test-Path $dbPath) {
    $sizeMB = [Math]::Round((Get-Item $dbPath).Length / 1MB, 2)
    if (Get-Command sqlite3 -ErrorAction SilentlyContinue) {
        $integrity = & sqlite3 $dbPath 'PRAGMA integrity_check;' 2>&1
        Add-Check 'DB Integrity' $(if ($integrity -eq 'ok') { 'OK' } else { 'FAIL' }) "PRAGMA: $integrity — $sizeMB MB"
    } else { Add-Check 'DB Integrity' 'WARN' "sqlite3 no está en el PATH — la DB existe ($sizeMB MB)" }
} else { Add-Check 'DB Integrity' 'WARN' 'DB no encontrada — ¿primer arranque?' }

# ─── 6. Respaldo reciente ───────────────────────────────────────────────────
if ($backups -and (Test-Path $backups)) {
    $ultimo = Get-ChildItem $backups -Filter '*.sqlite.db' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($ultimo) {
        $age = [Math]::Round(((Get-Date) - $ultimo.LastWriteTime).TotalHours, 1)
        Add-Check 'Último Backup' $(if ($age -gt 48) { 'WARN' } else { 'OK' }) "$($ultimo.Name) — hace $age h"
    } else { Add-Check 'Último Backup' 'WARN' 'Sin backups — synergos-db-ops (backup)' }
} else { Add-Check 'Último Backup' 'WARN' 'SYNERGOS_BACKUP_DIR sin definir o inexistente' }

# ─── 7. Schema uSync — el XML es la fuente (ADR 0008) ───────────────────────
Push-Location $cms
$audit = node tools/usync-audit.mjs 2>&1
$auditExit = $LASTEXITCODE
Pop-Location
Add-Check 'Schema (usync-audit)' $(if ($auditExit -eq 0) { 'OK' } else { 'FAIL' }) ($audit | Select-Object -Last 1)

# ─── Reporte ────────────────────────────────────────────────────────────────
$fails = @($report | Where-Object Status -eq 'FAIL').Count
$warns = @($report | Where-Object Status -eq 'WARN').Count
$oks   = @($report | Where-Object Status -eq 'OK').Count
$overall = if ($fails -gt 0) { 'DEGRADADO' } elseif ($warns -gt 0) { 'PARCIAL' } else { 'SALUDABLE' }
Write-Output ''
Write-Output "  SYNERGOS Health Check — $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Output "  Estado: $overall  [$oks OK | $warns WARN | $fails FAIL]"
$report | ForEach-Object {
    $icon = switch ($_.Status) { 'OK' { '✓' } 'WARN' { '⚠' } 'FAIL' { '✗' } }
    Write-Output ("  {0} {1,-5} {2,-22} {3}" -f $icon, $_.Status, $_.Check, $_.Detail)
}
Write-Output "  Backoffice : $base/umbraco/"
Write-Output "  Registry   : $regPath"
```

---

## Interpretación del reporte

| Estado global | Significado | Acción |
|---------------|-------------|--------|
| `SALUDABLE` | Todo OK | Proceder con el trabajo |
| `PARCIAL` | Hay WARNs pero nada roto | Revisar WARNs; puede trabajarse |
| `DEGRADADO` | Al menos un FAIL | Resolver FAILs antes de continuar |

### Acciones rápidas por síntoma

| Check fallido | Acción inmediata |
|---------------|-----------------|
| CMS /_health sin respuesta | `synergos-run-dev` |
| Una probe en rojo | Su `message` dice qué es; la del bundle registry casi siempre es el CDN sin construir |
| Bundle Registry FAIL | `npm run build:cdn` en la UI — **no** crear un registry vacío (#126) |
| CDN Static FAIL | `synergos-cdn-build` |
| Sitio Público FAIL (200 sin import map) | La portada se ve y no hidrata: `node tools/humo-conectado.mjs` nombra la causa |
| DB Integrity FAIL | Detener CMS + restore desde backup (`synergos-db-ops`) |
| Último Backup WARN >48h | `synergos-db-ops`, función `Backup-SynergosSqlite` |
| Schema (usync-audit) FAIL | El audit lista cada hallazgo con su fichero; arreglar el XML (`synergos-usync-author`) |

> Este semáforo mira un CMS **ya corriendo**. Para probar que un clon limpio da una portada que
> hidrata, sin depender de nada levantado: `node tools/humo-portada.mjs` y
> `node tools/humo-conectado.mjs` en el CMS (`synergos-smoke-test`).
