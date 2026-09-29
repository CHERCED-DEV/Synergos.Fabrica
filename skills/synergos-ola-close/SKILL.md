---
name: synergos-ola-close
description: Cierra una Ola de desarrollo de Synergos siguiendo el flujo estándar de 20 pasos — verifica entregables, corre las suites y los gates del schema (usync-audit, usync-rebuild-check), hace backup, commitea uSync XMLs + Razor + Angular con el mensaje canónico en cada repo, actualiza §11.x en los docs de arquitectura, y genera el resumen de cierre. Invocar al terminar todos los trabajos de una Ola antes de comenzar la siguiente.
model: claude-opus-4-8
---

# SYNERGOS Ola Close — cierre estándar de una Ola

Una Ola (wave/sprint) en Synergos termina solo cuando todos sus entregables están committeados,
documentados, y el schema está sincronizado entre uSync XMLs y el DB. Este procedimiento es el que
describe `feedback_ola_execution_flow` (20 pasos del flujo B).

Las rutas salen de `synergos-guardrails/references/entorno.md` (`$cms`, `$ui`, `$cdnRoot`, `$base`,
`$backups`). **Son repos distintos**: cada comando de git va con `git -C <repo>`, y cada repo lleva su
propio commit.

---

## 0. Inputs necesarios

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `$olaNum` | Número de la Ola (formato `OLA-XXX`) | `OLA-310` |
| `$olaTitle` | Título corto de lo que se hizo | `ElementType synPricingCard + bundle Angular` |
| `$adrsCreated` | Lista de ADRs creados/cerrados | `ADR-0093, ADR-0094` |
| `$deliverables` | Lista de entregables concretos | Ver §1 |

Si el usuario no los proporcionó, inferirlos del contexto de la conversación / git status.

---

## 1. Verificar entregables de la Ola

```powershell
$olaNum = "OLA-310"  # reemplazar

# 1A. uSync XMLs (repo del CMS)
$newXmls = git -C $cms status --porcelain -- "Synergos.CMS.Web/uSync"
if ($newXmls) { Write-Output "uSync:"; $newXmls | ForEach-Object { Write-Output "  $_" } }
else          { Write-Output "  (sin cambios de schema en esta Ola)" }

# 1B. Razor views (repo del CMS)
$razorNew = git -C $cms status --porcelain -- "Synergos.CMS.Web/Views"
if ($razorNew) { Write-Output "Razor:"; $razorNew | ForEach-Object { Write-Output "  $_" } }

# 1C. Elementos de la UI (repo de la UI)
$uiNew = git -C $ui status --porcelain -- "platforms"
if ($uiNew) { Write-Output "UI:"; $uiNew | ForEach-Object { Write-Output "  $_" } }

# 1D. El CDN construido (lo que el CMS lee en Development)
$regPath = Join-Path $cdnRoot 'registry.json'
if (Test-Path $regPath) {
    $reg = Get-Content $regPath -Raw | ConvertFrom-Json
    Write-Output "Bundle registry: $(@($reg.elements).Count) elementos — generado $($reg.generated)"
} else { Write-Warning "Sin registry en $cdnRoot — si la Ola tocó la UI, falta npm run build:cdn" }

# 1E. Tests nuevos (repo del CMS)
$testNew = git -C $cms status --porcelain -- "*Tests*"
if ($testNew) { Write-Output "Tests:"; $testNew | ForEach-Object { Write-Output "  $_" } }
```

**Si un entregable esperado no está:** no cerrar la Ola — completarlo primero.

---

## 2. Suites y gates antes de commitear

Las suites del CMS son las que lista `CLAUDE.md` §0.9 (con su cifra, que `SuiteCountTests` cuadra
contra cada ensamblado): no se copia acá cuántas son ni cuántos tests tienen.

```bash
cd "$cms"

# 2A. Cada proyecto de tests del árbol — la lista sale del disco, no de esta skill
find . -name '*Tests.csproj' -not -path '*/bin/*' -not -path '*/obj/*' | while read p; do
  dotnet test "$p" --nologo || { echo "ROJO: $p — no cerrar la Ola"; exit 1; }
done

# 2B. El schema del disco está sano
node tools/usync-audit.mjs

# 2C. Si la Ola tocó schema: base vacía + XML = entorno completo (ADR 0128)
node tools/usync-rebuild-check.mjs
```

Si la Ola tocó la UI: `npm test` en `$ui` (corre los gates de contrato y las suites de cada
plataforma; ver `Synergos.UI/CLAUDE.md`).

---

## 3. Backup pre-cierre

```powershell
$dbPath    = Join-Path $cms 'Synergos.CMS.Web\umbraco\Data\Umbraco.sqlite.db'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $backups) { Write-Error 'Definí SYNERGOS_BACKUP_DIR (fuera del repo).'; exit 1 }
if (Test-Path $dbPath) {
    if (-not (Test-Path $backups)) { New-Item -ItemType Directory $backups | Out-Null }
    $dest = Join-Path $backups "Umbraco-ola-close-$olaNum-$timestamp.sqlite.db"
    Copy-Item $dbPath $dest -Force
    Write-Output "Backup pre-cierre: $dest ($([Math]::Round((Get-Item $dest).Length / 1MB, 2)) MB)"
}
```

