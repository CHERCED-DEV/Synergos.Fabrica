/**
 * El gate del lock (#142): lo que un consumidor comprueba del arnés que fija —
 * `node --test tests/lock.test.mjs`, sin dependencias.
 *
 * Dos mitades, y las dos se prueban acá porque ninguna se puede correr en su sitio:
 *
 * 1. El PASO que trae el SHA del lock (`consumidor/arnes.yml`). Vive en un YAML porque lo que
 *    comprueba que el SHA existe no puede venir de ese SHA, y un workflow no corre en una máquina.
 *    Así que se saca el `run:` del YAML tal cual y se ejecuta con bash contra repos locales: el
 *    commit que existe, el del #171 que no, un repo que no existe y un lock con una rama en vez de
 *    un SHA. Se prueba el texto que va a correr, no una copia de él.
 * 2. `tools/lock.mjs`, lo que ese paso corre después: el lock nombra este arnés, la copia del
 *    workflow es la de este SHA, y —en el CMS— las frases del pin de Umbraco de `synergos-guardrails`
 *    dicen la rama que clava `Directory.Packages.props`.
 *
 * Las frases del pin se prueban contra los ficheros REALES —la skill de este repo y el
 * `Directory.Packages.props` del CMS clonado— y sus mutaciones se hacen sobre copias de ellos: la
 * skill cita otras versiones en la prosa que explica el pin, y un fixture escrito a mano no las tiene
 * (`a_gate_that_parses_source_needs_its_own_mutations`: se prueba contra el caso raro del repo).
 *
 * Necesita el CMS (`SYNERGOS_CMS_PATH` o el clon hermano) y falla si no está: un «no pude comprobar»
 * no es un verde.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  AFIRMAN_EL_PIN, CONSUMIDORES, WORKFLOW_CANONICO, WORKFLOW_COPIA,
  cruzarLock, cruzarPinDeUmbraco, cruzarWorkflow,
} from '../tools/lock.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CMS = resolve(process.env.SYNERGOS_CMS_PATH || join(RAIZ, '..', 'Synergos.CMS'));
const UI = resolve(process.env.SYNERGOS_UI_PATH || join(RAIZ, '..', 'Synergos.UI'));
const HAY_CMS = existsSync(join(CMS, 'Directory.Packages.props'));
const SIN_CMS = !HAY_CMS && 'sin el CMS: lo dice el primer test';

/** El SHA del #171: el lock lo fijó durante días y el remoto nunca lo tuvo. */
const SHA_DEL_171 = '5190a95cfe1fe4eb93ec01d9f52350f0ce1b73cd';

const leer = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const temporal = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'lock-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};
const escribir = (ruta, texto) => {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, texto);
};

// ── El CMS está donde se lo busca ────────────────────────────────────────────

test('el CMS está donde se lo busca (sin él no se cruza el pin, y eso no es un verde)', () => {
  assert.ok(HAY_CMS, `no encuentro ${join(CMS, 'Directory.Packages.props')}. Apuntá SYNERGOS_CMS_PATH al clon del CMS o clonalo como hermano.`);
});

// ── pin-de-umbraco ───────────────────────────────────────────────────────────

/** La rama que clava el CMS real, para que las mutaciones no escriban un número a mano. */
function ramaDelCms() {
  const v = /<PackageVersion\s+Include="Umbraco\.Cms"\s+Version="(\d+)\./.exec(leer(join(CMS, 'Directory.Packages.props')))[1];
  return { rama: v, siguiente: String(Number(v) + 1) };
}
const frase = (i, rama, siguiente) => AFIRMAN_EL_PIN[i].plantilla.replaceAll('{rama}', rama).replaceAll('{siguiente}', siguiente);

/** Un arnés de mentira con la guardrails REAL, transformada. */
function arnesCon(t, transformar) {
  const d = temporal(t);
  const f = AFIRMAN_EL_PIN[0].fichero;
  escribir(join(d, f), transformar(leer(join(RAIZ, f))));
  return d;
}
/** Un CMS de mentira con el Directory.Packages.props REAL, transformado. */
function cmsCon(t, transformar) {
  const d = temporal(t);
  escribir(join(d, 'Directory.Packages.props'), transformar(leer(join(CMS, 'Directory.Packages.props'))));
  return d;
}
const conUmbraco = (v) => (props) => props.replace(/(<PackageVersion\s+Include="Umbraco\.Cms"\s+Version=")[^"]+/, `$1${v}`);

