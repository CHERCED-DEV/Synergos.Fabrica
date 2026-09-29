---
name: synergos-smoke-test
description: Prueba de humo de Synergos — primero las herramientas del CMS que piden la página desde un clon limpio (humo-portada, humo-conectado: portada servida, import map, un script por tag, bundles 200), y después el HTML de un CMS corriendo (sin placeholders, SEO, bundles con Content-Type y Cache-Control correctos, scripts sin 404). Ejecutar después de synergos-cdn-build o cualquier cambio de infraestructura.
model: claude-opus-4-8
---

# SYNERGOS Smoke Test — verificación post-deploy

Smoke test enfocado en comportamiento observable de extremo a extremo — no en tests unitarios. Verifica que lo que el usuario final ve en el browser funciona.

---

## 0. Primero: pedir la página desde un clon limpio

La propiedad que de verdad importa es que **el navegador reciba una página que hidrata**, y eso lo
comprueban dos herramientas del CMS que levantan su **propio** CMS sobre una base temporal: no
necesitan nada corriendo y no tocan tu base.

```bash
cd "$cms"                        # synergos-guardrails/references/entorno.md
node tools/humo-portada.mjs      # base vacía + XML + siembra → la portada se SIRVE (200, no el cartel vacío)
node tools/humo-conectado.mjs    # …y está CONECTADA al CDN (necesita la UI construida: npm run build:cdn)
```

`humo-conectado` falla nombrando la causa: sin `<script type="importmap">`, un framework del registry
sin entradas en el mapa, un `<synergos-*>` sin su `<script type="module">`, o un bundle que no
contesta 200. Es el defecto #126 —200, el SSR entero y nada interactivo— y lo que un `curl` a la
portada no ve.

Lo que sigue mira el HTML de **un CMS ya corriendo** (`synergos-run-dev`):

```powershell
# $base, $cdnRoot: synergos-guardrails/references/entorno.md
try {
    Invoke-WebRequest "$base/_health" -UseBasicParsing -TimeoutSec 5 | Out-Null
} catch {
    if (-not $_.Exception.Response) { Write-Error "El CMS no contesta en $base. synergos-run-dev primero."; exit 1 }
}
```

---

## 1. (retirado) Autenticación

No hay token que pedir: Umbraco 13 no tiene Management API (ADR 0093). Todo lo de abajo es HTML
público y el disco.

---

## 2. Sitio público — render y estructura HTML

```powershell
$issues = [System.Collections.Generic.List[string]]::new()

try {
    $pub  = Invoke-WebRequest "$base/" -UseBasicParsing -TimeoutSec 10
    $html = $pub.Content

    # 2A. HTTP 200
    if ($pub.StatusCode -ne 200) {
        $issues.Add("Sitio público: HTTP $($pub.StatusCode) (esperado 200)")
    } else {
        Write-Output "✓ Sitio público: HTTP 200"
    }

    # 2B. DOCTYPE y HTML básico
    if ($html -notmatch '<!DOCTYPE html') {
        $issues.Add("HTML: falta DOCTYPE — puede ser error de template Razor")
    }

    # 2C. Custom elements NO son HTML comments placeholder
    # El StubBundleRegistryClient deja: <!-- synergos-{name} placeholder -->
    $placeholders = [regex]::Matches($html, '<!--\s*synergos-[\w-]+\s*(?:placeholder|not found)')
    if ($placeholders.Count -gt 0) {
        $placeholders | ForEach-Object {
            $issues.Add("PLACEHOLDER en HTML: $($_.Value.Trim()) — bundle no resuelto por ISynHostEmitter")
        }
    } else {
        Write-Output "✓ Custom elements: sin placeholders en HTML raíz"
    }

    # 2D. Verificar que hay al menos un custom element synergos-* en el HTML
    $ceMatches = [regex]::Matches($html, '<synergos-[\w-]+')
    Write-Output "  Custom elements encontrados: $($ceMatches.Count)"
    $ceMatches | ForEach-Object { Write-Output "    · $($_.Value)>" }

} catch {
    $issues.Add("Sitio público: no accesible — $($_.Exception.Message)")
}
```

---

## 3. SEO metadata

