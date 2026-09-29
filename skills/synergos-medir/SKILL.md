---
name: synergos-medir
description: Protocolo de MEDICIÓN de Synergos, y de orquestación de agentes en paralelo cuando el arquitecto la pide. Activar cuando una cifra o una lista va a decidir algo (retirar, fusionar, reusar, cuántos, cuáles, qué severidad), antes de relayar al arquitecto lo que midió un agente, al abrir trabajo sobre un árbol heredado, o al repartir una auditoría entre varios agentes. Cubre que un grep es una hipótesis (toda cifra que decide sale de DOS métodos distintos, y se dice cuáles) con las tres trampas medidas —el sujeto que se cuenta a sí mismo, el tag partido en líneas, la indirección—; la lista nombrada antes que la cifra; que las cifras las imprime un gate y la guía cita el comando; ejecutar con una consulta de control y comprobar que la mutación entró; los rojos de entorno de Windows nombrados por ticket y las cadenas && que esconden suites; un worktree por sesión; y, con varios agentes, el contexto compartido, un worktree por agente, el formato fijo de informe con «lo que NO medí» y la verificación del orquestador en el disco. Es CÓMO se mide; qué se verifica en el navegador es synergos-app-verify, y cómo se escribe un test, synergos-test-author.
---

# SYNERGOS Medir — cómo se mide algo que va a decidir