test('las frases de guardrails que afirman el pin dicen la rama que clava el CMS', { skip: SIN_CMS }, () => {
  assert.deepEqual(cruzarPinDeUmbraco({ arnes: RAIZ, consumidor: CMS }), []);
});

test('mutación: §7 dice otra rama → rojo, y nombra la frase', { skip: SIN_CMS }, (t) => {
  const { rama, siguiente } = ramaDelCms();
  const otra = String(Number(rama) - 1);
  const arnes = arnesCon(t, (s) => s.replace(frase(0, rama, siguiente), frase(0, otra, rama)));
  const h = cruzarPinDeUmbraco({ arnes, consumidor: CMS });
  assert.equal(h.length, 1, h.join('\n'));
  assert.match(h[0], /§7/);
});

test('mutación: la tabla dice otra rama → rojo, aunque §7 siga bien', { skip: SIN_CMS }, (t) => {
  const { rama, siguiente } = ramaDelCms();
  const arnes = arnesCon(t, (s) => s.replace(frase(1, rama, siguiente), frase(1, siguiente, String(Number(siguiente) + 1))));
  const h = cruzarPinDeUmbraco({ arnes, consumidor: CMS });
  assert.equal(h.length, 1, h.join('\n'));
  assert.match(h[0], /tabla/);
});

test('mutación: §7 vuelve a escribir la versión con el parche → rojo (la forma de antes del #149)', { skip: SIN_CMS }, (t) => {
  const { rama, siguiente } = ramaDelCms();
  const arnes = arnesCon(t, (s) => s.replace(frase(0, rama, siguiente), `**${rama}.13.1, NO upgrade a ${siguiente}+**`));
  assert.equal(cruzarPinDeUmbraco({ arnes, consumidor: CMS }).length, 1);
});

test('mutación: el CMS sube de rama y la skill no → rojo en cada frase del censo', { skip: SIN_CMS }, (t) => {
  const { siguiente } = ramaDelCms();
  const consumidor = cmsCon(t, conUmbraco(`${siguiente}.0.0`));
  assert.equal(cruzarPinDeUmbraco({ arnes: RAIZ, consumidor }).length, AFIRMAN_EL_PIN.length);
});

test('control: el CMS sube de parche DENTRO de la rama → verde (lo clavado es la rama, no el parche)', { skip: SIN_CMS }, (t) => {
  const { rama } = ramaDelCms();
  const consumidor = cmsCon(t, conUmbraco(`${rama}.99.0`));
  assert.deepEqual(cruzarPinDeUmbraco({ arnes: RAIZ, consumidor }), []);
});

test('red por el vacío: sin Umbraco.Cms en Directory.Packages.props → rojo, no «nada que cruzar»', { skip: SIN_CMS }, (t) => {
  const consumidor = cmsCon(t, (s) => s.replace(/<PackageVersion\s+Include="Umbraco\.Cms"[^>]*>/, ''));
  const h = cruzarPinDeUmbraco({ arnes: RAIZ, consumidor });
  assert.equal(h.length, 1);
  assert.match(h[0], /Umbraco\.Cms/);
  assert.equal(cruzarPinDeUmbraco({ arnes: RAIZ, consumidor: CMS, afirmaciones: [] }).length, 1, 'un censo vacío tiene que romper');
});

// ── lock ─────────────────────────────────────────────────────────────────────

test('los locks de los dos consumidores nombran este arnés', { skip: SIN_CMS }, () => {
  assert.deepEqual(cruzarLock({ arnes: RAIZ, consumidor: CMS }), []);
  assert.ok(existsSync(join(UI, 'arnes.lock.json')), `no encuentro ${UI}: apuntá SYNERGOS_UI_PATH`);
  assert.deepEqual(cruzarLock({ arnes: RAIZ, consumidor: UI }), []);
});

function lockDe(t, cambios) {
  const d = temporal(t);
  const lock = JSON.parse(leer(join(CMS, 'arnes.lock.json')));
  Object.assign(lock.arnes, cambios);
  escribir(join(d, 'arnes.lock.json'), JSON.stringify(lock, null, 2));
  return d;
}

