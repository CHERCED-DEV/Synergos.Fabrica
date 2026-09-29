# Dónde está cada cosa en ESTA máquina

Las skills no cablean rutas de una máquina (#141, criterio a): una ruta que sólo existe en la
máquina de quien la escribió manda a un agente en otro entorno a una carpeta inexistente, y ahí
no degrada en silencio — **el agente concluye que no se puede verificar y se inventa otra
cosa** (#132). Lo que va en una skill es **cómo resolver** la ruta. Estas son las variables, y
casi todas ya las usan las herramientas del CMS y de la UI:

| Variable | Qué es | Si no está definida |
|---|---|---|
| `SYNERGOS_CMS_PATH` | el clon de `Synergos.CMS` | el clon hermano `../Synergos.CMS` — es lo que asumen `tools/lib/rutas-hermanas.mjs` (UI) y `contract-keys.mjs` (CMS) |
| `SYNERGOS_UI_PATH` | el clon de `Synergos.UI` | el clon hermano `../Synergos.UI` |
| `SYNERGOS_CMS_URL` | la URL base del CMS **corriendo** | la del endpoint `Http` de `Kestrel` en `Synergos.CMS.Web/appsettings.Development.json` |
| `CDN_ROOT` | la carpeta que contiene `registry.json` | `$SYNERGOS_UI_PATH/public/synergos` — la salida de `npm run build:cdn` y lo que el CMS lee en Development (`Synergos:BundleRegistry:LocalPath`) |
| `SYNERGOS_CDN` | la raíz a la que **publica** `tools/publish.mjs` (UI) | la que resuelve `resolveCdnRoot` en `tools/lib/synergos-config.mjs`; para el CDN que lee el CMS en Development usá `npm run build:cdn`, que publica en `public/` |
| `SYNERGOS_BACKUP_DIR` | dónde van los respaldos de la base — **fuera del repo** | la convención de `tools/respaldo.sh` (CMS) |

Las lecciones no escritas en un ADR viven versionadas en el `CLAUDE.md` de cada repo —las
memorias `feedback_*` en el §5 del CMS, las reglas numeradas en el de la UI—, no en la carpeta de
memoria local de un agente, que sólo existe en una máquina.

## PowerShell

```powershell
$raiz    = Split-Path (git rev-parse --show-toplevel) -Parent
$cms     = if ($env:SYNERGOS_CMS_PATH) { $env:SYNERGOS_CMS_PATH } else { Join-Path $raiz 'Synergos.CMS' }
$ui      = if ($env:SYNERGOS_UI_PATH)  { $env:SYNERGOS_UI_PATH }  else { Join-Path $raiz 'Synergos.UI' }
$cdnRoot = if ($env:CDN_ROOT)          { $env:CDN_ROOT }          else { Join-Path $ui 'public\synergos' }
$base    = if ($env:SYNERGOS_CMS_URL)  { $env:SYNERGOS_CMS_URL }  else {
    (Get-Content (Join-Path $cms 'Synergos.CMS.Web\appsettings.Development.json') -Raw |
        ConvertFrom-Json).Kestrel.Endpoints.Http.Url
}
$backups = $env:SYNERGOS_BACKUP_DIR   # sin default a propósito: si falta, preguntá dónde van
```

## bash

```bash
raiz="$(dirname "$(git rev-parse --show-toplevel)")"
cms="${SYNERGOS_CMS_PATH:-$raiz/Synergos.CMS}"
ui="${SYNERGOS_UI_PATH:-$raiz/Synergos.UI}"
cdn_root="${CDN_ROOT:-$ui/public/synergos}"
base="${SYNERGOS_CMS_URL:-$(node -e "const f=require('fs').readFileSync(process.argv[1],'utf8').replace(/^﻿/,'');console.log(JSON.parse(f).Kestrel.Endpoints.Http.Url)" "$cms/Synergos.CMS.Web/appsettings.Development.json")}"
backups="${SYNERGOS_BACKUP_DIR:?definí SYNERGOS_BACKUP_DIR fuera del repo}"
```

`git rev-parse --show-toplevel` da la raíz del repo en el que estás parado; los dos clones se
buscan al lado. Si los tenés en otro sitio, exportá las dos variables y listo.

> **Un CMS arrancado por una herramienta de humo no está en `$base`.** `humo-portada`,
> `humo-conectado` y `usync-rebuild-check` levantan el suyo, con una base temporal, en
> `127.0.0.1:<puerto>` — y lo matan al terminar. No hace falta tener nada corriendo para usarlas.
