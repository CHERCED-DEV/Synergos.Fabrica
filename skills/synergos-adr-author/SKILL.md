---
name: synergos-adr-author
description: Escribe un ADR (Architecture Decision Record) para Synergos siguiendo el formato exacto del proyecto. Asigna el número correcto (siguiente al más alto existente), genera el archivo en Synergos.CMS/Synergos.CMS.Web/docs/adr/ con el formato del ADR más reciente, lo agrega en el mismo commit al índice versionado docs/adr/README.md (lo vigila AdrIndexTests) y a la cuenta de CLAUDE.md §2 (CifrasDeClaudeMdTests), y aparte, si la máquina lo tiene, al §11.2 de refactor-docs. Cubre cómo se escribe una ADR Propuesta con el piloto que la acepta —el molde de las 0135-0139— y cómo lleva sus cifras (con fecha, SHA base y marca de certeza). Invocar cuando se toma una decisión arquitectónica que debe quedar registrada.
model: claude-opus-4-8
---

# SYNERGOS ADR Author — registrar decisiones arquitectónicas

Los ADRs son la memoria del proyecto. Con tantos escritos, el formato y la numeración deben ser consistentes: un ADR que no encaja obliga al siguiente lector a preguntarse si el proyecto cambió de convención o si alguien se equivocó.

---

## 0. Antes de nada: ¿merece un ADR?

1. **¿Ya está decidido en otro ADR?**
   ```bash
   grep -rl "{palabra clave}" Synergos.CMS/Synergos.CMS.Web/docs/adr/
   ```
2. **¿Es una decisión o una preferencia?** Los ADRs registran decisiones con consecuencias duraderas, no gustos de estilo.
3. **¿Supera a un ADR anterior?** Si sí, marcar el viejo `Superseded by ADR NNNN` **en su propio archivo**, no solo en el nuevo.
4. **¿Tiene consecuencias fuera de su módulo?** Si no afecta a nadie más, probablemente no es un ADR.

---

## 1. El número siguiente

Los ADRs viven en `Synergos.CMS/Synergos.CMS.Web/docs/adr/` con nombre `NNNN-slug.md` (4 dígitos,
**sin** prefijo `ADR-`), más un `README.md` que es el índice.

```bash
ls Synergos.CMS/Synergos.CMS.Web/docs/adr/ | grep -E '^[0-9]{4}-' | sort | tail -1
```

El siguiente es ese +1, con 4 dígitos. **El idioma del slug y de los marcadores lo manda el ADR más
reciente**, no esta skill: los primeros van en inglés (`0107-in-memory-catalog-engine-…`) y los
recientes en español (`0134-tres-catalogos-y-dos-tipos-de-colocable-…`). El contenido, en español.

---

## 2. El formato — el del ADR más reciente

> ⚠️ **Verificar siempre contra el ADR más reciente antes de escribir**, no contra este template: la
> convención ya cambió una vez y puede volver a cambiar.
> ```bash
> head -12 $(ls Synergos.CMS/Synergos.CMS.Web/docs/adr/[0-9]*.md | sort | tail -1)
> grep -L -- '- \*\*Status:\*\*' Synergos.CMS/Synergos.CMS.Web/docs/adr/[0-9]*.md   # los que NO usan el formato en inglés
> ```

La forma de los recientes (0134-0139 son el molde):

```markdown
# ADR NNNN — {Título en español: la decisión dicha como frase}

- **Estado:** Aceptado | Propuesto — se acepta o se descarta con el piloto (ver al final)
- **Fecha:** YYYY-MM-DD
- **Decidido por:** {quién y en qué contexto} | **Propone:** {de dónde sale la propuesta}
- **Parte de:** [#NNN](../../../../../issues/NNN) · épica [#NNN](…)
- **Depende de / Conserva / Enmendaría / Aclararía:** {ADR NNNN — por qué}

## Contexto

> Marcas de certeza: ✔ comprobado en el disco · ◐ medido por un agente con dos derivaciones o
> ejecutando, sin re-derivar · ○ cifra de un agente sin verificar. «Re-leído» = línea abierta al
> escribir este ADR (CMS `<sha>`, UI `<sha>`).

## Decisión            (en una propuesta: «Decisión (propuesta)»)

### {Sub-encabezados por decisión}

## Alternativas consideradas

| alternativa | por qué no |
|---|---|

## Consecuencias

**A favor** · **En contra** (dicho de frente) · **Qué la vigila** (el gate que existe, o «por construir»)

## Qué hace falta para aceptarla (el piloto)      ← sólo en una Propuesta

## Relación con otras ADRs

## Referencias
```