Con el CMS corriendo la copia puede salir a medio escribir: el protocolo completo (parar →
checkpoint del WAL → copiar) es `synergos-db-ops`.

---

## 4. ¿El entorno sigue arriba?

```powershell
try { Invoke-WebRequest "$base/_health" -UseBasicParsing -TimeoutSec 5 | Out-Null; Write-Output 'CMS /_health: 200' }
catch {
    if ($_.Exception.Response) { Write-Warning 'CMS /_health: 503 — alguna probe en rojo (synergos-health-check)' }
    else { Write-Warning 'CMS no responde — el commit puede seguir; la verificación en vivo, no' }
}
```

---

## 5. Commitear — un commit por repo, con rutas explícitas

El formato de commit sigue el patrón `feat(ola-NNN): ...`, `fix(ola-NNN): ...`, `docs(ola-NNN): ...`.

```powershell
# 5A. Ver qué hay en cada repo
git -C $cms status --short
git -C $ui  status --short

# 5B. Staging selectivo — NUNCA git add -A ni git add . (la DB, node_modules y public/ no entran)
git -C $cms add -- "Synergos.CMS.Web/uSync" "Synergos.CMS.Web/Views"   # + los .cs y tests de la Ola
git -C $ui  add -- "platforms/angular/apps"                             # + lo que la Ola tocó

# 5C. Verificar qué está staged, repo por repo
git -C $cms diff --cached --name-only
git -C $ui  diff --cached --name-only

# 5D. Commit con rutas explícitas (en un checkout compartido, un commit sin rutas se lleva lo ajeno)
$olaTag = $olaNum.ToLower()
git -C $cms commit -m "feat($olaTag): $olaTitle" -- "Synergos.CMS.Web/uSync" "Synergos.CMS.Web/Views"
git -C $ui  commit -m "feat($olaTag): $olaTitle" -- "platforms/angular/apps"
git -C $cms log --oneline -3
```

---

## 6. Actualizar documentación §11.x

Si la Ola generó ADRs nuevos, actualizar el estado del refactor (`00-current-state-synergos-cms.md`
en `refactor-docs/architecture/`, en el repo contenedor si tu máquina lo tiene — ver
`synergos-adr-author`). El conteo de ADRs no se escribe de memoria: se cuenta del disco.

```powershell
$adrs = @(Get-ChildItem (Join-Path $cms 'Synergos.CMS.Web\docs\adr') -Filter '[0-9][0-9][0-9][0-9]-*.md').Count
Write-Output "ADRs en el disco: $adrs"
```

**Instrucción para el arquitecto si hay ADRs nuevos:**
```
Actualizar 00-current-state-synergos-cms.md:

§11.2 — el conteo de ADRs: el que da el disco (comando de arriba)
§11.2 — agregar los nuevos ADRs a la tabla de índice
§11.XX — agregar la sección de cierre de esta Ola con:
  - Número y nombre de la Ola
  - ADRs creados/cerrados
  - Entregables: schema, Razor, Angular, bundles
  - Estado final (CLOSED / MERGED)
```

---

## 7. Verificar que el Import ya se aplicó

Si la Ola incluyó cambios de schema, que el Import haya entrado se comprueba contra el XML y la
base en sólo lectura — es el §6 de `synergos-usync-import` (Umbraco 13 no tiene una API que liste
los tipos, ADR 0093). Si algún alias del XML no está en la base: correr `synergos-usync-import`
antes de cerrar.

---

## 8. Reporte de cierre

```
════════════════════════════════════════════════════════
  SYNERGOS — Cierre de $olaNum
════════════════════════════════════════════════════════
  Título     : $olaTitle
  Fecha      : $(Get-Date -Format 'yyyy-MM-dd HH:mm')
  Commits    : $(git -C $cms log --oneline -1) · $(git -C $ui log --oneline -1)

  Entregables:
    Schema (uSync XMLs) : $($newXmls.Count) cambios
    Razor views         : $($razorNew.Count) cambios
    UI                  : $($uiNew.Count) cambios
    Bundles CDN         : $(@($reg.elements).Count) en registry.json
    Suites + gates      : verdes (§2)

  ADRs de esta Ola:
    $adrsCreated

  Backup pre-cierre:
    $dest

  Siguiente Ola: ¿qué sigue?
════════════════════════════════════════════════════════
```

---

## 9. Logs a ignorar durante el cierre (ruido normal)

```
warn: Umbraco.Cms.Core.Services.LocalizedTextService — Could not find localization file
info: ModelsBuilder: FlagOutOfDateModels (si IsElement cambió)
warn: uSync: Skipping [no changes detected] (para tipos que no cambiaron)
```

## 10. Señales que sí detienen el cierre

```
error: una suite o un gate en rojo (§2)
error: UNIQUE constraint failed — GUID collision en uSync
error: DB integrity check failed
error: git commit rechazado por pre-commit hook
```

Si alguna se activa: resolver antes de marcar la Ola como cerrada.
