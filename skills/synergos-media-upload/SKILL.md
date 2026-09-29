---
name: synergos-media-upload
description: Genera una imagen PNG (o SVG) y la registra en la biblioteca de medios de Umbraco 13 por las vías que existen — el seam server-side DevMediaFactory (IMediaService detrás del flag DevSeed) o el backoffice. Usar cuando se necesita una imagen (hero, og:image, thumbnail, avatar, logo placeholder) disponible en un campo MediaPicker3. Devuelve el valor MediaPicker3 (mediaKey + UDI). Requiere el CMS corriendo (SYNERGOS_CMS_URL).
---

# SYNERGOS Media Upload — generar una imagen y registrarla en Umbraco

Esta skill crea una imagen desde cero (PowerShell + GDI+, o SVG) y la deja en la biblioteca de medios
de Umbraco 13, lista para un campo `MediaPicker3` o `ImageCropper`.

> **Cómo se registra un media en Umbraco 13** (ADR 0093): **server-side**, con `IMediaService`, detrás
> del flag `Synergos:DevSeed:Enabled`. El seam existe: `Synergos.CMS.Web/Services/DevMediaFactory.cs`
> (crea el nodo `synImage`, escribe el fichero, rellena el cropper y devuelve el JSON del
> MediaPicker3; idempotente por nombre, en carpetas). La otra vía es el backoffice. Un upload por HTTP
> con token no existe en 13: esa API empieza en v14.

`$base` y `$cms` salen de `synergos-guardrails/references/entorno.md`.

## 0. Parámetros de entrada

Cuando se activa esta skill, extrae o infiere del mensaje del usuario:

| Parámetro | Descripción | Default |
|-----------|-------------|---------|
| `$title` | Texto que aparecerá en la imagen generada | Nombre del contenido |
| `$subtitle` | Texto secundario (opcional) | — |
| `$width` | Ancho en píxeles | 1200 |
| `$height` | Alto en píxeles | 630 |
| `$bgColorHex` | Color de fondo en hex | `#0F58A7` |
| `$altText` | Alt text para accesibilidad | Igual que `$title` |
| `$folderPath` | Carpeta en Media Library | la que corresponda por uso (ver §3A) |
| `$fileName` | Nombre del archivo (sin extensión) | slug del título |

## 1. Pre-flight — el CMS contesta y el flag DevSeed está encendido

```powershell
# $base: synergos-guardrails/references/entorno.md
try { Invoke-WebRequest "$base/_health" -UseBasicParsing -TimeoutSec 5 | Out-Null }
catch { if (-not $_.Exception.Response) { Write-Error "El CMS no contesta en $base — synergos-run-dev."; exit 1 } }

$ping = try { Invoke-RestMethod "$base/dev/ping" } catch { $null }   # con el flag apagado, /dev/* da 404
if (-not $ping.devSeedEnabled) { Write-Warning 'Synergos:DevSeed:Enabled apagado: sólo queda la vía del backoffice (§3B).' }
```

## 2. Generación de la imagen PNG

Usa PowerShell con `System.Drawing` (GDI+, disponible en Windows 11 / PowerShell 5.1):

```powershell
Add-Type -AssemblyName System.Drawing

function New-SynImage {
    param(
        [string]$Title,
        [string]$Subtitle = "",
        [int]$Width = 1200,
        [int]$Height = 630,
        [string]$BgColorHex = "#0F58A7",
        [string]$OutputPath
    )

    $bmp = New-Object System.Drawing.Bitmap($Width, $Height)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # Fondo sólido
    $bg = [System.Drawing.ColorTranslator]::FromHtml($BgColorHex)
    $g.Clear($bg)

    # Overlay sutil (cuarto inferior oscuro para legibilidad)
    $overlayBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 0, 0, 0))
    $g.FillRectangle($overlayBrush, 0, ($Height * 0.65), $Width, ($Height * 0.35))
    $overlayBrush.Dispose()

    # Título principal
    $titleSize  = [Math]::Max(36, [Math]::Min(64, $Width / 18))
    $fontTitle  = New-Object System.Drawing.Font("Segoe UI", $titleSize, [System.Drawing.FontStyle]::Bold)
    $sfCenter   = New-Object System.Drawing.StringFormat
    $sfCenter.Alignment     = [System.Drawing.StringAlignment]::Center
    $sfCenter.LineAlignment = [System.Drawing.StringAlignment]::Center

    $titleRect = if ($Subtitle) {
        New-Object System.Drawing.RectangleF(60, 60, ($Width - 120), ($Height * 0.55))
    } else {
        New-Object System.Drawing.RectangleF(60, 60, ($Width - 120), ($Height - 120))
    }
    $g.DrawString($Title, $fontTitle, [System.Drawing.Brushes]::White, $titleRect, $sfCenter)
    $fontTitle.Dispose()

    # Subtítulo (si existe)
    if ($Subtitle) {
        $subtitleSize = [Math]::Max(20, $titleSize * 0.55)
        $fontSub  = New-Object System.Drawing.Font("Segoe UI", $subtitleSize, [System.Drawing.FontStyle]::Regular)
        $subRect  = New-Object System.Drawing.RectangleF(60, ($Height * 0.62), ($Width - 120), ($Height * 0.3))
        $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 255, 255, 255))
        $g.DrawString($Subtitle, $fontSub, $subBrush, $subRect, $sfCenter)
        $fontSub.Dispose()
        $subBrush.Dispose()
    }

    # Logo mark: franja de acento inferior izquierda
    $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $g.FillRectangle($accentBrush, 60, ($Height - 20), 80, 8)
    $accentBrush.Dispose()

    $g.Flush()
    $g.Dispose()
    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "Imagen generada: $OutputPath"
}

# Ejecutar
$slug     = ($Title -replace '[^a-zA-Z0-9]', '-').ToLower() -replace '-+', '-'
$tmpPath  = [System.IO.Path]::Combine($env:TEMP, "syn-$slug-$([System.Guid]::NewGuid().ToString('N').Substring(0,8)).png")
New-SynImage -Title $title -Subtitle $subtitle -Width $width -Height $height `
             -BgColorHex $bgColorHex -OutputPath $tmpPath
