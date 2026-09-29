/**
 * Las ADR que una skill cita EXISTEN, y el estado que les atribuye es el del DISCO —
 * `node --test tests/adrs-citadas.test.mjs`, sin dependencias.
 *
 * Es el primer diente de «lo que una skill afirma sigue siendo cierto» (el gate del arnés, #142),
 * y nace de la auditoría de reutilización (#172): las skills enseñan la ADR 0134 como Aceptada y las
 * 0135-0139 como Propuestas, y una skill **no puede enseñar una propuesta como hecha**. El día que
 * se acepte una, este test se pone rojo en cada línea que todavía diga «Propuesta» — que es
 * exactamente cuando hay que ir a cambiarla. Una cifra en una skill se desvía; un estado también.
 *
 * Qué mira: cada «ADR NNNN» (y «ADRs NNNN-MMMM», «ADR NNNN/MMMM», «ADR NNNN, MMMM y PPPP») de
 * `skills/**`. Existencia: el número tiene un `NNNN-*.md` en `docs/adr/` del CMS. Estado: si en la
 * misma cláusula, justo detrás, la skill dice «Aceptada»/«Propuesta» (o Accepted/Proposed), tiene
 * que coincidir con la línea `Estado`/`Status` del fichero.
 *
 * Qué NO mira: números sin la palabra «ADR» delante (una tabla, un «(0136)» suelto), ni estados
 * dichos lejos del número. Por eso las skills que atribuyen un estado lo escriben pegado:
 * «ADR 0137 (Propuesta)».
 *
 * Necesita el árbol del CMS —`SYNERGOS_CMS_PATH` o el clon hermano, como el medidor— y **falla**
 * si no lo encuentra: un «no pude comprobar» no es un verde. Y falla también si el CMS no tiene las
 * ADR que las skills citan: una skill que enseña una ADR que el CMS publicado no tiene no se puede
 * mergear antes que ella. Ése es el orden de merge dicho como gate, no como aviso en prosa
 * (`feedback_a_merge_order_warning_in_prose_is_not_a_gate`).
 *
 * Se vio fallar: mutaciones en el informe 24 del #172.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = join(RAIZ, 'skills');
const CMS = resolve(process.env.SYNERGOS_CMS_PATH || join(RAIZ, '..', 'Synergos.CMS'));
const DIR_ADR = join(CMS, 'Synergos.CMS.Web', 'docs', 'adr');

/** «ADR 0134», «ADRs 0135-0139», «ADR 0010/0020», «ADR 0106, 0107 y 0109», «ADR 0135 a 0139». */
const CORRIDA = /\bADRs?\s+(\d{4}(?:\s*(?:[–-]|,|\/|\by\b|\ba\b)\s*\d{4})*)/g;
/** El estado que una skill afirma, en la misma cláusula y justo detrás del número. */
const ESTADO = /\b(aceptad[ao]s?|accepted|propuest[ao]s?|proposed)\b/i;
const VENTANA = 40;
const FIN_DE_CLAUSULA = /[.;:|—]/;

const normalizar = (s) => (/^(aceptad|accepted)/i.test(s) ? 'aceptada' : /^(propuest|proposed)/i.test(s) ? 'propuesta' : 'otro');

function markdownDe(dir) {
  const res = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) res.push(...markdownDe(p));
    else if (e.name.endsWith('.md')) res.push(p);
  }
  return res;
}

/** Los números de una corrida, con los rangos expandidos. */
function numeros(corrida) {
  const res = [];
  const partes = corrida.split(/\s*(,|\/|\by\b)\s*/).filter((p) => /\d/.test(p));
  for (const p of partes) {
    const r = /^(\d{4})\s*(?:[–-]|\ba\b)\s*(\d{4})$/.exec(p.trim());
    if (r) for (let n = Number(r[1]); n <= Number(r[2]); n++) res.push(String(n).padStart(4, '0'));
    else res.push(...p.match(/\d{4}/g));
  }
  return res;
}

function estadosDelDisco() {
  const estados = new Map();
  for (const f of readdirSync(DIR_ADR)) {
    const m = /^(\d{4})-.*\.md$/.exec(f);
    if (!m) continue;
    const linea = /^- \*\*(?:Estado|Status):\*\*\s*(.*)$/m.exec(readFileSync(join(DIR_ADR, f), 'utf8'));
    estados.set(m[1], linea ? normalizar(linea[1].trim()) : 'otro');
  }
  return estados;
}

/** Cada cita de una ADR en las skills: fichero, línea, número y —si lo dice— el estado. */
export function citas() {
  const res = [];
  for (const f of markdownDe(SKILLS)) {
    const lineas = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n');
    lineas.forEach((l, i) => {
      for (const m of l.matchAll(CORRIDA)) {
        let cola = l.slice(m.index + m[0].length, m.index + m[0].length + VENTANA);
        const corte = cola.search(FIN_DE_CLAUSULA);
        if (corte >= 0) cola = cola.slice(0, corte);
        const e = ESTADO.exec(cola);
        for (const n of numeros(m[1])) {
          res.push({ donde: `${relative(RAIZ, f).split('\\').join('/')}:${i + 1}`, n, dice: e ? normalizar(e[1]) : null, texto: m[0] + cola });
        }
      }
    });
  }
  return res;
}

test('el árbol del CMS está donde se lo busca (sin él no se mide, y no es un verde)', () => {
  assert.ok(
    existsSync(DIR_ADR),
    `no encuentro ${DIR_ADR}. Apuntá SYNERGOS_CMS_PATH al clon del CMS o clonalo como hermano.`,
  );
});

test('toda ADR que una skill cita existe en el CMS', { skip: !existsSync(DIR_ADR) && 'sin árbol: lo dice el test anterior' }, () => {
  const disco = estadosDelDisco();
  const faltan = citas().filter((c) => !disco.has(c.n)).map((c) => `${c.donde} → ADR ${c.n}`);
  assert.deepEqual(
    [...new Set(faltan)],
    [],
    `ADRs citadas que el CMS en ${CMS} no tiene. Si son nuevas, el CMS que las trae se mergea antes que este arnés:\n  ${[...new Set(faltan)].join('\n  ')}`,
  );
});

test('el estado que una skill le atribuye a una ADR es el de su fichero', { skip: !existsSync(DIR_ADR) && 'sin árbol: lo dice el test anterior' }, () => {
  const disco = estadosDelDisco();
  const conEstado = citas().filter((c) => c.dice && disco.has(c.n));
  // Red por el vacío: si ninguna cita dice un estado, este test vigila la nada (el patrón se rompió
  // o alguien reescribió todas las atribuciones lejos del número).
  assert.ok(conEstado.length > 0, 'ninguna skill atribuye un estado a una ADR: el test no está mirando nada');
  const malas = conEstado
    .filter((c) => disco.get(c.n) !== 'otro' && c.dice !== disco.get(c.n))
    .map((c) => `${c.donde} → ADR ${c.n}: la skill dice «${c.dice}», el fichero dice «${disco.get(c.n)}» · ${c.texto.trim()}`);
  assert.deepEqual(malas, [], `estados que no son los del disco:\n  ${malas.join('\n  ')}`);
});
