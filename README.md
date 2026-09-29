# Synergos.Fabrica — el arnés de Claude Code de Synergos

Las skills `synergos-*` con las que se trabaja en
[`Synergos.CMS`](https://github.com/CHERCED-DEV/Synergos.CMS) (Umbraco 13, uSync, el árbol de
servicios) y en [`Synergos.UI`](https://github.com/CHERCED-DEV/Synergos.UI) (los elementos Angular
y Preact que el CMS monta desde el CDN). Es un **marketplace** de Claude Code llamado
`synergos-fabrica` que publica **un plugin** del mismo nombre; las skills viven en
`skills/<nombre>/SKILL.md`.

## Por qué un repo aparte (#141)

El arnés estaba **copiado** en los dos repos de código, y ya había divergido: alguien arreglaba
una copia y no iba a la otra — el pin de Umbraco del #149 se corrigió en el CMS y la UI siguió
diciendo la versión vieja. La copia no se arregla cruzándola: se arregla teniendo **una**.

Las alternativas se descartaron midiendo (doc 13 §6 del CMS): un submódulo del CMS dentro de la UI
arrastra el CMS entero para compartir unas skills, y un symlink dentro de `.claude/` rompe
`FormaDelArbolTests` (el #90 tumbó seis gates con uno). Los dos repos **consumen** este; ninguno
lo contiene.

> **Y la lección del #171, que es la razón de este README:** el #141 construyó este repo y nunca
> lo publicó. Vivió sólo en el clon de un contenedor, los dos locks fijaron un SHA que daba 404,
> y los dos repos de código se quedaron sin skills. Las skills se rescataron de la historia de
> git; la limpieza del #141 se rehízo. La historia de este repo lo cuenta commit por commit.

## Qué hay

| | |
|---|---|
| `.claude-plugin/marketplace.json` | el marketplace `synergos-fabrica`, con su plugin; `source: "./"` — la raíz es a la vez marketplace y plugin |
| `.claude-plugin/plugin.json` | el plugin `synergos-fabrica`. **Sin `version` a propósito**: sin ella, la versión del plugin es el SHA del commit, que es lo que fija el lock |
| `skills/` | una carpeta por skill, con su `SKILL.md` y sus `references/` |
| `skills/synergos-guardrails/references/entorno.md` | las variables con las que una skill resuelve rutas y URL sin cablear las de una máquina |
| `tools/criterios.mjs` | el medidor de los cuatro criterios de rechazo del #141 |
| `tests/estructura.test.mjs` | los tests de estructura (`node:test`, sin dependencias) |
| `.github/workflows/estructura.yml` | el CI: autoprueba, medidor y tests, en Ubuntu y Windows |

## Instalarlo

En una sesión de Claude Code:

```
/plugin marketplace add https://github.com/CHERCED-DEV/Synergos.Fabrica.git
/plugin install synergos-fabrica@synergos-fabrica
```

Las skills quedan como `/synergos-fabrica:<nombre>` y el modelo las dispara por su
`description`. Las rutas de cada máquina se resuelven con las variables de
`skills/synergos-guardrails/references/entorno.md` (`SYNERGOS_CMS_PATH`, `SYNERGOS_UI_PATH`,
`SYNERGOS_CMS_URL`, `CDN_ROOT`, `SYNERGOS_BACKUP_DIR`); con los dos clones como hermanos no hace
falta definir ninguna salvo la de los respaldos.

## Cómo lo fijan el CMS y la UI

Cada repo de código tiene en su raíz un `arnes.lock.json`, **idéntico en los dos**:

```json
{
  "arnes": {
    "nombre": "synergos-fabrica",
    "repo": "https://github.com/CHERCED-DEV/Synergos.Fabrica.git",
    "sha": "<el commit de este repo que ese repo declara>",
    "marketplace": "synergos-fabrica",
    "plugin": "synergos-fabrica"
  }
}
```

- **Por qué un pin y no «la última»:** un arnés que se actualiza solo cambia el comportamiento del
  agente entre dos corridas del mismo PR, y eso no se lee como «cambió el arnés» sino como «el
  agente es inconsistente».
- **Por qué un fichero y no la instalación:** un plugin se instala por máquina, así que un runner
  de CI no lo tiene. CI clona el `sha` del lock; el gate del arnés (#142) lo cruza contra el
  remoto. Ese gate es el que habría cazado el #171: el lock apuntaba a un commit que no existía.
- **En una máquina**, `/plugin marketplace add <url>#<ref>` fija una rama o un tag (así lo
  documenta Claude Code); fijar por SHA no está documentado. Si hace falta que una máquina
  reproduzca exactamente el lock, la forma documentada es un tag por cada SHA que se fija.

## Cómo se actualiza el lock

1. El cambio entra acá, a `main`, con el medidor en cero y los tests en verde.
2. **Se publica** (`git push`) y se comprueba que el SHA existe en el remoto:
   `gh api repos/CHERCED-DEV/Synergos.Fabrica/commits/<sha>` tiene que contestar, no 404.
   Sin este paso se repite el #171.
3. Se actualiza `sha` en el `arnes.lock.json` de **los dos** repos, y el diff va en el commit que lo
   causó — como cualquier lock.

## Las reglas

1. **Una sola copia.** Una skill no se copia a `Synergos.CMS/.claude/skills/` ni a
   `Synergos.UI/.claude/skills/`: la divergencia no llega de golpe, llega el día que alguien
   arregla una (doc 13 §10).
2. **Una skill dice cómo consultar, nunca la cifra.** Una cifra en una skill es una cifra que se va
   a desviar — cuántos elementos, ADRs, temas, capacidades, la versión clavada de Umbraco. Lo que
   va en la skill es el comando o el fichero que la da.
3. **Ninguna ruta de una máquina.** Ni `C:\…`, ni un usuario, ni el host de desarrollo cableado
   como URL: una variable de `entorno.md`, o una ruta relativa al repo y dicha contra qué se
   resuelve.
4. **Ninguna herramienta muerta.** Lo que una skill manda correr existe hoy en el disco. El medidor
   lo comprueba contra los dos árboles.
5. **La `description` no contradice el cuerpo.** Es lo único que el modelo lee para decidir si
   dispara.
6. **Toda skill nueva pasa el medidor y los tests**, y todo cambio al medidor entra con su fixture
   y su mutación: se reintroduce el defecto, se ve el rojo, se restaura tocando el fichero.

## Correrlo

```bash
node tools/criterios.mjs --autoprueba     # el medidor contra sus propios fixtures
node tools/criterios.mjs                  # sobre skills/, contra los dos repos hermanos
node --test tests/estructura.test.mjs     # la forma del plugin
claude plugin validate .                  # el validador oficial del marketplace y el plugin
```

El medidor busca los dos repos en `--cms-path=` / `--ui-path=`, en `SYNERGOS_CMS_PATH` /
`SYNERGOS_UI_PATH`, o como clones hermanos. Sin ellos **no mide**: sale con 2 y lo dice
(`--sin-arboles` mide sólo el vocabulario fijo, y lo avisa).

## Lo que este repo todavía no hace

- **El gate del arnés (#142)** —que lo que una skill afirma siga siendo cierto, y que el lock de
  cada consumidor resuelva contra el remoto— no está acá todavía. El CI de este repo comprueba la
  **forma**; no confíes en él para la deriva.
- **Decisión pendiente del arquitecto:** la mayoría de las skills fijan `model:` en su
  frontmatter a un modelo concreto. Un modelo fijado puede no estar disponible en la instalación
  de quien la usa: la documentación de skills dice que uno excluido por `availableModels` no se
  usa y la sesión sigue con el suyo; qué pasa con uno que ya no existe, no está verificado. Es
  además una constante con fecha de caducidad escrita en muchos sitios y sin nadie que la cruce.
  Cuántas lo hacen: `grep -l '^model:' skills/*/SKILL.md`.
