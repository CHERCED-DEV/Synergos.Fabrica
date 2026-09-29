#!/usr/bin/env node
/**
 * Lo que el arnés afirma de un repo que lo CONSUME, comprobado desde el SHA que ese repo fija en su
 * `arnes.lock.json` (CHERCED-DEV/Synergos.CMS#142).
 *
 * Lo corre el workflow `arnes.yml` de cada consumidor DESPUÉS de traer ese SHA. Traerlo ya es el
 * primer diente —que el commit exista en el remoto, lo que el #171 no tuvo— y vive en el workflow
 * (`consumidor/arnes.yml`) porque lo que comprueba que el SHA existe no puede venir de ese SHA.
 * Todo lo demás vive acá, en una sola copia, y cada consumidor lo corre en la versión que fija.
 *
 * Qué comprueba, y en qué consumidor (`CONSUMIDORES`):
 *
 *   lock            el lock nombra ESTE arnés: su marketplace, su plugin y su repo son los de los
 *                   manifiestos del SHA traído. Un lock que resuelve a un commit que no es el plugin
 *                   que declara instala otra cosa, o nada.
 *   workflow        la copia `.github/workflows/arnes.yml` del consumidor es `consumidor/arnes.yml`
 *                   de este SHA (salvo fin de línea). El paso que trae el arnés no puede venir del
 *                   arnés, así que está copiado en los dos consumidores; esto hace que la copia sea
 *                   UNA, vigilada, y no dos que divergen (#141).
 *   pin-de-umbraco  las dos frases de `synergos-guardrails` que afirman el pin de Umbraco dicen la
 *                   rama que clava `Directory.Packages.props` del CMS. Es lo que el #141 le quitó a
 *                   `VersionDeUmbracoTests` al sacar las skills del CMS: el pin volvió a estar
 *                   afirmado en un sitio que nadie cruzaba, que es el defecto que el #149 midió.
 *
 * Uso:
 *   node tools/lock.mjs --consumidor=RUTA --nombre=Synergos.CMS|Synergos.UI [--arnes=RUTA]
 *
 * `--arnes` es la raíz del arnés contra el que se mide; por defecto, la de este fichero. Sale 1 si
 * algo no se cumple, con la lista de qué y qué hacer.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_ARNES = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const leerJson = (ruta) => JSON.parse(leer(ruta));

// ── lock: el lock nombra este arnés ──────────────────────────────────────────

const sinGit = (url) => String(url ?? '').trim().replace(/\/+$/, '').replace(/\.git$/, '').toLowerCase();

export function cruzarLock({ arnes, consumidor }) {
  const hallazgos = [];
  const rutaLock = join(consumidor, 'arnes.lock.json');
  if (!existsSync(rutaLock)) return [`${rutaLock} no existe: el consumidor no declara qué arnés usa.`];
  const lock = leerJson(rutaLock).arnes ?? {};
  const mk = leerJson(join(arnes, '.claude-plugin', 'marketplace.json'));
  const pl = leerJson(join(arnes, '.claude-plugin', 'plugin.json'));

  if (lock.marketplace !== mk.name) {
    hallazgos.push(`el lock dice marketplace «${lock.marketplace}» y el arnés traído publica «${mk.name}»: \`/plugin marketplace add\` no encontraría lo que el lock declara.`);
  }
  if (lock.plugin !== pl.name || !(mk.plugins ?? []).some((p) => p.name === lock.plugin)) {
    hallazgos.push(`el lock dice plugin «${lock.plugin}» y el arnés traído es «${pl.name}» (su marketplace lista: ${(mk.plugins ?? []).map((p) => p.name).join(', ') || 'nada'}).`);
  }
  if (sinGit(lock.repo) !== sinGit(pl.repository)) {
    hallazgos.push(`el lock trae el arnés de «${lock.repo}» y el arnés dice vivir en «${pl.repository}»: o el lock apunta a una copia, o el plugin.json quedó viejo.`);
  }
  return hallazgos;
}

// ── workflow: la copia del consumidor es la de este SHA ──────────────────────

export const WORKFLOW_CANONICO = 'consumidor/arnes.yml';
export const WORKFLOW_COPIA = '.github/workflows/arnes.yml';

export function cruzarWorkflow({ arnes, consumidor }) {
  const original = join(arnes, WORKFLOW_CANONICO);
  const copia = join(consumidor, WORKFLOW_COPIA);
  if (!existsSync(original)) return [`el arnés no trae ${WORKFLOW_CANONICO}: no hay contra qué comparar la copia.`];
  if (!existsSync(copia)) return [`falta ${WORKFLOW_COPIA}: copialo de ${WORKFLOW_CANONICO} del arnés que fija el lock.`];
  const a = leer(original).split('\n');
  const b = leer(copia).split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return [
        `${WORKFLOW_COPIA} no es ${WORKFLOW_CANONICO} del arnés fijado; difieren desde la línea ${i + 1}:\n` +
          `      arnés: ${a[i] ?? '(fin del fichero)'}\n      copia: ${b[i] ?? '(fin del fichero)'}\n` +
          '    El paso que trae el arnés está copiado en los dos consumidores porque no puede venir del arnés; ' +
          'que sea UNA copia depende de esto. Se cambia en Synergos.Fabrica y se copia acá al re-fijar el lock.',
      ];
    }
  }
  return [];
}

// ── pin-de-umbraco: las frases de la skill dicen la rama clavada ─────────────

const PIN = /<PackageVersion\s+Include="Umbraco\.Cms"\s+Version="(?<v>[^"]+)"/;

/**
 * Las frases que AFIRMAN el pin de Umbraco, con `{rama}` y `{siguiente}` donde van la rama clavada y
 * la prohibida. No llevan el parche a propósito: una skill no escribe la versión, dice dónde leerla
 * (regla 2 del README, criterio (c) de `criterios.mjs`); lo que afirma es la RAMA, y eso es lo que se
 * cruza.
 *
 * Se ancla a la FRASE entera y no al número, por lo que midió `VersionDeUmbracoTests` en el CMS: un
 * `includes('13')` pasa en verde con el defecto puesto, porque la misma skill cita otras versiones
 * en la prosa que explica el pin. Y la frase es además el ancla: si alguien la reescribe, esto se
 * cae y obliga a mirar la rama, que es justo cuando conviene mirarla.
 *
 * Son varias del mismo fichero porque cada una puede desviarse de las otras — las dos primeras eran
 * dos filas del censo de `VersionDeUmbracoTests` hasta el #141 por esa razón. Las otras dos son el
 * título y la aclaración de la misma sección, que afirman el pin igual y el #141 no censaba. Lo que
 * NO está: las menciones de «Umbraco 13» que describen la plataforma (§0, los iconos). Barrer la
 * prosa buscando un número es el barrido frágil que `VersionDeUmbracoTests` descartó por escrito.
 */
