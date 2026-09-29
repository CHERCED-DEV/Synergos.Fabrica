/**
 * Tests de ESTRUCTURA del arnés — `node --test tests/estructura.test.mjs`, sin dependencias.
 *
 * Comprueban la FORMA: que cada skill cargue (su `name` es su carpeta, su `description` existe y
 * cabe en el listado), que lo que nombra exista, que los manifiestos se nombren entre sí y que el
 * medidor de los cuatro criterios del #141 dé cero. NO comprueban que lo que una skill afirma siga
 * siendo cierto en los otros dos repos más allá de eso: ése es el gate del arnés (#142). El peor
 * efecto de un CI parcial es que alguien deje de mirar confiando en él, así que se dice.
 *
 * Cada test se vio fallar: se mutó el árbol con el defecto que caza, se confirmó el rojo, y se
 * restauró el fichero tocándolo (ver el informe del #171).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = join(RAIZ, 'skills');

/** Los nombres que fija `arnes.lock.json` en Synergos.CMS y Synergos.UI (`marketplace`, `plugin`). */
const NOMBRE_DEL_LOCK = 'synergos-fabrica';

/**
 * El límite del listado de skills de Claude Code: `description` + `when_to_use` se truncan a 1 536
 * caracteres (documentación oficial de skills, «Frontmatter reference»). Lo que pase de ahí no lo
 * lee el modelo para decidir si dispara.
 */
const DESCRIPTION_MAX = 1536;
const DESCRIPTION_MIN = 50;

/**
 * Nombres `synergos-*` citados entre backticks que NO son skills, con su razón. Censo vigilado en
 * los DOS sentidos: un nombre que no es skill y no está acá rompe, y una entrada que ya nadie cita
 * también — un censo vigilado en un solo sentido queda mintiendo (#137, #142).
 */
const NO_SON_SKILLS = {
  'synergos-catalogo': 'el MCP del #143 (doc 13 §7.1), no una skill',
  'synergos-hero-banner': 'un tag de elemento de la UI, citado como ejemplo',
};

function frontmatter(texto) {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n');
  if (lineas[0] !== '---') return null;
  const campos = {};
  for (let i = 1; i < lineas.length; i++) {
    if (lineas[i] === '---') return campos;
    const m = /^([A-Za-z_-]+):\s*(.*)$/.exec(lineas[i]);
    if (m) campos[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return null;
}

const carpetasDeSkill = () =>
  readdirSync(SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

function markdownDe(dir) {
  const res = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) res.push(...markdownDe(p));
    else if (e.name.endsWith('.md')) res.push(p);
  }
  return res;
}

const leerJson = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));

// ── Cada skill carga ─────────────────────────────────────────────────────────

test('hay skills, y cada carpeta de skills/ tiene su SKILL.md con frontmatter', () => {
  const carpetas = carpetasDeSkill();
  assert.ok(carpetas.length > 0, 'skills/ está vacío: el plugin no instalaría nada');
  for (const c of carpetas) {
    const f = join(SKILLS, c, 'SKILL.md');
    assert.ok(existsSync(f), `${c}/ no tiene SKILL.md`);
    assert.ok(frontmatter(readFileSync(f, 'utf8')), `${c}/SKILL.md no abre con un frontmatter entre ---`);
  }
});

test('el name del frontmatter es el de su carpeta', () => {
  for (const c of carpetasDeSkill()) {
    const fm = frontmatter(readFileSync(join(SKILLS, c, 'SKILL.md'), 'utf8'));
    assert.equal(fm.name, c, `${c}/SKILL.md dice name: ${fm.name}`);
  }
});

test('la description no está vacía y cabe en el listado de skills', () => {
  for (const c of carpetasDeSkill()) {
    const d = frontmatter(readFileSync(join(SKILLS, c, 'SKILL.md'), 'utf8')).description ?? '';
    assert.ok(d.length >= DESCRIPTION_MIN, `${c}: description de ${d.length} caracteres — es lo único que el modelo lee para decidir si dispara`);
    assert.ok(d.length <= DESCRIPTION_MAX, `${c}: description de ${d.length} caracteres; el listado trunca en ${DESCRIPTION_MAX}`);
  }
});

// ── Lo que una skill nombra, existe ──────────────────────────────────────────