```powershell
if ($html) {
    # 3A. Title
    $titleMatch = [regex]::Match($html, '<title>(.+?)</title>')
    if ($titleMatch.Success -and $titleMatch.Groups[1].Value -notmatch 'umbraco|error|404') {
        Write-Output "✓ <title>: $($titleMatch.Groups[1].Value)"
    } else {
        $issues.Add("SEO: <title> ausente, vacío o genérico")
    }

    # 3B. og:title
    $ogTitle = [regex]::Match($html, 'property=["\']og:title["\'] content=["\'](.+?)["\']')
    if ($ogTitle.Success) {
        Write-Output "✓ og:title: $($ogTitle.Groups[1].Value)"
    } else {
        $issues.Add("SEO: og:title ausente — compSeo no configurado o no aplicado")
    }

    # 3C. og:description
    $ogDesc = [regex]::Match($html, 'property=["\']og:description["\'] content=["\'](.+?)["\']')
    if ($ogDesc.Success) {
        Write-Output "✓ og:description presente"
    } else {
        Write-Output "  WARN og:description ausente (puede ser intencional)"
    }

    # 3D. Canonical
    $canonical = [regex]::Match($html, '<link rel=["\']canonical["\'] href=["\'](.+?)["\']')
    if ($canonical.Success) {
        Write-Output "✓ canonical: $($canonical.Groups[1].Value)"
    } else {
        Write-Output "  WARN canonical ausente"
    }

    # 3E. lang attribute
    $langAttr = [regex]::Match($html, '<html[^>]+lang=["\']([^"\']+)["\']')
    if ($langAttr.Success) {
        Write-Output "✓ lang: $($langAttr.Groups[1].Value)"
    } else {
        $issues.Add("HTML: falta atributo lang en <html> — compSeo debería setearlo")
    }
}
```

---

## 4. CDN bundles — HTTP, Content-Type, Cache-Control

```powershell
try {
    $reg = Get-Content (Join-Path $cdnRoot 'registry.json') -Raw | ConvertFrom-Json
} catch {
    $issues.Add("registry.json no legible — CDN smoke test saltado")
    $reg = $null
}

if ($reg) {
    foreach ($el in @($reg.elements | Where-Object { $_.implementations.angular })) {
        $latestVer = $el.implementations.angular.latest
        $latestUrl = "$base/cdn-bundles/synergos/$($el.name)/angular/latest/main.js"
        $versionUrl = "$base/cdn-bundles/synergos/$($el.name)/angular/$latestVer/main.js"

        # 4A. URL /latest/ — debe ser no-cache
        try {
            $r = Invoke-WebRequest $latestUrl -UseBasicParsing -TimeoutSec 8
            $ct = $r.Headers["Content-Type"]
            $cc = $r.Headers["Cache-Control"]
            $kb = [Math]::Round($r.RawContentLength / 1024, 1)

            # Content-Type debe ser application/javascript
            if ($ct -notmatch 'javascript') {
                $issues.Add("$($el.name)/latest: Content-Type '$ct' — esperado application/javascript")
            }
            # Cache-Control en /latest/ debe ser no-cache o must-revalidate
            if ($cc -match 'immutable') {
                $issues.Add("$($el.name)/latest: Cache-Control '$cc' — /latest/ no debe ser immutable")
            }

            Write-Output "✓ $($el.name) ($latestVer): HTTP 200, $kb KB, CC=$cc"
        } catch {
            $issues.Add("$($el.name)/latest: 404 o error — $($_.Exception.Message)")
        }

        # 4B. URL /0.x.x/ — debe ser immutable
        try {
            $rv = Invoke-WebRequest $versionUrl -UseBasicParsing -TimeoutSec 8
            $ccv = $rv.Headers["Cache-Control"]
            if ($ccv -notmatch 'immutable' -and $ccv -notmatch 'max-age=31536000') {
                Write-Output "  WARN $($el.name)/$latestVer: Cache-Control '$ccv' — URL versionada debería ser immutable"
            }
        } catch {
            $issues.Add("$($el.name)/$latestVer: 404 — verificar synergos-cdn-build §5")
        }
    }
}
```

---

## 5. Verificar hidratación de custom elements (page-level)

Las páginas se piden por su URL pública, no se listan por una API: el sitemap del sitio, la
navegación de la portada o las rutas que el arquitecto nombre. Por cada una, que ningún
`<synergos-*>` quede como comentario y que la página traiga su import map:

```powershell
$paginas = @("$base/")   # + las URLs que interesen: se piden, no se listan por API
foreach ($pageUrl in $paginas) {
    try {
        $pageHtml = (Invoke-WebRequest $pageUrl -UseBasicParsing -TimeoutSec 10).Content
        $phpCount = ([regex]::Matches($pageHtml, '<!--\s*synergos-')).Count
        if ($phpCount -gt 0) {
            $issues.Add("HIDRATACIÓN: $phpCount placeholder(s) en $pageUrl — ISynHostEmitter no resolvió bundles")
        } elseif ($pageHtml -notmatch '<script type="importmap"') {
            $issues.Add("HIDRATACIÓN: $pageUrl sin import map — 200 con SSR y nada interactivo (#126)")
        } else {
            Write-Output "✓ $pageUrl — sin placeholders y con import map"
        }
    } catch {
        Write-Output "  WARN no se pudo pedir $pageUrl"
    }
}
```

La prueba completa de esto —un script por tag, cada bundle en 200— es `humo-conectado` (§0).

---

## 6. Scripts y assets en HTML — no 404s

