---
name: synergos-ola-open
description: Abre una nueva Ola de desarrollo de Synergos — empieza por la Fase 0 (medir el árbol heredado antes de tocarlo: worktree propio y trabajo ajeno sin tocar, escritura en GitHub, la línea base de suites con cada rojo por nombre y los de entorno de Windows por ticket, y la lista heredada medida en los dos sentidos), determina el número siguiente, define el alcance y entregables, identifica los ADRs que se crearán, ejecuta un health check inicial, hace backup del DB, y prepara el contexto completo para que synergos-cms-author y synergos-usync-author trabajen con información completa. Invocar al inicio de cada ciclo de trabajo nuevo.
---

# SYNERGOS Ola Open — abrir una nueva Ola de desarrollo

Una Ola en Synergos es el ciclo de trabajo atómico: abre con un contexto definido, termina con todo committeado y documentado. Esta skill prepara ese contexto.

---

## 0. Fase 0 — medir el árbol heredado ANTES de tocarlo

Una Ola casi nunca empieza de cero: hereda un ticket, un informe, una lista de otra sesión, un árbol
con trabajo de alguien más. La auditoría de reutilización aprendió a la fuerza que **lo heredado se
mide antes de ejecutarlo** (`synergos-medir`):

1. **¿Dónde estoy parado, y es mío?** Dos sesiones en el mismo disco se pisan aunque cada una crea
   tener su carpeta.
   ```bash
   git -C "$cms" worktree list; git -C "$cms" status --short; git -C "$cms" log --oneline -5 --date=iso --format='%h %ad %s'
   git -C "$ui"  worktree list; git -C "$ui"  status --short; git -C "$ui"  log --oneline -5 --date=iso --format='%h %ad %s'
   ```
   Si hay cambios sin commitear que no son tuyos, **no se tocan ni se limpian**: se trabaja en un
   worktree propio y se avisa. Una sesión, su worktree (`synergos-medir` §6).
2. **¿Puedo escribir en GitHub?** Sin eso no hay ticket, y sin ticket no hay código
   (`synergos-ticket-first` §6: el remoto es el alias `github-cherced`).
3. **La línea base de las suites, con NOMBRE.** Correr las suites del CMS y los tramos de la UI
   **antes** de tocar nada, y anotar cada rojo por su nombre de test. Los de entorno de Windows están
   nombrados en el #170 y en UI#79 (`CLAUDE.md` §5 del CMS, `feedback_a_dev_machine_is_not_ci`); uno
   que no esté ahí es real y es **anterior** a la Ola. Así, al cierre, un rojo se compara por nombre
   y no se le echa la culpa —ni se le perdona— por vecindad.
4. **La lista heredada se mide, en los dos sentidos.** Cada ítem de un ticket o un informe viejo se
   cruza con el disco antes de ejecutarlo: lo que ya está hecho, lo que ya no aplica, **y lo que falta
   y la lista no dice**. Lo que decide algo, con dos métodos. La auditoría recibió «retirar doce
   piezas» y, medidas una por una, la respuesta fue retirar ninguna; y la regla que decía «9 de 12
   patterns» era falsa (UI regla 39).
5. **Las decisiones de producto que la lista trae tomadas, se devuelven como preguntas** (retirar,
   sacar del CMS, fusionar): un agente no las cierra (`synergos-ticket-first` §8).

---

## 1. Determinar el número de Ola siguiente

```powershell
# Buscar el número de Ola más alto en los commits recientes
$lastOlaCommit = git log --oneline --all | Select-String -Pattern 'ola-(\d+)' |
    ForEach-Object {
        if ($_.Matches[0].Groups[1].Value -match '^\d+$') {
            [int]$_.Matches[0].Groups[1].Value
        }
    } | Sort-Object -Descending | Select-Object -First 1

# También buscar en los docs
$lastOlaDoc = Get-ChildItem "refactor-docs\architecture" -Filter "*.md" -Recurse |
    Select-String -Pattern 'OLA-(\d+)' |
    ForEach-Object { [int]$_.Matches[0].Groups[1].Value } |
    Sort-Object -Descending | Select-Object -First 1

$lastOla  = [Math]::Max($lastOlaCommit, $lastOlaDoc)
$nextOla  = $lastOla + 1
$olaId    = "OLA-$($nextOla.ToString('D3'))"

Write-Output "Última Ola detectada: OLA-$lastOla"
Write-Output "Próxima Ola: $olaId"
```

---

## 2. Definir el alcance de la Ola