test('toda referencia a un fichero de references/ o de otra skill existe', () => {
  const faltan = [];
  for (const f of markdownDe(SKILLS)) {
    const skill = relative(SKILLS, f).split(/[\\/]/)[0];
    const texto = readFileSync(f, 'utf8');
    // `synergos-x/references/y.md` o `synergos-x/SKILL.md`: contra la carpeta de esa skill.
    for (const m of texto.matchAll(/(?<![\w/.-])(synergos-[a-z0-9-]+)\/((?:references\/)?[\w.-]+\.md)\b/g)) {
      if (!existsSync(join(SKILLS, m[1], m[2]))) faltan.push(`${relative(RAIZ, f)} → ${m[1]}/${m[2]}`);
    }
    // `references/y.md` a secas: contra la carpeta de la skill que lo nombra (#141: cms-author
    // nombraba dos que vivían en architect, y al cargar no rompe nada — el modelo no las encuentra).
    for (const m of texto.matchAll(/(?<![\w/.-])references\/([\w.-]+\.md)\b/g)) {
      if (!existsSync(join(SKILLS, skill, 'references', m[1]))) faltan.push(`${relative(RAIZ, f)} → references/${m[1]}`);
    }
  }
  assert.deepEqual(faltan, [], `referencias a ficheros que no existen:\n  ${faltan.join('\n  ')}`);
});

test('toda skill citada por su nombre existe, y el censo de los que no son skills está al día', () => {
  const carpetas = new Set(carpetasDeSkill());
  const citados = new Set();
  for (const f of markdownDe(SKILLS)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/`(synergos-[a-z0-9-]+)`/g)) citados.add(m[1]);
  }
  const huerfanos = [...citados].filter((n) => !carpetas.has(n) && !(n in NO_SON_SKILLS));
  assert.deepEqual(huerfanos, [], `se citan como skill y no hay carpeta (ni están en NO_SON_SKILLS): ${huerfanos.join(', ')}`);
  const caducados = Object.keys(NO_SON_SKILLS).filter((n) => !citados.has(n) || carpetas.has(n));
  assert.deepEqual(caducados, [], `entradas de NO_SON_SKILLS que ya no corresponden: ${caducados.join(', ')}`);
});

// ── Los manifiestos ──────────────────────────────────────────────────────────

test('los dos manifiestos son JSON válido', () => {
  for (const f of ['marketplace.json', 'plugin.json']) {
    const ruta = join(RAIZ, '.claude-plugin', f);
    assert.ok(existsSync(ruta), `falta .claude-plugin/${f}`);
    assert.doesNotThrow(() => leerJson(ruta), `.claude-plugin/${f} no es JSON válido`);
  }
});

test('el marketplace es el del lock y lista su plugin, con el mismo nombre que su plugin.json', () => {
  const mk = leerJson(join(RAIZ, '.claude-plugin', 'marketplace.json'));
  const pl = leerJson(join(RAIZ, '.claude-plugin', 'plugin.json'));
  assert.equal(mk.name, NOMBRE_DEL_LOCK, 'el nombre del marketplace no es el que fija arnes.lock.json');
  assert.ok(mk.owner?.name, 'marketplace.json sin owner.name (campo obligatorio)');
  assert.ok(Array.isArray(mk.plugins), 'marketplace.json sin plugins[]');
  const entrada = mk.plugins.find((p) => p.name === NOMBRE_DEL_LOCK);
  assert.ok(entrada, `el marketplace no lista el plugin ${NOMBRE_DEL_LOCK}`);
  assert.equal(pl.name, entrada.name, 'la entrada del marketplace y plugin.json se llaman distinto: se instala por uno y se busca por el otro');
});

test('el source del plugin apunta, dentro del repo, a una carpeta con skills/', () => {
  const mk = leerJson(join(RAIZ, '.claude-plugin', 'marketplace.json'));
  const { source } = mk.plugins.find((p) => p.name === NOMBRE_DEL_LOCK);
  assert.equal(typeof source, 'string', 'el source no es una ruta relativa');
  assert.ok(source === '.' || source.startsWith('./'), `el source «${source}» no empieza con ./`);
  assert.ok(!source.split('/').includes('..'), `el source «${source}» sale del marketplace`);
  const dir = resolve(RAIZ, source);
  assert.ok(existsSync(dir) && statSync(dir).isDirectory(), `el source «${source}» no es una carpeta`);
  const skills = join(dir, 'skills');
  assert.ok(existsSync(skills) && statSync(skills).isDirectory(), `el source «${source}» no tiene skills/`);
  const conSkill = readdirSync(skills).filter((d) => existsSync(join(skills, d, 'SKILL.md')));
  assert.ok(conSkill.length > 0, `el source «${source}» tiene skills/ pero ninguna skills/<nombre>/SKILL.md`);
});

// ── El medidor ───────────────────────────────────────────────────────────────

const medidor = (...args) =>
  spawnSync(process.execPath, [join(RAIZ, 'tools', 'criterios.mjs'), ...args], { encoding: 'utf8', cwd: RAIZ });

test('la autoprueba del medidor pasa (sus fixtures, incluidos los feos del árbol real)', () => {
  const r = medidor('--autoprueba');
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});

test('el medidor da cero en los cuatro criterios sobre skills/', () => {
  const r = medidor();
  assert.notEqual(r.status, 2, `el medidor no pudo medir (faltan los árboles):\n${r.stderr}`);
  assert.equal(r.status, 0, `el medidor encontró hallazgos:\n${r.stdout}`);
});