```powershell
if ($html) {
    # Buscar todas las URLs de scripts en el HTML
    $scriptSrcs = [regex]::Matches($html, '<script[^>]+src=["\']([^"\']+)["\']') |
        ForEach-Object { $_.Groups[1].Value } |
        Where-Object { $_ -match '^/' -or $_ -match "^$base" }

    $scriptErrors = 0
    foreach ($src in $scriptSrcs | Select-Object -First 20) {
        $url = if ($src -match '^/') { "$base$src" } else { $src }
        try {
            $rs = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 5
            if ($rs.StatusCode -ne 200) {
                $issues.Add("Script 404: $url")
                $scriptErrors++
            }
        } catch {
            $issues.Add("Script error: $url — $($_.Exception.Message)")
            $scriptErrors++
        }
    }

    if ($scriptErrors -eq 0) {
        Write-Output "✓ Scripts: $($scriptSrcs.Count) encontrados, 0 errores (checked first 20)"
    }
}
```

---

## 7. Reporte final

```powershell
Write-Output ""
Write-Output "═══════════════════════════════════════════════════════════"
Write-Output "  SYNERGOS Smoke Test — $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Write-Output "═══════════════════════════════════════════════════════════"

if ($issues.Count -eq 0) {
    Write-Output "  Estado: PASS — todos los checks superados"
} else {
    Write-Output "  Estado: FAIL — $($issues.Count) issue(s) encontrados"
    $issues | ForEach-Object { Write-Output "  ✗ $_" }
}

Write-Output ""
Write-Output "  Checks ejecutados:"
Write-Output "    · Sitio público render"
Write-Output "    · Custom elements hydration"
Write-Output "    · SEO metadata (title, og:title, canonical, lang)"
Write-Output "    · CDN bundles (HTTP 200, Content-Type, Cache-Control)"
Write-Output "    · Scripts 404 check"
Write-Output "═══════════════════════════════════════════════════════════"
```

---

## 8. Issues frecuentes y soluciones

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `<!-- synergos-* placeholder -->` en HTML | Bundle no en registry.json o FileSystemBundleRegistryClient en Stub mode | Verificar `BundleRegistry:Mode=FileSystem` + ejecutar synergos-cdn-build |
| Content-Type `text/plain` en bundles | Static files middleware no configurado para `.js` | Revisar `Program.cs` — verificar `UseStaticFiles()` con FileExtensionContentTypeProvider |
| Cache-Control `immutable` en `/latest/` | Bug en el middleware de static files | Verificar la config de `OnPrepareResponse` en el hosting del CDN local |
| `<title>` genérico o vacío | compSeo no está en la composition del DocType | Agregar compSeo como composition en el PageType correspondiente |
| Script 404 | Bundle referenciado en HTML pero no publicado en el CDN | Ejecutar synergos-cdn-build para el elemento faltante |
| HTTP 500 en sitio | Excepción en Razor (modelo nulo, alias mal escrito) | Revisar logs de dotnet run; buscar `throw` / `NullReferenceException` |

---

## 9. Alcance de esta skill vs `synergos-app-verify` (complementarias, no duplicadas)

Esta skill (`synergos-smoke-test`) opera a **nivel HTTP / placeholder** desde PowerShell: inspecciona el HTML crudo del servidor, headers de los bundles CDN, metadata SEO y ausencia de comentarios placeholder (`<!-- synergos-* placeholder -->`). **No ejecuta JavaScript ni monta un DOM real** — un custom element puede pasar el smoke test (aparece como `<synergos-*>` sin placeholder) y aun así **no hidratar** en el navegador (export faltante en `sg-shared.js`, `customElements.get()` undefined, fetch en constructor leyendo input default, etc.).

Para la verificación **a nivel navegador / DOM** usar la skill **`synergos-app-verify`**, que cubre lo que el smoke test HTTP no puede ver:

- **Hidratación real** vía `customElements.get('<tag>')` + import forzado del bundle — confirma que el elemento definió su clase, no solo que el tag existe en el HTML.
- **Leak-scan del DOM renderizado** — busca `undefined` / `NaN` / `[object Object]` / claves crudas filtradas en el texto ya hidratado (bugs de shape backend↔UI que el HTML de servidor no muestra).
- **Que lo hidratado muestre lo que el editor escribió** — un elemento puede hidratar bien y pintarse
  vacío encima del SSR porque la vista SynHost le manda claves que no lee (D1). El HTML crudo que
  mira esta skill **se ve bien** en ese caso: es justo lo que no puede ver (`synergos-app-verify`
  §4.bis).
- **Responsive a 375px** — layout móvil real, no solo markup.
- **Todos los temas por-siteRoot** — contraste y tokens de tema que solo se rompen en el navegador con el CSS aplicado (`node tools/audit-themes.mjs` en la UI los enumera y los mide).

**Regla práctica:** correr `synergos-smoke-test` primero (rápido, HTTP, atrapa infra/placeholder/CDN/SEO); si pasa y el cambio toca UI hidratada o temas, correr `synergos-app-verify` para confirmar el comportamiento real en el DOM. Un PASS aquí **no** garantiza hidratación ni congruencia visual — para eso está `synergos-app-verify`.