```

**Si `System.Drawing` no carga** (raro en Win11 PS5.1 pero posible si GDI+ está deshabilitado):
- Fallback: generar SVG como texto plano y subirlo al MediaType `synImage` (SVG es aceptado).
- SVG fallback:
```powershell
$svgContent = @"
<svg xmlns="http://www.w3.org/2000/svg" width="$width" height="$height">
  <rect width="$width" height="$height" fill="$bgColorHex"/>
  <rect x="0" y="$([int]($height*0.65))" width="$width" height="$([int]($height*0.35))" fill="rgba(0,0,0,0.35)"/>
  <text x="$([int]($width/2))" y="$([int]($height/2))" font-family="Segoe UI,Arial,sans-serif"
        font-size="60" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">$title</text>
</svg>
"@
$tmpPath = [System.IO.Path]::Combine($env:TEMP, "syn-$slug.svg")
[System.IO.File]::WriteAllText($tmpPath, $svgContent, [System.Text.Encoding]::UTF8)
```

## 3. Registrar la imagen en Umbraco

### 3A. Server-side — `DevMediaFactory` (la vía programática)

`DevMediaFactory` (`Synergos.CMS.Web/Services/DevMediaFactory.cs`) es el seam de media de la autoría
server-side. Lo que ofrece hoy, leído del fichero (si cambió, manda el fichero):

| Método | Devuelve |
|--------|----------|
| `GetOrCreatePickerValue(name, altText, …)` | el JSON del MediaPicker3 de una imagen `synImage` con ese nombre; la crea si no existe |
| `GetOrCreateOgImagePickerValue(name, altText)` | la OG image de marca, en la carpeta de marca |
| `GetOrCreateMediaUrl(name, altText, …)` | la URL pública del fichero (para configs de elementos CDN que llevan URLs planas) |
| `GetOrCreateFolder(folderName)` | el Id de una carpeta de Media bajo la raíz; nada queda en la raíz |

Se invoca desde el tooling `/dev/*` (el filler o un seeder), nunca en el arranque (ADR 0013): la
forma de agregar una autoría nueva está en `synergos-content-fill` §2.

> **Ojo con lo que genera.** `DevMediaFactory` no sube un fichero cualquiera: importa una
> ilustración del brand kit si el nombre está mapeado, o genera un gradiente de marca **sin texto**.
> Si hace falta registrar la imagen que generó el §2 de esta skill, el seam no lo hace hoy: o se le
> agrega un método que reciba el fichero (C#, detrás del flag, con sus tests — ADR 0075 y
> `synergos-test-author`), o se usa el backoffice (§3B).

### 3B. Backoffice

```
1. Abrir $base/umbraco → sección Media.
2. Elegir (o crear) la carpeta que corresponda; no dejar la imagen en la raíz.
3. Subir el fichero generado en el §2 como "Image" (synImage) y completar el texto alternativo.
4. Guardar. En la pestaña Info del nodo está su Key (GUID): es el mediaKey.
```

## 4. Limpiar el archivo temporal

```powershell
if (Test-Path $tmpPath) {
    Remove-Item $tmpPath -Force
    Write-Output "Archivo temporal eliminado: $tmpPath"
}
```

## 5. Retorno — mediaKey, UDI y el valor del MediaPicker3

Al finalizar, reportar:

```
Media registrado:
  mediaKey : <GUID del nodo media>
  UDI      : umb://media/<GUID sin guiones>
  Alt text : <altText>
  Tamaño   : <width>x<height>px
  Nombre   : <fileName>

Valor del property value de un MediaPicker3 (verificado en vivo, ver synergos-content-fill §4):
  [{"key":"<GUID nuevo>","mediaKey":"<GUID del nodo media>","crops":[],"focalPoint":null}]
```

`key` es un GUID **nuevo** por cada selección; `mediaKey` es el del nodo. Pasar el valor a
`synergos-content-fill` para llenar el campo.

## 6. Troubleshooting

| Error | Causa probable | Solución |
|-------|---------------|----------|
| `/dev/*` contesta 404 | `Synergos:DevSeed:Enabled=false` | encenderlo en `appsettings.Development.json`, o usar el backoffice |
| El MediaPicker3 queda vacío al publicar | valor mal serializado | el formato del §5, como string JSON; ver `synergos-content-fill` §4 |
| `System.Drawing` no carga | GDI+ no disponible (raro) | Usar fallback SVG (sección 2) |
| La imagen quedó en la raíz de Media | se creó sin carpeta | `GetOrCreateFolder` (server-side) o moverla en el backoffice |
| CMS no responde (pre-flight) | App no arrancada | `synergos-run-dev` |

## 7. Variantes de tamaño comunes

| Uso | Width | Height | Color sugerido |
|-----|-------|--------|---------------|
| OG image / hero social | 1200 | 630 | `#0F58A7` |
| Card thumbnail | 800 | 450 | `#1A3A5C` |
| Avatar / profile | 400 | 400 | `#2C7BE5` |
| Logo placeholder | 300 | 100 | `#FFFFFF` (con texto oscuro — cambiar brush) |
| Favicon base | 512 | 512 | `#0F58A7` |
| Banner wide | 1600 | 400 | `#0A2540` |