export const AFIRMAN_EL_PIN = [
  {
    fichero: 'skills/synergos-guardrails/SKILL.md',
    plantilla: '**La rama {rama} LTS, NO upgrade a {siguiente}+**',
    razon: 'su §7, lo primero que lee del pin quien entra al proyecto',
  },
  {
    fichero: 'skills/synergos-guardrails/SKILL.md',
    plantilla: '| Upgrade de Umbraco a {siguiente}+ | La rama {rama} LTS; la versión, en `Directory.Packages.props` (ADR 0001) |',
    razon: 'su tabla de lo que no se hace nunca, que repite el pin de §7',
  },
  {
    fichero: 'skills/synergos-guardrails/SKILL.md',
    plantilla: 'Umbraco {rama} — pinned',
    razon: 'el título de su §7',
  },
  {
    fichero: 'skills/synergos-guardrails/SKILL.md',
    plantilla: '**Lo clavado es la RAMA {rama} LTS, no un parche**',
    razon: 'la aclaración de su §7 sobre qué está clavado',
  },
];

export function cruzarPinDeUmbraco({ arnes, consumidor, afirmaciones = AFIRMAN_EL_PIN }) {
  // Red por el vacío: sin frases, esto pasa en verde sin mirar nada (#136).
  if (afirmaciones.length === 0) return ['el censo de frases que afirman el pin está vacío: no se está cruzando nada.'];
  const props = join(consumidor, 'Directory.Packages.props');
  if (!existsSync(props)) return [`no existe ${props}: es la única fuente de la versión de Umbraco (ADR 0004), y sin ella no hay contra qué cruzar.`];
  const m = PIN.exec(leer(props));
  if (!m) return ['Directory.Packages.props no declara un <PackageVersion> para Umbraco.Cms: sin él no se deriva la rama, y pasar en verde sería el verde sobre el vacío (#136).'];
  const v = m.groups.v;
  const rama = /^(\d+)\./.exec(v)?.[1];
  if (!rama) return [`Directory.Packages.props clava Umbraco.Cms en «${v}», y de ahí no sale una rama.`];
  const siguiente = String(Number(rama) + 1);

  const hallazgos = [];
  for (const { fichero, plantilla, razon } of afirmaciones) {
    const ruta = join(arnes, fichero);
    if (!existsSync(ruta)) {
      hallazgos.push(`el censo declara «${fichero}» (${razon}) y el arnés no lo tiene: o se corrige la ruta, o sale del censo.`);
      continue;
    }
    const esperada = plantilla.replaceAll('{rama}', rama).replaceAll('{siguiente}', siguiente);
    if (!leer(ruta).includes(esperada)) {
      hallazgos.push(
        `«${fichero}» no dice «${esperada}», y ahí afirma el pin (${razon}). ` +
          `Directory.Packages.props clava Umbraco.Cms ${v}: rama ${rama}. O el pin cambió de rama sin mover la skill ` +
          '—y la skill enseña una rama que no se despliega—, o la frase se reescribió: en los dos casos hay que mirar ' +
          'la rama antes de seguir, y la plantilla de AFIRMAN_EL_PIN (tools/lock.mjs) se mueve en el mismo commit que la frase.',
      );
    }
  }
  return hallazgos;
}