Los anteriores al cambio usan `- **Status:**` · `- **Date:**` · `- **Deciders:**` · `## Context` ·
`## Decision` · `## Consequences` · `## Alternatives considered` · `## References`: no se
reescriben. **No hay campo `Ola:`**: el contexto de la ola va en el encabezado o en `Contexto`.

### 2.1 Una ADR Propuesta — el molde de las 0135-0139

Una decisión que el arquitecto quiere registrar **antes** de construirla se escribe como
**Propuesta**, con lo que la aceptaría o la descartaría:

- `- **Estado:** Propuesto — se acepta o se descarta con el piloto`, y en el índice, `Proposed`.
- Una sección **«Qué hace falta para aceptarla (el piloto)»** con criterios medibles: qué se
  construye, qué se mide, **qué gates se mutan** y cómo se comprueba que cada mutación entró.
- **«Enmendaría» / «Aclararía»**, en condicional: la ADR que cambiaría no se toca mientras sea
  propuesta. Si se acepta, la otra recibe en su cabecera la marca («aclarada por la NNNN»), como
  hizo la 0126 con la 0127.
- **Ninguna skill, guía ni ADR la enseña como hecha**: se cita como «Propuesta» y se dice qué se hace
  hoy (`synergos-funcionalidad` es el ejemplo).

### 2.2 Las cifras en un ADR

Un ADR es **historia**: una cifra ahí no está desviada, está **fechada** (lo dicen los `remarks` de
`CifrasDeClaudeMdTests`, que por eso no mira `docs/adr/`). Pero tiene que poder comprobarse: cada
cifra con su **marca de certeza** y su fuente, el **SHA base** de los repos en el encabezado del
contexto, y `fichero:línea` re-leída para lo que decide. Una cifra de un agente sin verificar va con
○, no se presenta como medida (`synergos-medir` §7).

---

## 3. Qué hace bueno a un ADR de este proyecto

Los ADRs recientes (0103-0107) no son formularios rellenados: son **argumentos**. Lo que los distingue:

- **Registran las premisas FALSAS que se corrigieron.** ADR 0106 abre listando tres cosas que el encuadre inicial daba por ciertas y no lo eran. Eso es lo que impide que el próximo las vuelva a asumir.
- **Justifican con evidencia medida, no con opinión.** "Examine 3.7.1 no tiene facetado — verificado en los binarios" pesa; "Lucene es overkill" no.
- **Escriben el criterio de reapertura.** Si la decisión depende del volumen o la latencia, decir el número (">5.000 ítems/vertical o p95 >50ms") para que se revise por dato.
- **Nombran lo que se rechazó y POR QUÉ**, en `Alternatives considered`. Un rechazo sin razón invita a rehacerlo.
- **Registran los bugs que la propia ola destapó**, incluidos los del agente. Son el tipo de defecto que un build verde no atrapa, y el ADR es donde sobreviven.
- **Son honestos con las consecuencias negativas.** Un ADR sin trade-offs es publicidad.

Si el ADR no dice nada que un `git log` no diga ya, no hacía falta.

---

## 4. Escribir el archivo

Usar la herramienta Write directamente. **No** generar el contenido con here-strings de PowerShell: el español lleva tildes y ñ, y el encoding se corrompe (ver `feedback_powershell_utf8_bulk_edits`). Si hiciera falta por otra razón, `[System.IO.File]::WriteAllText(..., [System.Text.Encoding]::UTF8)`.

