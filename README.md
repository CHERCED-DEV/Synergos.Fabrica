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
| `tests/adrs-citadas.test.mjs` | que toda ADR que una skill cita exista en el CMS, y que el estado que le atribuye (Aceptada/Propuesta) sea el de su fichero |
| `consumidor/arnes.yml` | el workflow que cada consumidor **copia** a su `.github/workflows/arnes.yml`: trae el SHA de su lock y corre `tools/lock.mjs` desde ese SHA (#142) |
| `tools/lock.mjs` | lo que el arnés afirma de un consumidor: que su lock nombra este plugin, que su copia del workflow es la de este SHA y —en el CMS— que las frases del pin de Umbraco de `synergos-guardrails` dicen la rama de su `Directory.Packages.props` |
| `tests/lock.test.mjs` | el paso del workflow ejecutado contra repos locales, y `tools/lock.mjs` con sus mutaciones |
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
  de CI no lo tiene. El workflow `arnes.yml` de cada consumidor **trae ese SHA** del remoto
  (`git fetch --depth 1 <repo> <sha>`) en cada push a `main`/`master`, en cada PR y cada día; si
  no está, rojo con qué hacer. Es el diente que habría cazado el #171: el lock apuntó durante días a
  un commit que no existía.
- **Dónde vive cada pedazo, y por qué:** lo que comprueba que el SHA existe **no puede venir de
  ese SHA**, así que ese paso —y sólo ése— está en el YAML. Todo lo demás es `tools/lock.mjs`, que
  el workflow corre **desde el SHA que trajo**: una sola copia, en la versión que cada consumidor
  fija. El YAML sí está copiado en los dos consumidores, y por eso `tools/lock.mjs` compara cada
  copia con `consumidor/arnes.yml` de ese SHA: es una copia vigilada, no dos que divergen (#141).
  Descartado: un workflow reutilizable (`uses: …/arnes.yml@main`) cambia el CI de los consumidores
  sin un commit suyo, que es lo que el pin existe para impedir; fijarlo por SHA en el `uses:` es un
  segundo pin que diverge del lock.
- **En una máquina**, `/plugin marketplace add <url>#<ref>` fija una rama o un tag (así lo
  documenta Claude Code); fijar por SHA no está documentado. Si hace falta que una máquina
  reproduzca exactamente el lock, la forma documentada es un tag por cada SHA que se fija.

## Cómo se actualiza el lock

1. El cambio entra acá, a `main`, con el medidor en cero y los tests en verde.
2. **Se publica** (`git push`) y se comprueba que el SHA existe en el remoto:
   `gh api repos/CHERCED-DEV/Synergos.Fabrica/commits/<sha>` tiene que contestar, no 404.
   Sin este paso se repite el #171.
3. Se actualiza `sha` en el `arnes.lock.json` de **los dos** repos, y el diff va en el commit que lo
   causó — como cualquier lock. Si `consumidor/arnes.yml` cambió, se copia a
   `.github/workflows/arnes.yml` en el mismo commit: el CI del consumidor compara la copia con la
   del SHA que fija, y sale rojo si difieren.

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
7. **Ninguna skill fija `model:`** en su frontmatter (decisión del arquitecto, 2026-09-29, #142):
   la skill corre con el modelo de la sesión. Veinte de las veinticuatro skills rescatadas fijaban
   el mismo, y eso es una constante con fecha de caducidad escrita en veinte sitios — la forma que
   tenía el pin de Umbraco antes del #149. Un modelo fijado puede además no estar en la instalación
   de quien usa la skill. Lo rechaza `tests/estructura.test.mjs`.

## Correrlo

```bash
node tools/criterios.mjs --autoprueba     # el medidor contra sus propios fixtures
node tools/criterios.mjs                  # sobre skills/, contra los dos repos hermanos
node --test tests/estructura.test.mjs     # la forma del plugin
node --test tests/adrs-citadas.test.mjs   # las ADR citadas existen y su estado es el del disco
node --test tests/lock.test.mjs           # el paso que trae el lock y tools/lock.mjs, mutados
node tools/lock.mjs --consumidor=../Synergos.CMS --nombre=Synergos.CMS   # lo que corre el CI del CMS
claude plugin validate .                  # el validador oficial del marketplace y el plugin
```

El medidor busca los dos repos en `--cms-path=` / `--ui-path=`, en `SYNERGOS_CMS_PATH` /
`SYNERGOS_UI_PATH`, o como clones hermanos. Sin ellos **no mide**: sale con 2 y lo dice
(`--sin-arboles` mide sólo el vocabulario fijo, y lo avisa).

## Lo que este repo todavía no hace

- **El gate del arnés (#142) está a medias, y esto es lo que tiene:** el lock de cada consumidor
  se resuelve contra el remoto y nombra este plugin, y su copia del workflow es la del SHA que fija
  (`tools/lock.mjs`); las frases del pin de Umbraco de `synergos-guardrails` se cruzan contra el
  CMS (en el CI del CMS y en el de acá); las ADR que las skills citan existen y tienen el estado que
  les atribuyen (`tests/adrs-citadas.test.mjs`, #172); y los cuatro criterios del #141 dan cero
  (`tools/criterios.mjs`). **Lo que no tiene**: una herramienta que existe y **nadie llama**
  (el diente 3b, el caso de `refresh-skill-catalog`), que el consumidor no guarde una **copia** de
  una skill de acá en su `.claude/skills/` (el diente 5), y que los cuatro criterios corran en el
  CI de los consumidores —hoy sólo corren acá, contra los dos repos (su rama homónima o `master`),
  en cada push y cada día—. No confíes en el CI de este repo para eso.