La auditoría de reutilización (#169 · UI#78 · #172) midió los dos árboles con seis agentes en
paralelo y dejó dos cosas: el modelo de ADR 0134, y **cómo se mide sin engañarse**. Esta skill es
la segunda. No trae cifras: trae el procedimiento y los comandos que las dan.

Las rutas (`$cms`, `$ui`, `$cdnRoot`, `$base`) salen de `synergos-guardrails/references/entorno.md`.

---

## 0. Cuándo aplica

- Una cifra o una lista **decide algo**: qué se retira, qué se fusiona, si algo se reusa, cuántos
  consumidores tiene, qué severidad tiene un defecto.
- Vas a **relayar** al arquitecto lo que midió otro (un agente, un informe, una línea de `CLAUDE.md`).
- Empezás trabajo sobre un árbol que no mediste vos (una lista heredada, un ticket viejo, un
  informe de otra sesión).
- El arquitecto pide **repartir** una medición entre varios agentes (§7). Sin ese pedido, se
  trabaja con uno (`synergos-guardrails` §8).

Si la cifra sólo informa y no decide nada, basta con decir de dónde salió.

---

## 1. Un grep es una hipótesis, no una medición

**La forma de la búsqueda decide la cifra antes que el disco.** En una sola sesión salieron mal
tres cifras que iban a decidir algo, las tres por el patrón y ninguna por el árbol, y las tres
daban un número plausible (`CLAUDE.md` §5 del CMS, `feedback_a_grep_is_a_hypothesis`):

| trampa | cómo se vio | el atajo que la evita |
|---|---|---|
| **El sujeto se cuenta a sí mismo** | «`card` monta su pieza del DS» porque se buscó `CardComponent` en la carpeta del elemento — y el elemento publicado **se llama** `CardComponent` (UI regla 41) | excluir del conteo el fichero del propio sujeto; o exigir DOS señales a la vez (el tag `<syn-x` **y** el import de la clase que lo declara) |
| **El tag partido en líneas** | «`syn-segmented` no lo usa nadie» buscando `<syn-segmented ` con espacio; el uso vivo es `<syn-segmented` y un salto de línea | buscar `<x(\s\|>\|$)` en modo multilínea, o leer con un parser (el AST del compilador de Angular, que la UI ya usa en sus gates) |
| **La indirección** | NewShore «montaba Angular desde 82 macros» contando el atributo dentro de la macro; muchas delegaban en un controlador que pinta el host | seguir el salto antes de contar: el controlador, el alias del registry (el tag `<synergos-text-block>` responde a varios `name`), `dependencies`, un barril que re-exporta **por nombre** |

**La regla: toda cifra que decide sale de DOS métodos distintos** —nombre y estructura, grep y
parser, conteo directo y ejecución— **y se dice cuáles.** Cuando coinciden, la cifra deja de
depender del patrón. Cuando no coinciden, **se sospecha primero del patrón**, no del árbol.

Dos pistas baratas de que el método está roto, antes de comparar nada:

- **Una cifra que no suma.** «31 alcanzables + 22 inalcanzables» sobre 55 fue un `Set` que colapsó
  dos piezas con el mismo selector (UI regla 39 (d)): la clave era la clase, no el selector.
- **Todo sale igual.** Cero consumidores para **todas** las compositions, «sin Angular» para
  **todos** los elementos: eso es un descubrimiento roto, no un árbol vacío. Un recorrido que mide
  tiene su red por el vacío y **falla** en vez de reportar (`synergos-element-inventory` §4,
  `synergos-schema-audit` §2).

---

## 2. La lista nombrada va antes que la cifra

- Toda cuenta sale con su lista `fichero:línea` (o nombre por nombre). **Una cifra correcta con la
  lista incompleta es peor que una equivocada**: la lista es lo que alguien lee para saber qué
  existe antes de proponerlo de cero (`CLAUDE.md` del CMS, nota de §2 sobre
  `CapacidadesConectadasTests`).
- Una **línea base es una LISTA, no un número**: con un número, retirar una y escribir otra pasa en
  verde (UI regla 39).
- Lo que se clasifica a mano (funcionalidad o pieza, qué es gemela de qué) se clasifica **con su
  razón escrita**, para que el siguiente pueda discrepar con algo delante.

---

## 3. Las cifras las imprime un gate — la guía cita el comando

*Una cifra en una skill es una cifra que se va a desviar; lo que va en una skill es CÓMO
CONSULTARLA* (doc 13 §10.1 del CMS). Y lo mismo en un `CLAUDE.md`: la regla 39 del UI decía «9 de 12
patterns» sin que nada la derivara, y era falsa. Hoy la imprime el runner.

| pregunta | cómo se consulta (nunca de memoria) |
|---|---|
| ¿Cuántos elementos declara el registry? | `npm run catalog` en `$ui` (imprime la cuenta al terminar, de `vitals/contracts/src/element-registry.json`) |
| ¿Cuántos publica el CDN que lee el CMS? | las entradas `elements` de `$CDN_ROOT/registry.json` (lo escribe `npm run build:cdn`) |
| ¿Qué piezas del DS no alcanza ningún elemento, por tier? | `npm run gate:design-system` en `$ui` (imprime el reparto y la línea base) |
| ¿Cuántos tests tiene cada suite del CMS? | la salida de `dotnet test` de cada proyecto; `SuiteCountTests` la cuadra contra su ensamblado |
| ¿Qué ADRs hay, y cuál está aceptada? | `ls $cms/Synergos.CMS.Web/docs/adr/[0-9]*.md` y la línea `Estado`/`Status` de cada una; el índice es `docs/adr/README.md` (lo vigila `AdrIndexTests`) |
| ¿Qué capacidades tienen segundo consumidor? | las listas de `CLAUDE.md` §11 del CMS, que `SegundoConsumidorTests` cruza contra el disco |
| ¿Contraste por tema? | `node tools/audit-themes.mjs --all` en `$ui` |
| ¿El arnés afirma algo que no debe? | `node tools/criterios.mjs` en esta Fábrica |

Si una cifra que decide **no la da ningún gate**, se mide con dos métodos (§1), se dice cuáles, y
se escribe con fecha y SHA base, como una foto — nunca como el estado de hoy.

---

## 4. Medir un comportamiento es ejecutarlo — con control, y con la mutación dentro

- **Una comprobación que no puede fallar no comprueba nada.** Antes de creerle a una consulta,
  corré la que la refutaría: un `[FromQuery]` mal nombrado devuelve TODO en vez de fallar
  (`synergos-guardrails` §4). En D1 el control es alimentar al elemento con las claves que SÍ lee y
  ver que pinta (`synergos-app-verify` §4.bis).
- **Lo que se decide por comportamiento se mide ejecutando.** Qué claves conserva un sanitizador no
  se lee con un grep: se ejecuta con el payload exacto que emite la vista (ADR 0135, «Qué hace
  falta para aceptarla», punto 1).
- **Mutar un gate es reintroducir el defecto, ver el rojo, y restaurar tocando el fichero** (doc 12
  §5.10). Y antes de creerle al rojo o al verde, **comprobar que la mutación ENTRÓ** (`git diff`,
  o leer la línea): una mutación que no se aplicó —por un fin de línea, por un patrón que no casó—
  deja todo verde y se lee como verificación (ADR 0135, «que cada mutación entró»).
- **La severidad se mide, no se relaya.** «Roto en producción» exige mirar lo que está publicado y
  montado, con control; «el normalizador lo tapa» exige leer el normalizador
  (`synergos-contract-drift` §3).

---

## 5. La máquina de desarrollo no es la de CI

Los workflows corren en `ubuntu-latest`; la máquina del arquitecto es Windows, con worktrees y el
SDK en español. **La diferencia no sale sólo en rojo: una sale en VERDE** (`CLAUDE.md` §5 del CMS,
`feedback_a_dev_machine_is_not_ci`).

- **Los rojos de entorno se nombran por TICKET, no por cifra**: los del CMS y los de la UI están en
  el #170 y en UI#79, cada uno con su causa en esa memoria. Se diagnostican una vez; un rojo que
  **no** está en esa lista es real hasta demostrar lo contrario. Y nunca se embolsa un fallo por
  vecindad («son los de entorno de siempre») sin mirar que su **nombre** esté en la lista.
- **El verde de entorno es el caro**: G-7 cruza muchas menos claves con CRLF que en LF y queda en
  verde. Una cifra que depende de bytes (líneas, claves por regex) se compara en LF.
- **Las cadenas `&&` esconden suites.** En Windows, `npm test` de la UI corta en el primer rojo de
  entorno y lo de detrás no corre: se corren los tramos sueltos (`npm run test:contratos`,
  `npm run test:tools`, `npm run test:vitals`, `npm run test:angular`, `npm run test:preact`) y se
  reporta cada uno. Lo mismo con un bucle que sale en el primer `dotnet test` rojo: se corren todos
  y se agrega.
- Ninguna herramienta reconoce una salida por **texto localizado** del compilador.

---

## 6. Una sesión, su worktree

Dos sesiones en el mismo disco se pisan aunque cada una crea tener «su» carpeta: la auditoría
encontró commits y trabajo a medias de otra sesión en el worktree que iba a usar.

- **Para leer**: `git worktree add --detach <ruta> <sha>` — una foto que nadie más mueve.
- **Para escribir**: una rama propia en un worktree propio. Al retomar: `git status` y las fechas
  de lo que hay, **antes** de tocar nada. Lo ajeno no se toca, ni se «limpia».
- **Commits con rutas explícitas**: `git add -- <rutas>` y `git commit -- <rutas>`; nunca
  `git add .`, `git add -A` ni `git stash` en un checkout que puede estar compartido.
- Lo que **no** se aísla con un worktree: el CMS corriendo, su base, el CDN construido en `public/`
  del clon de la UI. Son de toda la máquina.

---

## 7. Varios agentes en paralelo (sólo cuando el arquitecto lo pide)

Lo que hizo que seis agentes midieran de forma coherente, cada uno con su informe, y que el
orquestador pudiera creerles:

1. **Contexto compartido, en un fichero**: un `00-CONTEXTO-COMPARTIDO.md` en la carpeta de
   informes (fuera de los repos) con la pregunta que se decide, los SHA base de cada repo, el
   vocabulario, las reglas de esta skill, y lo que **ningún** agente hace (escribir en los árboles,
   en GitHub, en la base).
2. **Un worktree limpio por agente**, `--detach` en la base, y una carpeta de scripts por agente
   para que lo medido se pueda reproducir.
3. **Un encargo por agente** con: la pregunta que decide, lo que NO tiene que hacer, y el formato
   del informe.
4. **Formato fijo de informe**, en este orden:
   - respuesta corta (lo que decide, en cinco líneas);
   - método: **los dos métodos** y cuáles;
   - la lista nombrada (`fichero:línea`);
   - hallazgos, cada uno con su evidencia;
   - decisiones que son de producto y **no** puede tomar un agente;
   - el gate propuesto, con sus mutaciones;
   - **lo que NO medí** (§8);
   - qué le sirve a la fábrica (S11);
   - los scripts para reproducir.
5. **Marcas de certeza por cifra**: ✔ comprobado en el disco por quien escribe · ◐ medido por un
   agente con dos métodos o ejecutando, sin re-derivar · ○ cifra de un agente sin verificar. Son
   las que usan las ADR 0134-0139.
6. **Correcciones en vuelo**: si un agente encuentra algo que cambia la premisa de otro, el
   orquestador se lo manda a ese otro **mientras trabaja**, no al final.
7. **La verificación del orquestador**: nada de un agente llega al arquitecto sin una comprobación
   en el disco **de lo que decide** (no de todo). Y en los dos sentidos: en la auditoría los seis
   informes se sostuvieron y **el que falló fue el orquestador** — dejarse corregir es parte del
   método (doc 13 §6.3 del CMS).
8. **La síntesis** marca, cifra por cifra, cuáles comprobó el orquestador y cuáles cita.

---

## 8. «Lo que NO medí» es obligatorio

Todo informe cierra diciendo lo que no se midió y por qué: sin navegador, sin la base, sin lector de
pantalla, sin el contenido publicado, sin la otra plataforma. **Una ausencia de evidencia no se
escribe como evidencia de ausencia**: «no encontré consumidores» es una hipótesis hasta que un
segundo método lo confirme.

---

## 9. Qué NO hacer

| ❌ No | ✅ En su lugar |
|---|---|
| Decidir con la cifra de un solo grep | Dos métodos, y decir cuáles (§1) |
| Contar menciones de un tipo como si fueran usos | Dos señales a la vez, excluyendo el fichero del sujeto |
| Escribir una cifra en una skill o una guía | El comando o el gate que la imprime (§3) |
| Relayar la cifra o la severidad de un agente sin mirarla | Comprobar en el disco lo que decide (§7.7) |
| Creerle a un rojo o a un verde de una mutación sin ver el `diff` | Comprobar que la mutación entró (§4) |
| «Son los rojos de entorno de siempre» | Nombrarlos por test y por ticket (#170, UI#79); el resto es real (§5) |
| `npm test` entero en Windows y leer sólo el final | Los tramos sueltos, cada uno reportado |
| Trabajar en el worktree de otra sesión, o `git add .` | Worktree propio; rutas explícitas (§6) |
| Lanzar varios agentes sin pedido | Uno; con pedido, §7 entero |
| Callar lo que no se midió | «Lo que NO medí», siempre (§8) |

**Relacionadas:** `synergos-guardrails` (el índice) · `synergos-app-verify` (medir en el
navegador) · `synergos-test-author` (mutar un gate, acotar una aserción) · `synergos-ola-open`
(la Fase 0 sobre un árbol heredado) · `synergos-funcionalidad` (qué se mide antes de armar algo
colocable).