// ── Los consumidores ─────────────────────────────────────────────────────────

const COMPROBACIONES = {
  lock: cruzarLock,
  workflow: cruzarWorkflow,
  'pin-de-umbraco': cruzarPinDeUmbraco,
};

/**
 * Quién consume este arnés y qué se le comprueba. Un consumidor que no está acá sale rojo: un repo
 * nuevo que fija el arnés entra declarando qué afirma el arnés de él, no heredando «nada».
 */
export const CONSUMIDORES = {
  'Synergos.CMS': ['lock', 'workflow', 'pin-de-umbraco'],
  'Synergos.UI': ['lock', 'workflow'],
};

export function comprobar({ nombre, consumidor, arnes = RAIZ_ARNES }) {
  const lista = CONSUMIDORES[nombre];
  if (!lista) {
    return { desconocido: true, resultados: [] };
  }
  return {
    desconocido: false,
    resultados: lista.map((que) => ({ que, hallazgos: COMPROBACIONES[que]({ arnes, consumidor }) })),
  };
}

function principal(argv, env) {
  const arg = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const nombre = arg('nombre');
  const consumidor = resolve(arg('consumidor') ?? '.');
  const arnes = resolve(arg('arnes') ?? RAIZ_ARNES);
  const error = (msg) => console.log(env.GITHUB_ACTIONS ? `::error::${msg.split('\n')[0]}\n${msg}` : msg);

  const { desconocido, resultados } = comprobar({ nombre, consumidor, arnes });
  if (desconocido) {
    error(`[lock] «${nombre ?? '(sin --nombre)'}» no es un consumidor declarado en CONSUMIDORES de tools/lock.mjs ` +
      `(${Object.keys(CONSUMIDORES).join(', ')}). Un repo que fija el arnés entra declarando qué se le comprueba.`);
    return 1;
  }
  let fallos = 0;
  for (const { que, hallazgos } of resultados) {
    if (hallazgos.length === 0) {
      console.log(`✓ ${que}`);
      continue;
    }
    fallos += hallazgos.length;
    for (const h of hallazgos) error(`✗ ${que}: ${h}`);
  }
  console.log(`\n[lock] ${nombre} contra el arnés de ${arnes}: ${fallos === 0 ? 'todo se cumple' : `${fallos} hallazgo(s)`}`);
  return fallos === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal(process.argv.slice(2), process.env);
}