El alcance debe responder:
- ¿Qué schema nuevo se crea? (ElementTypes, DataTypes, Compositions)
- ¿Qué Razor views se necesitan?
- ¿Qué componentes Angular se crean o modifican?
- ¿Qué contenido editorial se crea?
- ¿Qué ADRs se abrirán?
- ¿Hay cambios a seams existentes que requieren tests?

**Template de contexto de Ola:**

```markdown
# {OLA-NNN} — {Título}

## Objetivo
{Qué se quiere lograr al final de esta Ola — en 1-2 frases.}

## Entregables

### Schema (uSync XMLs)
- [ ] ElementType: elementSyn{Name} — {descripción}
- [ ] DataType: DT{Name} — {descripción}
- [ ] Composition: comp{Name} — {descripción}

### Razor
- [ ] SynHost/{Name}.cshtml
- [ ] blockgrid/Components/elementSyn{Name}.cshtml

### Angular
- [ ] {tier}/{name} — {descripción del componente}

### Colocables (ADR 0134 — `synergos-funcionalidad`)
- [ ] {name}: **funcionalidad | pieza** — {qué necesita recibir para funcionar}
  - funcionalidad → cableado: secciones de diccionario · configuración de negocio (`Synergos:Features:<X>`, ADR 0137 aceptada) · decisiones como selector · identidad por runtime
  - pieza → su gemela del design system (buscada por concepto) y que el elemento la monte
- [ ] Reusos: el DATO que pide cada elemento reusado (vista SynHost + sanitizador), no su nombre

### Bundles CDN
- [ ] registry.json actualizado
- [ ] `$CDN_ROOT/{name}/angular/latest/main.js` publicado (`synergos-cdn-build`)

### Contenido editorial
- [ ] {Tipo de contenido}: {descripción de los nodos a crear}

### ADRs
- [ ] ADR-{NNNN}: {Título} — {razón}

### Tests
- [ ] Tests para {seam}: empty, happy, filter, idempotent

## Restricciones / dependencias
{Cualquier restricción conocida: ADRs que deben respetarse, composiciones que existen,
GUIDs que NO deben reutilizarse, etc.}
```

---

## 3. Health check inicial

Verificar el estado del stack antes de empezar:

```powershell
# $cms, $cdnRoot, $base, $backups: synergos-guardrails/references/entorno.md
# CMS — /_health: 200 y 503 son los dos un proceso arriba (503 = alguna probe en rojo)
$cmsOk = $false
try {
    Invoke-WebRequest "$base/_health" -UseBasicParsing -TimeoutSec 5 | Out-Null
    $cmsOk = $true
    Write-Output "CMS: OK"
} catch {
    if ($_.Exception.Response) { $cmsOk = $true; Write-Warning "CMS: arriba, con alguna probe en rojo (synergos-health-check)" }
    else { Write-Warning "CMS: NO responde — ejecutar synergos-run-dev antes de empezar" }
}

# Registry
try {
    $reg   = Get-Content (Join-Path $cdnRoot "registry.json") -Raw | ConvertFrom-Json
    $count = @($reg.elements).Count
    Write-Output "Bundle registry: OK — $count elementos"
} catch {
    Write-Warning "Bundle registry: NO legible"
}

# DB
$dbPath = Join-Path $cms "Synergos.CMS.Web\umbraco\Data\Umbraco.sqlite.db"
if (Test-Path $dbPath) {
    $sizeMB = [Math]::Round((Get-Item $dbPath).Length / 1MB, 2)
    Write-Output "DB: OK — $sizeMB MB"
} else {
    Write-Warning "DB: NO encontrada — primer arranque o DB no creada aún"
}
```

---

## 4. Backup de apertura

```powershell
$backupDir  = $backups   # $SYNERGOS_BACKUP_DIR — fuera del repo
$timestamp  = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $backupDir) { Write-Error "Definí SYNERGOS_BACKUP_DIR (fuera del repo)."; exit 1 }
$backupPath = Join-Path $backupDir "Umbraco-ola-open-$olaId-$timestamp.sqlite.db"

if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory $backupDir | Out-Null }

if (Test-Path $dbPath) {
    Copy-Item $dbPath $backupPath -Force
    $sizeMB = [Math]::Round((Get-Item $backupPath).Length / 1MB, 2)
    Write-Output "Backup de apertura: $backupPath ($sizeMB MB)"
} else {
    Write-Warning "Sin DB para respaldar — Ola sin backup de apertura"
}
```

---

## 5. Inventario inicial (snapshot del estado actual)

Antes de hacer cualquier cambio, registrar el estado inicial:

```powershell
$uSyncCT = Join-Path $cms "Synergos.CMS.Web\uSync\v9\ContentTypes"
$uSyncDT = Join-Path $cms "Synergos.CMS.Web\uSync\v9\DataTypes"

# Contar elementos actuales
$elementCount   = (Get-ChildItem $uSyncCT -Filter "elementSyn*.config" -Recurse).Count
$compCount      = (Get-ChildItem $uSyncCT -Filter "comp*.config" -Recurse).Count
$dtCount        = (Get-ChildItem $uSyncDT -Filter "*.config" -Recurse).Count
$ctTotal        = (Get-ChildItem $uSyncCT -Filter "*.config" -Recurse).Count
$bundleCount    = try { @((Get-Content (Join-Path $cdnRoot "registry.json") -Raw | ConvertFrom-Json).elements).Count } catch { 0 }

Write-Output ""
Write-Output "══════════════════════════════════════════════"
Write-Output "  Estado inicial para $olaId"
Write-Output "══════════════════════════════════════════════"
Write-Output "  ContentTypes totales : $ctTotal"
Write-Output "  ElementTypes (elementSyn*): $elementCount"
Write-Output "  Compositions (comp*)  : $compCount"
Write-Output "  DataTypes             : $dtCount"
Write-Output "  Bundles en registry   : $bundleCount"
Write-Output "══════════════════════════════════════════════"
Write-Output "  Al cerrar la Ola, estos números cambiarán."
Write-Output "══════════════════════════════════════════════"
```

---

## 6. Verificar el último commit

```powershell
Write-Output "Último commit:"
git log --oneline -5

Write-Output ""
Write-Output "Estado del working tree:"
git status --short
```

Si hay archivos sin commitear del trabajo anterior: completar/commitear antes de abrir la nueva Ola
—si son **tuyos**—. Si son de otra sesión, no se tocan: Fase 0, punto 1.

---

## 7. Contexto para skills subsiguientes

Al abrir la Ola, proporcionar este contexto a `synergos-cms-author` y `synergos-usync-author`:

```
Ola activa: {OLA-NNN}
Objetivo: {una línea}
ADRs a respetar en esta Ola: ADR-0001 (Umbraco 13), ADR-0008 (uSync source of truth),
  ADR-0010 (IBrandingProvider), ADR-0012 (IBundleRegistryClient), ADR-0013 (no seeders),
  + cualquier ADR específico al dominio de esta Ola

Naming para esta Ola:
  ElementType alias: elementSyn{Name}
  Angular tier: {tier basado en la naturaleza del componente}
  GUID quad-check: obligatorio antes de asignar

Estado inicial:
  {N} ElementTypes, {N} Compositions, {N} DataTypes, {N} bundles
```

---

## 8. Reporte de apertura

```
══════════════════════════════════════════════════════
  SYNERGOS — Apertura de {OLA-NNN}
══════════════════════════════════════════════════════
  Título    : {título}
  Fecha     : {fecha}
  Backup    : {path del backup de apertura}

  Stack:
    CMS     : {OK / NO CORRIENDO}
    Registry: {N} elementos
    DB      : {N} MB

  Fase 0:
    Worktree        : {ruta} — propio / con trabajo ajeno sin tocar
    GitHub          : escritura {sí / no — ticket redactado para el arquitecto}
    Rojos de partida: {nombre de cada test en rojo · de entorno (#170, UI#79) o real}
    Lista heredada  : {ítems medidos: hechos / ya no aplican / faltaban y no estaban}

  Entregables planificados:
    Schema  : {N} tipos nuevos
    Razor   : {N} views
    Angular : {N} componentes
    ADRs    : {N} nuevos

  ADRs que rigen esta Ola:
    {lista de ADRs relevantes}

  Listo para comenzar.
  Próximos pasos: /synergos-cms-author o /synergos-usync-author
══════════════════════════════════════════════════════
```

---

## 9. Convenciones de Ola — recordatorio

| Regla | Detalle |
|-------|---------|
| GUIDs | Quad-check obligatorio antes de asignar cualquier GUID nuevo |
| Commits | Atómicos por tipo de archivo (XMLs separados de C#, separados de Razor) |
| DB | No se commitea (`Umbraco.sqlite.db` en .gitignore) |
| Backups | En `$SYNERGOS_BACKUP_DIR` — fuera del repo |
| Encoding | UTF-8 sin BOM para todos los XMLs |
| IsElement | Inmutable post-creación — planificar antes de crear |
| Storage type | Key nueva si cambia el Type de un DataType existente |
| Seeders | Prohibidos en boot (ADR 0013) |
| Code-first | Prohibido para schema (ADR 0008) |
| Multi-culture | Variations=Culture por defecto en todos los tipos y propiedades |