---

## 5. El índice — el versionado va en el MISMO commit que el ADR

**`docs/adr/README.md` es el índice** (`CLAUDE.md` §3 del CMS manda ahí la pregunta «¿por qué se
tomó esta decisión?»), y **`AdrIndexTests`** lo cruza con el disco en los dos sentidos: un ADR sin
fila rompe, y una fila que apunta a un fichero inexistente también. La 0133 estuvo aceptada y fuera
del índice: un ADR que no está en esa tabla es un ADR perdido.

1. **La fila en `docs/adr/README.md`**, al final: `| [NNNN](NNNN-slug.md) | {resumen denso} | Accepted \| Proposed |`
   — el estado de la tabla va en inglés, como el resto de sus filas.
2. **La cuenta de `CLAUDE.md` §2** del CMS (`N ADRs (0001-NNNN, sin 0016)` en el mapa del
   proyecto): la cruza `CifrasDeClaudeMdTests`, con cifra **y** rango. Se cuenta del disco:
   ```bash
   ls Synergos.CMS/Synergos.CMS.Web/docs/adr/[0-9]*.md | wc -l
   ```
3. **Si tu máquina tiene `refactor-docs/`** (el repo contenedor, local, no versionado en el CMS): el
   §11.2 de `architecture/00-current-state-synergos-cms.md` tiene encabezado en prosa y tabla densa.
   Editar con Read + Edit o un script que busque la línea por prefijo (`startsWith('| 0106 |')`); un
   `-replace` a ciegas corrompe el documento. **Puede ir atrasado** respecto del disco: lo que manda
   es el README.

Comprobarlo antes del commit, y mutarlo si se tocó el gate:

```bash
cd Synergos.CMS
dotnet test Synergos.Arquitectura.Tests/Synergos.Arquitectura.Tests.csproj --filter "FullyQualifiedName~AdrIndexTests|FullyQualifiedName~CifrasDeClaudeMdTests"
```

---

## 6. Los commits

```bash
# 1) El ADR, su fila del índice y la cuenta de CLAUDE.md — UN commit en Synergos.CMS, con rutas
cd Synergos.CMS
git add -- Synergos.CMS.Web/docs/adr/NNNN-*.md Synergos.CMS.Web/docs/adr/README.md CLAUDE.md
git commit -m "docs(adr): NNNN — {título corto}" -- Synergos.CMS.Web/docs/adr/NNNN-*.md Synergos.CMS.Web/docs/adr/README.md CLAUDE.md

# 2) Si existe: el §11.2 de refactor-docs — otro repo, otro commit
cd ..
git add -- refactor-docs/architecture/00-current-state-synergos-cms.md
git commit -m "docs(arch): indice §11.2 — ADR NNNN ({tema})" -- refactor-docs/architecture/00-current-state-synergos-cms.md
```

Varias ADRs en una tanda: **un commit por ADR**, cada uno con su fila y su cuenta, para que cada
commit deje `AdrIndexTests` y `CifrasDeClaudeMdTests` en verde por sí solo.

---

## 7. Rangos temáticos (referencia)

| Rango | Categoría |
|-------|-----------|
| 0001–0009 | Plataforma base (Umbraco, uSync, Models) |
| 0010–0019 | Branding, multi-site, identidad |
| 0020–0029 | Page composition, layouts, render pipeline |
| 0030–0039 | Audit, analytics, observabilidad |
| 0040–0049 | Auth, members, seguridad |
| 0050–0059 | Razor, templates, localización |
| 0060–0069 | HTTP resilience, CDN, bundle registry |
| 0070–0079 | Testing, seams, contratos |
| 0080–0089 | CMS↔UI contracts, custom elements |
| 0090–0099 | Automatización, dev experience |
| 0100+ | Verticales + fase de lógica de negocio (doc 25: T0…T9) |

Los rangos son orientativos y ya se agotaron: **no renumerar ni forzar** un ADR a un rango. El número siguiente es el siguiente.