test('mutación: el lock nombra otro plugin u otro marketplace → rojo', { skip: SIN_CMS }, (t) => {
  assert.equal(cruzarLock({ arnes: RAIZ, consumidor: lockDe(t, { plugin: 'otro' }) }).length, 1);
  assert.equal(cruzarLock({ arnes: RAIZ, consumidor: lockDe(t, { marketplace: 'otro' }) }).length, 1);
});

test('mutación: el lock trae el arnés de otro repo → rojo; sin `.git` al final es el mismo', { skip: SIN_CMS }, (t) => {
  assert.equal(cruzarLock({ arnes: RAIZ, consumidor: lockDe(t, { repo: 'https://github.com/alguien/Synergos.Fabrica.git' }) }).length, 1);
  assert.deepEqual(cruzarLock({ arnes: RAIZ, consumidor: lockDe(t, { repo: 'https://github.com/CHERCED-DEV/Synergos.Fabrica' }) }), []);
});

// ── workflow ─────────────────────────────────────────────────────────────────

function consumidorConWorkflow(t, texto) {
  const d = temporal(t);
  if (texto !== null) escribir(join(d, WORKFLOW_COPIA), texto);
  return d;
}
const canonico = () => leer(join(RAIZ, WORKFLOW_CANONICO));

test('la copia del workflow es la del arnés aunque tenga CRLF (el checkout de Windows)', (t) => {
  const consumidor = consumidorConWorkflow(t, canonico().replace(/\n/g, '\r\n'));
  assert.deepEqual(cruzarWorkflow({ arnes: RAIZ, consumidor }), []);
});

test('mutación: la copia difiere en un renglón → rojo, y dice cuál', (t) => {
  const lineas = canonico().split('\n');
  const i = lineas.findIndex((l) => l.includes('fetch -q --depth 1'));
  lineas[i] = lineas[i].replace('--depth 1', '--depth 2');
  const h = cruzarWorkflow({ arnes: RAIZ, consumidor: consumidorConWorkflow(t, lineas.join('\n')) });
  assert.equal(h.length, 1);
  assert.match(h[0], new RegExp(`línea ${i + 1}\\b`));
});

test('mutación: el consumidor no tiene la copia → rojo', (t) => {
  assert.equal(cruzarWorkflow({ arnes: RAIZ, consumidor: consumidorConWorkflow(t, null) }).length, 1);
});

test('el workflow corre en cada push a main/master y en cada PR, sin filtro de paths', () => {
  const y = canonico();
  const codigo = y.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.doesNotMatch(codigo, /^\s*paths(-ignore)?:/m, 'un filtro de paths se equivoca en silencio (#128)');
  assert.match(codigo, /^\s{2}pull_request:/m);
  assert.match(codigo, /^\s{4}branches:\s*\[main, master\]/m);
});

// ── Los consumidores ─────────────────────────────────────────────────────────

test('todo consumidor comprueba el lock y la copia del workflow; el CMS, además, el pin', () => {
  for (const [nombre, que] of Object.entries(CONSUMIDORES)) {
    assert.ok(que.includes('lock') && que.includes('workflow'), `${nombre}: ${que.join(', ')}`);
  }
  assert.ok(CONSUMIDORES['Synergos.CMS'].includes('pin-de-umbraco'));
});

const cli = (...args) => spawnSync(process.execPath, [join(RAIZ, 'tools', 'lock.mjs'), ...args], { encoding: 'utf8' });

test('un consumidor que no está declarado sale rojo, no «sin comprobaciones»', () => {
  const r = cli('--consumidor=.', '--nombre=Synergos.Otro');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no es un consumidor declarado/);
});

test('de punta a punta: la UI con su lock y la copia del workflow → 0', { skip: SIN_CMS }, (t) => {
  const d = temporal(t);
  cpSync(join(UI, 'arnes.lock.json'), join(d, 'arnes.lock.json'));
  escribir(join(d, WORKFLOW_COPIA), canonico());
  const r = cli(`--consumidor=${d}`, '--nombre=Synergos.UI');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// ── El paso que trae el arnés, ejecutado ─────────────────────────────────────

const PASO = 'Traer el arnés que fija arnes.lock.json';

/** El `run: |` del paso, tal como está en el YAML y sin su sangría. */
function bloqueDelPaso(nombre) {
  const lineas = canonico().split('\n');
  const i = lineas.findIndex((l) => l.trim() === `- name: ${nombre}`);
  assert.ok(i >= 0, `el workflow no tiene el paso «${nombre}»`);
  const j = lineas.findIndex((l, k) => k > i && /^\s*run: \|\s*$/.test(l));
  const sangria = /^\s*/.exec(lineas[j + 1])[0];
  const bloque = [];
  for (let k = j + 1; k < lineas.length && (lineas[k].startsWith(sangria) || lineas[k].trim() === ''); k++) {
    bloque.push(lineas[k].slice(sangria.length));
  }
  return bloque.join('\n');
}

/**
 * bash: en Windows el del PATH puede ser el de WSL, así que se usa el de Git for Windows, que está
 * junto a git (`<Git>/mingw64/libexec/git-core` → `<Git>/bin/bash.exe`). El paso corre en
 * ubuntu-latest; en Windows se prueba igual porque es donde se escribe.
 */
function bash() {
  if (process.platform !== 'win32') return 'bash';
  const r = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
  const b = resolve(r.stdout.trim(), '..', '..', '..', 'bin', 'bash.exe');
  return existsSync(b) ? b : null;
}

const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=lock', '-c', 'user.email=lock@test', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

/** Un «remoto» local con un commit, servible por SHA como lo sirve GitHub. */
function remoto(t) {
  const d = join(temporal(t), 'Synergos.Fabrica');
  mkdirSync(d);
  git(d, 'init', '-q');
  git(d, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
  writeFileSync(join(d, 'README.md'), 'arnés\n');
  git(d, 'add', 'README.md');
  git(d, 'commit', '-q', '-m', 'uno');
  return { url: pathToFileURL(d).href, sha: git(d, 'log', '-1', '--format=%H') };
}

function correrPaso(t, lock) {
  const b = bash();
  if (!b) return t.skip('no encuentro el bash de Git for Windows');
  const consumidor = temporal(t);
  writeFileSync(join(consumidor, 'arnes.lock.json'), JSON.stringify({ arnes: lock }, null, 2));
  const destino = join(consumidor, '_arnes');
  const r = spawnSync(b, ['-c', bloqueDelPaso(PASO)], {
    cwd: consumidor,
    env: { ...process.env, ARNES_DIR: destino },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { ...r, salida: r.stdout + r.stderr, destino };
}

test('el paso: el SHA existe → verde, y deja ese commit sacado', (t) => {
  const { url, sha } = remoto(t);
  const r = correrPaso(t, { repo: url, sha });
  if (!r) return;
  assert.equal(r.status, 0, r.salida);
  assert.equal(git(r.destino, 'log', '-1', '--format=%H'), sha);
  assert.ok(existsSync(join(r.destino, 'README.md')));
});

test('el paso: el SHA del #171, que el remoto no tiene → rojo, y dice qué hacer', (t) => {
  const { url } = remoto(t);
  const r = correrPaso(t, { repo: url, sha: SHA_DEL_171 });
  if (!r) return;
  assert.equal(r.status, 1, r.salida);
  assert.match(r.salida, /no tiene el commit 5190a95/);
  assert.match(r.salida, /#171/);
  assert.match(r.salida, /git push/);
});

test('el paso: el repo no existe → rojo, y lo dice distinto de «falta el commit»', (t) => {
  const r = correrPaso(t, { repo: pathToFileURL(join(temporal(t), 'no-existe')).href, sha: SHA_DEL_171 });
  if (!r) return;
  assert.equal(r.status, 1, r.salida);
  assert.match(r.salida, /no puedo leer/);
  assert.doesNotMatch(r.salida, /#171/);
});

test('el paso: el lock fija una rama en vez de un SHA → rojo (una rama se mueve)', (t) => {
  const { url } = remoto(t);
  const r = correrPaso(t, { repo: url, sha: 'main' });
  if (!r) return;
  assert.equal(r.status, 1, r.salida);
  assert.match(r.salida, /SHA completo/);
});
