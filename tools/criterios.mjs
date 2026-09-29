#!/usr/bin/env node
/**
 * El medidor de los CUATRO criterios de rechazo del arnés (CHERCED-DEV/Synergos.CMS#141).
 *
 * Recorre `skills/**` y cuenta, con lista nombrada fichero:línea, lo que una skill no puede
 * tener para entrar a este repo:
 *
 *   (a) ruta de una sola máquina — nombra una unidad (`C:\`, `D:/`), un usuario
 *       (`/home/x`, `/Users/x`, `/c/Users/x`), la carpeta de memoria local de un agente, o
 *       cablea el host de desarrollo como URL. NO toda ruta absoluta: `/cdn` es un contrato
 *       (#132) y el host `synergos.local` a secas es lo que `run-dev` manda crear.
 *   (b) herramienta muerta — manda correr algo que el disco ya no tiene: la Management API
 *       de Umbraco (que en 13 contesta 404, ADR 0093) por URL, por ruta de recurso Y POR
 *       NOMBRE; NX (`nx build`, `project.json`, `nx.json`); y cualquier `npm run <script>`,
 *       `node <x>.mjs` o `dotnet … <proyecto>` que no exista en los árboles de hoy.
 *   (c) cifra cableada — afirma un número del árbol (elementos, bundles, skills, ADRs, temas,
 *       iconos, tests…) o la versión clavada de Umbraco, en vez de decir cómo consultarla.
 *   (d) `description` que contradice su cuerpo — la description AFIRMA un término que el
 *       cuerpo NIEGA (el caso `cms-author` / Management API).
 *
 * Sale 1 si algún criterio es > 0. Sale 2 si no puede medir (faltan los árboles).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE MEDIDOR APRENDIÓ A LA FUERZA, Y POR QUÉ ESTÁ ESCRITO ASÍ
 *
 * 1. Se cuenta la INSTRUCCIÓN, no la mención (#142). Una skill que explica que algo está
 *    muerto lo nombra igual que una que manda usarlo. Una mención se excusa sólo si una
 *    marca de negación o de historia la gobierna EN SU MISMA CLÁUSULA y CERCA: «no tiene
 *    Management API», «decía `C:\…`», «X → 404». Un párrafo que niega AL LADO no excusa
 *    nada: la cláusula de al lado es otra cláusula.
 * 2. Un renglón de código nunca se excusa. Un bloque de código es lo que se copia y se
 *    corre; sólo sus comentarios son prosa.
 * 3. Las marcas se buscan con frontera de palabra Unicode. El medidor anterior buscaba
 *    'era ' como subcadena y casaba dentro de «regenera», que excusaba una instrucción viva.
 * 4. La Management API se prescribía también por su NOMBRE y por sus rutas de recurso
 *    (`DELETE /document/{key}`, `/member/{key}/…`), sin la URL dentro. Medir sólo la URL
 *    daba cero con cinco prescripciones vivas (#141, tercera vuelta).
 * 5. En una tabla, la columna cuya cabecera niega («❌ Nunca») es la de lo prohibido; la de
 *    al lado es el remedio y SÍ cuenta. El remedio de una tabla «esto no se hace» apuntando
 *    a un 404 fue un caso real (`db-ops`).
 * 6. La `description` se mide como el resto del fichero, con su número de línea real: es lo
 *    único que el modelo lee para decidir si dispara.
 * 7. Una herramienta se comprueba contra el DISCO de los dos árboles, no contra una lista.
 *    Sin los árboles no se mide: se dice y se sale con 2 (lo que no se puede medir se
 *    rechaza, como `humo-conectado`).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Uso:
 *   node tools/criterios.mjs                       mide skills/ contra los árboles hermanos
 *   node tools/criterios.mjs --cms-path=RUTA --ui-path=RUTA
 *   node tools/criterios.mjs --json                el resultado entero, para un informe
 *   node tools/criterios.mjs --sin-arboles         (b) sólo con el vocabulario fijo — lo avisa
 *   node tools/criterios.mjs --autoprueba          corre el medidor contra sus propios fixtures
 *
 * Los árboles se buscan en este orden: `--cms-path=` / `--ui-path=`, `SYNERGOS_CMS_PATH` /
 * `SYNERGOS_UI_PATH` (la convención de las herramientas de los dos repos), y el clon hermano
 * (`../Synergos.CMS`, `../Synergos.UI`).
 */

import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_FABRICA = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Vocabulario ──────────────────────────────────────────────────────────────

const LETRA = '[\\p{L}\\p{N}_]';
/** Una palabra (o frase) con frontera Unicode a los dos lados. */
const palabra = (alternativas) => new RegExp(`(?<!${LETRA})(?:${alternativas})(?!${LETRA})`, 'giu');

/**
 * Marcas débiles: gobiernan sólo lo que está a ≤ 4 palabras detrás Y sin una coma en medio.
 * «NO el formato de la Management API» es una negación; «Si no existe el registry, publicá
 * en `C:\…`» no lo es — la coma cierra lo que el «no» gobernaba.
 */
const MARCAS_DEBILES = palabra('no|sin|ni');
/** Marcas fuertes: gobiernan hasta 8 palabras detrás. */
const MARCAS_FUERTES = palabra([
  'nunca', 'jamás', 'prohibid[oa]s?', 'evit[aá]r?', 'olvid[aá]r?', 'nada de',
  'en vez de', 'en lugar de', 'dej[aá] de', 'ya no',
  'dec[ií]a[n]?', 'era[n]?', 'viv[ií]a[n]?', 'se llamaba', 'antes decía', 'lleg[óo] a',
  'reemplaz[aó]', 'reemplazan', 'reemplazad[oa]s?', 'sustituy[eó]',
  'muert[oa]s?', 'obsolet[oa]s?', 'purga', 'purgad[oa]s?', 'retirad[oa]s?', 'borrad[oa]s?',
  'deprecad[oa]s?', 'legado',
].join('|'));
/** Símbolos que niegan (no llevan frontera de palabra). */
const MARCAS_SIMBOLO = /❌|✗|~~/gu;
/** Marcas que van DETRÁS de lo que niegan (≤ 6 palabras). */
const MARCAS_POSTERIORES = palabra([
  'no existe[n]?', 'ya no existe[n]?', '404', 'muert[oa]s?', 'muri[óo]', 'purgad[oa]s?',
  'desapareci[óo]', 'se borr[óo]', 'se fue(?:ron)?', 'no est[áa]n?', 'obsolet[oa]s?',
  'no responde[n]?', 'no sirve[n]?', 'no se usa[n]?', 'prohibid[oa]s?', 'no va[n]?',
  'no funciona[n]?', '(?:es|empieza en|desde) v1[4-9]\\+?', 'v1[4-9]\\+',
].join('|'));
/** Una cláusula que TERMINA en una de éstas gobierna la siguiente tras «: » (`decía: X`). */
const MARCA_FINAL_DE_CLAUSULA = palabra('dec[ií]a[n]?|era[n]?|antes|viv[ií]a|nunca|prohibido|❌');

const DIST_DEBIL = 4;
const DIST_FUERTE = 8;
const DIST_POSTERIOR = 6;

/** Cabecera de columna que declara «esto es lo prohibido». */
const CABECERA_NEGADA = /❌|✗|(?<![\p{L}])(?:nunca|no|prohibid\w*|dec[ií]a|antes|muert\w*|evit\w*|mal|incorrect\w*|deprecad\w*|viej\w*)(?![\p{L}])/iu;

// (a) rutas de una máquina
const RUTAS_DE_MAQUINA = [
  { que: 'unidad de Windows', re: /(?<![\p{L}\p{N}_])[A-Za-z]:[\\/]{1,2}(?=[\p{L}\p{N}_.$%~{-])/gu },
  { que: 'unidad en forma MSYS', re: /(?<![\p{L}\p{N}_.:/-])\/[a-zA-Z]\/(?:Users|LOCAL_CDN|Program Files|Windows)\b/g },
  { que: 'directorio de un usuario', re: /(?<![\p{L}\p{N}_.-])\/(?:home|Users)\/[A-Za-z_][\w.-]*/g },
  { que: 'memoria local de un agente', re: /~[\\/]\.claude[\\/]projects/g },
  { que: 'host de desarrollo cableado como URL', re: /https?:\/\/(?:[\w-]+\.)*synergos\.local\b(?::\d+)?/g },
];

// (b) herramientas muertas por vocabulario fijo
const HERRAMIENTAS_MUERTAS = [
  { que: 'Management API (URL)', re: /\/umbraco\/management\/api\b[^\s"'`)]*/g },
  { que: 'Management API (token)', re: /back-office\/token\b/g },
  { que: 'Management API (nombre)', re: /\bManagement[ -]API\b|\bAPI de Management\b|\bUmbraco\.Cms\.Api\.Management\b/gi },
  { que: 'Management API (recurso)', re: /\/v1\/(?:document|media|member|document-type|data-type|media-type)\b|(?:^|[\s`(])\/(?:document|member|media)\/\{[^}]+\}/g },
  { que: 'NX (comando)', re: /\bnpx\s+nx\b|(?<![\w/.-])nx\s+(?:build|serve|run|run-many|generate|g|show|affected|test|lint)\b/g },
  { que: 'NX (descriptor)', re: /\b(?:project|nx)\.json\b/g },
  { que: 'NX (nombre)', re: /(?<![\w./-])(?:Nx|NX)(?![\w-])/g },
];

// (b) invocaciones que se comprueban contra el disco
const INVOCACIONES = [
  { tipo: 'npm', re: /\bnpm\s+run(?:\s+--prefix\s+(\S+))?\s+([a-z][\w:.-]*)/g },
  { tipo: 'node', re: /\bnode\s+([^\s`"'|;)]+\.m?js)\b/g },
  { tipo: 'script', re: /(?:\bbash\s+|\bsh\s+|\bpwsh\s+(?:-File\s+)?|(?<![\w/])\.\/)((?:[\w.-]+\/)*tools\/[\w.-]+\.(?:sh|ps1))\b/g },
  { tipo: 'dotnet', re: /\bdotnet\s+(?:test|build|run(?:\s+--project)?)\s+([^\s`"'$|;]+\.(?:csproj|sln))\b/g },
];

// (c) cifras cableadas
const SUSTANTIVOS = [
  'elementos?', 'elements?', 'bundles?', 'skills?', 'ADRs?', 'temas?', 'themes?',
  'capacidades', 'endpoints?', 'claves?', 'keys', 'iconos?', 'icons?', 'stock', 'tests?',
  'gates?', 'verticales', 'contratos?', 'cat[aá]logos?', 'bloques?', 'blocks?',
  'DocTypes?', 'DataTypes?', 'ContentTypes?', 'ElementTypes?', 'content types?',
  'compositions?', 'composiciones', 'ficheros', 'archivos', 'proyectos?', 'projects?',
  'aplicativos', 'controllers?', 'seams?', 'suites?', 'dominios', 'templates?', 'specs?',
  'servicios', 'orquestadores', 'c[oó]digos de rechazo', 'rechazos', 'checks', 'chequeos',
  'comprobaciones', 'repos', 'repositorios', 'plataformas', 'frameworks', 'hostnames',
  'componentes', 'primitives', 'primitivos', 'patterns', 'tiers', 'entradas', 'tags',
  'apps', 'l[ií]neas de arn[eé]s', 'memorias', 'catalogs',
].join('|');
const NUMERO_EN_PALABRAS = 'dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte|treinta|cuarenta|cincuenta|cien';
/**
 * Un número en palabras sólo es un censo tras un determinante («SON tres repos», «LOS nueve
 * dominios»). «Dos archivos tienen el mismo Key» describe un caso, no cuenta el árbol.
 */
const DETERMINANTE = '(?<=(?:^|[\\s(—–*])(?:los|las|son|hay|en|sus|tiene|tienen|con|unos|unas)\\s+(?:\\*\\*)?)';
const COLA_DE_CIFRA = `(?:\\s+de\\s+\\d+)?(?:\\s*\\*\\*)?\\s+(?:\\*\\*)?(?:${SUSTANTIVOS})(?![\\p{L}\\p{N}_])`;
const CIFRA = new RegExp(
  `(?<![\\p{L}\\p{N}_.,#/:v-])(\\d{1,3}(?:[ .\\u00a0]\\d{3})+|\\d+)${COLA_DE_CIFRA}|${DETERMINANTE}(${NUMERO_EN_PALABRAS})${COLA_DE_CIFRA}`,
  'giu',
);
/** «exactamente dos proyectos», «al menos 50»: es una REGLA que un gate hace cumplir, no un censo. */
const REGLA_ANTES_DE_CIFRA = /(?:exactamente|como m[aá]ximo|como m[ií]nimo|al menos|a lo sumo)\s*(?:\*\*)?\s*$/iu;
const CUENTA_EN_ENCABEZADO = /^#{1,6}\s.*\((\d+)\)\s*$/u;
const VERSION_CLAVADA = /(?<![\p{N}.])\d+\.\d+\.\d+(?!\.?\p{N})/gu;
const CONTEXTO_DE_PIN = /umbraco|\bpin\b|pinned|clavad|pinead/iu;

// ── Lectura de un fichero Markdown ───────────────────────────────────────────

function frontmatter(lineas) {
  if (lineas[0] !== '---') return { campos: {}, fin: -1 };
  const campos = {};
  for (let i = 1; i < lineas.length; i++) {
    if (lineas[i] === '---') return { campos, fin: i };
    const m = /^([A-Za-z_-]+):\s*(.*)$/.exec(lineas[i]);
    if (m) {
      let valor = m[2].trim();
      if (/^(['"]).*\1$/.test(valor)) valor = valor.slice(1, -1);
      campos[m[1]] = { valor, linea: i + 1 };
    }
  }
  return { campos: {}, fin: -1 };
}

const esSeparadorDeTabla = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
/** Celdas de una fila, con su posición. Un `|` dentro de backticks o escapado no es un borde. */
function celdasDe(l) {
  const bordes = [];
  let enCodigo = false;
  for (let i = 0; i < l.length; i++) {
    if (l[i] === '\\') { i++; continue; }
    if (l[i] === '`') enCodigo = !enCodigo;
    else if (l[i] === '|' && !enCodigo) bordes.push(i);
  }
  if (bordes[0] !== l.search(/\S/)) bordes.unshift(-1);
  if (bordes[bordes.length - 1] !== l.trimEnd().length - 1) bordes.push(l.length);
  const celdas = [];
  for (let k = 0; k + 1 < bordes.length; k++) {
    const desde = bordes[k] + 1;
    celdas.push({ texto: l.slice(desde, bordes[k + 1]), desde, hasta: bordes[k + 1] });
  }
  return celdas;
}

/** Anota cada renglón con su contexto: código, comentario de código, tabla y su cabecera. */
function contextos(lineas, finFrontmatter) {
  const res = [];
  let enCodigo = false;
  let cerca = null;
  let cabecera = null;
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const ctx = { enCodigo: false, comentario: false, valla: false, frontmatter: i <= finFrontmatter, tabla: null };
    const valla = /^\s*(`{3,}|~{3,})/.exec(l);
    if (valla && !ctx.frontmatter) {
      if (!enCodigo) { enCodigo = true; cerca = valla[1][0]; }
      else if (valla[1][0] === cerca) { enCodigo = false; }
      ctx.valla = true;
      res.push(ctx);
      cabecera = null;
      continue;
    }
    if (enCodigo) {
      ctx.enCodigo = true;
      ctx.comentario = /^\s*(#(?!!)|\/\/|<!--|REM\b|::|--\s)/i.test(l);
      res.push(ctx);
      continue;
    }
    if (/^\s*\|/.test(l)) {
      if (esSeparadorDeTabla(l)) { ctx.tabla = { separador: true }; res.push(ctx); continue; }
      const siguienteEsSeparador = i + 1 < lineas.length && esSeparadorDeTabla(lineas[i + 1]);
      if (siguienteEsSeparador) {
        cabecera = celdasDe(l).map((c) => CABECERA_NEGADA.test(c.texto));
        ctx.tabla = { cabeceraDeTabla: true, negadas: cabecera };
      } else {
        ctx.tabla = { negadas: cabecera ?? [] };
      }
    } else {
      cabecera = null;
    }
    res.push(ctx);
  }
  return res;
}

// ── ¿Está gobernada por una negación? ────────────────────────────────────────

const palabrasEntre = (s) => s.replace(/[*`_]/g, ' ').trim().split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;

/** Parte un trozo de texto en cláusulas: fin de frase, raya y dos puntos. */
function clausulas(texto, base = 0) {
  const res = [];
  const sep = /(?<=[.;!?])\s+|\s+[—–]\s+|:\s+/g;
  let desde = 0;
  let m;
  while ((m = sep.exec(texto))) {
    res.push({ texto: texto.slice(desde, m.index), desde: base + desde, tras: m[0].trim() });
    desde = m.index + m[0].length;
  }
  res.push({ texto: texto.slice(desde), desde: base + desde, tras: '' });
  return res;
}

function gobernadaEnClausula(texto, ini, fin) {
  const antes = texto.slice(0, ini);
  const despues = texto.slice(fin);
  for (const [re, dist, cruzaComas] of [[MARCAS_DEBILES, DIST_DEBIL, false], [MARCAS_FUERTES, DIST_FUERTE, true]]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(antes))) {
      const entre = antes.slice(m.index + m[0].length);
      if (!cruzaComas && entre.includes(',')) continue;
      if (palabrasEntre(entre) <= dist) return true;
    }
  }
  MARCAS_SIMBOLO.lastIndex = 0;
  let s;
  while ((s = MARCAS_SIMBOLO.exec(antes))) {
    if (palabrasEntre(antes.slice(s.index + s[0].length)) <= DIST_FUERTE) return true;
  }
  if (/~~[^~]*$/.test(antes) && /^[^~]*~~/.test(despues)) return true;
  if (/«[^»]*$/.test(antes) && /^[^«]*»/.test(despues)) return true;
  MARCAS_POSTERIORES.lastIndex = 0;
  const p = MARCAS_POSTERIORES.exec(despues);
  if (p && palabrasEntre(despues.slice(0, p.index)) <= DIST_POSTERIOR) return true;
  return false;
}

/**
 * ¿La ocurrencia [ini, fin) del renglón está excusada?
 * Nunca en código. En tabla: si la cabecera de su columna niega, o si su celda la niega.
 * En prosa: si su cláusula la niega cerca, o si la cláusula anterior termina en «decía:».
 */
function excusada(linea, ini, fin, ctx) {
  if (ctx.enCodigo && !ctx.comentario) return false;
  let texto = linea;
  let base = 0;
  if (ctx.tabla && !ctx.tabla.separador) {
    const celdas = celdasDe(linea);
    const k = celdas.findIndex((c) => ini >= c.desde && ini < c.hasta);
    if (k >= 0) {
      if (ctx.tabla.negadas?.[k] && !ctx.tabla.cabeceraDeTabla) return true;
      texto = celdas[k].texto;
      base = celdas[k].desde;
    }
  }
  const cls = clausulas(texto, base);
  for (let i = 0; i < cls.length; i++) {
    const c = cls[i];
    const cFin = c.desde + c.texto.length;
    if (ini >= c.desde && ini <= cFin) {
      if (gobernadaEnClausula(c.texto, ini - c.desde, Math.min(fin, cFin) - c.desde)) return true;
      const previa = cls[i - 1];
      if (previa && previa.tras === ':') {
        const cola = previa.texto.trim().split(/\s+/).slice(-2).join(' ');
        MARCA_FINAL_DE_CLAUSULA.lastIndex = 0;
        if (MARCA_FINAL_DE_CLAUSULA.test(cola)) return true;
      }
      return false;
    }
  }
  return false;
}

// ── Los árboles, para comprobar herramientas contra el disco ─────────────────

function resolverArbol(nombre, flag, variable, argv, env) {
  const a = argv.find((x) => x.startsWith(`--${flag}=`));
  if (a) return resolve(a.slice(flag.length + 3));
  if (env[variable]) return resolve(env[variable]);
  return resolve(RAIZ_FABRICA, '..', nombre);
}

function cargarArboles(cms, ui) {
  const leerJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch { return null; } };
  const dirs = (p) => { try { return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } };
  const scripts = new Map();
  const paquete = (rel) => {
    const j = leerJson(join(ui, rel, 'package.json'));
    if (j) scripts.set(rel.replace(/\\/g, '/') || '.', new Set(Object.keys(j.scripts ?? {})));
  };
  paquete('');
  for (const p of dirs(join(ui, 'platforms'))) paquete(join('platforms', p));
  const carpetasDeTools = [join(cms, 'tools'), join(ui, 'tools'), join(RAIZ_FABRICA, 'tools')];
  for (const p of dirs(join(ui, 'platforms'))) carpetasDeTools.push(join(ui, 'platforms', p, 'tools'));
  return { cms, ui, scripts, carpetasDeTools };
}

function herramientaExiste(tipo, m, arboles) {
  if (tipo === 'npm') {
    const prefijo = m[1]?.replace(/\\/g, '/').replace(/\/$/, '');
    const script = m[2];
    if (prefijo) return arboles.scripts.get(prefijo)?.has(script) ?? false;
    for (const s of arboles.scripts.values()) if (s.has(script)) return true;
    return false;
  }
  const ruta = m[1].replace(/\\/g, '/');
  if (/[$%{<]/.test(ruta)) return true; // una variable no es una herramienta nombrada
  if (tipo === 'dotnet') {
    const sinPrefijo = ruta.replace(/^(\.\/)?Synergos\.CMS\//, '');
    return existsSync(join(arboles.cms, sinPrefijo)) || existsSync(join(arboles.cms, basename(sinPrefijo)));
  }
  const conArbol = /^(?:.*\/)?(Synergos\.(?:CMS|UI|Fabrica))\/(.+)$/.exec(ruta);
  if (conArbol) {
    const raiz = { 'Synergos.CMS': arboles.cms, 'Synergos.UI': arboles.ui, 'Synergos.Fabrica': RAIZ_FABRICA }[conArbol[1]];
    return existsSync(join(raiz, conArbol[2]));
  }
  if (/^\$\{?CLAUDE_PLUGIN_ROOT\}?\//.test(ruta)) return existsSync(join(RAIZ_FABRICA, ruta.replace(/^\$\{?CLAUDE_PLUGIN_ROOT\}?\//, '')));
  return arboles.carpetasDeTools.some((d) => existsSync(join(d, basename(ruta))));
}

// ── Medir un fichero ─────────────────────────────────────────────────────────

const recorte = (l, ini, fin) => {
  const a = Math.max(0, ini - 40);
  const b = Math.min(l.length, fin + 40);
  return (a > 0 ? '…' : '') + l.slice(a, b).trim() + (b < l.length ? '…' : '');
};

/** Términos que el cuerpo NIEGA: «no tiene **X**», «sin X», «olvidá X», «X → 404». */
function terminosNegados(lineas, ctxs) {
  const terminos = new Set();
  const tecnico = (t) => /[A-Z/.:]/.test(t) && t.length >= 3;
  const limpiar = (t) => t.replace(/[*`]/g, '').replace(/[\s(.,;:—–]+$/u, '').trim();
  const patrones = [
    /(?<![\p{L}])(?:no|NO)\s+(?:tiene|hay|existe[n]?|expone|usa[rs]?)\s+((?:\*\*|`)?[^\s(.,;:—–]+(?:\s+[^\s(.,;:—–]+){0,2}?(?:\*\*|`)?)(?=\s*(?:\*\*)?\s*[(.,;:—–]|\s*$|\s+(?:para|en|y|ni|desde)\b)/gu,
    /(?<![\p{L}])(?:sin|olvid[aá])\s+((?:\*\*|`)?[A-Z][\w.-]*(?:\s+[A-Z][\w.-]*){0,2}(?:\*\*|`)?)/gu,
    /((?:\*\*|`)?[^\s`*]+(?:\s+[^\s`*]+){0,2}(?:\*\*|`)?)\s*(?:→|->)\s*404/gu,
  ];
  lineas.forEach((l, i) => {
    if (ctxs[i].enCodigo || ctxs[i].frontmatter) return;
    for (const re of patrones) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(l))) {
        const t = limpiar(m[1]);
        if (tecnico(t)) terminos.add(t);
        // «Management API» dentro de «no tiene Management API para contenido»: también la cabeza.
        const cabeza = t.split(/\s+/).slice(0, 2).join(' ');
        if (tecnico(cabeza)) terminos.add(cabeza);
      }
    }
  });
  return [...terminos];
}

export function medirFichero(ruta, relativa, arboles) {
  const texto = readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
  const lineas = texto.split('\n');
  const fm = frontmatter(lineas);
  const ctxs = contextos(lineas, fm.fin);
  const hallazgos = [];
  // Dos patrones que casan el MISMO trozo (la URL y la ruta de recurso de una llamada, o
  // `npx nx` y `nx build`) son una sola instrucción: se cuenta una vez.
  const vistos = new Map();
  const anotar = (criterio, i, ini, fin, que) => {
    const clave = `${criterio}:${i}`;
    const tramos = vistos.get(clave) ?? [];
    if (tramos.some(([a, b]) => ini < b && fin > a)) return;
    tramos.push([ini, fin]);
    vistos.set(clave, tramos);
    hallazgos.push({ criterio, fichero: relativa, linea: i + 1, que, fragmento: recorte(lineas[i], ini, fin) });
  };

  const descLinea = fm.campos.description?.linea;
  lineas.forEach((l, i) => {
    const ctx = ctxs[i];
    if (ctx.valla || ctx.tabla?.separador) return;
    const enFrontmatter = ctx.frontmatter;
    if (enFrontmatter && i + 1 !== descLinea) return; // del frontmatter sólo cuenta la description

    for (const { que, re } of RUTAS_DE_MAQUINA) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(l))) if (!excusada(l, m.index, m.index + m[0].length, ctx)) anotar('a', i, m.index, m.index + m[0].length, que);
    }

    for (const { que, re } of HERRAMIENTAS_MUERTAS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(l))) if (!excusada(l, m.index, m.index + m[0].length, ctx)) anotar('b', i, m.index, m.index + m[0].length, que);
    }
    if (arboles) {
      for (const { tipo, re } of INVOCACIONES) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(l))) {
          if (herramientaExiste(tipo, m, arboles)) continue;
          if (excusada(l, m.index, m.index + m[0].length, ctx)) continue;
          anotar('b', i, m.index, m.index + m[0].length, `${tipo}: no existe en los árboles de hoy`);
        }
      }
    }

    CIFRA.lastIndex = 0;
    let c;
    while ((c = CIFRA.exec(l))) {
      const num = c[1] ?? c[2];
      if (/^\d+$/.test(num) && /^[.,]\d/.test(l.slice(c.index + num.length))) continue;
      if (REGLA_ANTES_DE_CIFRA.test(l.slice(0, c.index))) continue;
      if (!excusada(l, c.index, c.index + c[0].length, ctx)) anotar('c', i, c.index, c.index + c[0].length, 'cifra del árbol');
    }
    const enc = CUENTA_EN_ENCABEZADO.exec(l);
    if (enc && !ctx.enCodigo) anotar('c', i, l.lastIndexOf('('), l.length, 'cuenta en un encabezado');
    for (const cl of clausulas(l)) {
      if (!CONTEXTO_DE_PIN.test(cl.texto)) continue;
      VERSION_CLAVADA.lastIndex = 0;
      let v;
      while ((v = VERSION_CLAVADA.exec(cl.texto))) {
        const ini = cl.desde + v.index;
        if (!excusada(l, ini, ini + v[0].length, ctx)) anotar('c', i, ini, ini + v[0].length, 'versión clavada');
      }
    }
  });

  if (descLinea) {
    const desc = lineas[descLinea - 1];
    const dctx = ctxs[descLinea - 1];
    for (const termino of terminosNegados(lineas, ctxs)) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}_])${termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}_])`, 'giu');
      let m;
      while ((m = re.exec(desc))) {
        const ini = m.index;
        if (ini < desc.indexOf(':') + 1) continue; // la clave «description:» no es la description
        if (!excusada(desc, ini, ini + m[0].length, dctx)) {
          anotar('d', descLinea - 1, ini, ini + m[0].length, `la description afirma «${termino}» y el cuerpo lo niega`);
        }
      }
    }
  }
  return hallazgos;
}

// ── Recorrido ────────────────────────────────────────────────────────────────

function ficherosMarkdown(dir) {
  const res = [];
  const visitar = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) visitar(p);
      else if (e.name.toLowerCase().endsWith('.md')) res.push(p);
    }
  };
  visitar(dir);
  return res;
}

export function medir({ raiz, arboles }) {
  const dirSkills = join(raiz, 'skills');
  const hallazgos = [];
  for (const f of ficherosMarkdown(dirSkills)) {
    hallazgos.push(...medirFichero(f, relative(raiz, f).split(sep).join('/'), arboles));
  }
  const porCriterio = { a: 0, b: 0, c: 0, d: 0 };
  const porSkill = {};
  for (const h of hallazgos) {
    porCriterio[h.criterio]++;
    const skill = h.fichero.split('/')[1];
    porSkill[skill] ??= { a: 0, b: 0, c: 0, d: 0 };
    porSkill[skill][h.criterio]++;
  }
  return { hallazgos, porCriterio, porSkill };
}

const NOMBRES = {
  a: 'ruta de una sola máquina',
  b: 'herramienta muerta',
  c: 'cifra cableada',
  d: 'description que contradice su cuerpo',
};

function imprimir(r, avisos) {
  for (const k of Object.keys(NOMBRES)) {
    const lista = r.hallazgos.filter((h) => h.criterio === k);
    console.log(`\n(${k}) ${NOMBRES[k]} — ${lista.length}`);
    for (const h of lista) console.log(`  ${h.fichero}:${h.linea}  [${h.que}]  ${h.fragmento}`);
  }
  const skills = Object.keys(r.porSkill).sort();
  if (skills.length) {
    console.log('\npor skill (a b c d):');
    for (const s of skills) {
      const v = r.porSkill[s];
      console.log(`  ${s.padEnd(34)} ${v.a} ${v.b} ${v.c} ${v.d}`);
    }
  }
  for (const a of avisos) console.log(`\n⚠ ${a}`);
  const t = r.porCriterio;
  console.log(`\ncriterios: a=${t.a} b=${t.b} c=${t.c} d=${t.d} · total ${t.a + t.b + t.c + t.d}`);
}

// ── Autoprueba ───────────────────────────────────────────────────────────────
//
// Cada caso es una skill de mentira con lo que el medidor TIENE que contar. Los casos feos
// son los del árbol real: el que no se prueba contra el caso raro del repo se prueba contra
// el bonito, y pasa en verde con el defecto puesto (#142).

const CASOS = [
  { nombre: 'a-ruta-prescrita', espera: { a: 1 }, linea: 6,
    cuerpo: 'Publicá el bundle en `C:\\LOCAL_CDN\\synergos`.' },
  { nombre: 'a-contrato-no-es-maquina', espera: {},
    cuerpo: 'La imagen monta el CDN en `/cdn`, que es un contrato y no una máquina.' },
  { nombre: 'a-regenera-no-es-era', espera: { a: 1 },
    cuerpo: 'El script regenera `C:\\LOCAL_CDN\\registry.json` en cada corrida.' },
  { nombre: 'a-negada-en-su-clausula', espera: {},
    cuerpo: 'Nunca cablees `C:\\LOCAL_CDN`: la raíz la da `CDN_ROOT`.' },
  { nombre: 'a-historia-tras-dos-puntos', espera: {},
    cuerpo: 'El appsettings decía: `C:\\LOCAL_CDN\\synergos-dev.crt`.' },
  { nombre: 'a-host-y-url', espera: { a: 1 },
    cuerpo: 'Agregá `synergos.local` al fichero hosts.\n\nDespués abrí `http://synergos.local:5000/umbraco`.' },
  { nombre: 'a-usuarios', espera: { a: 3 },
    cuerpo: '```bash\ncd /c/Users/alguien/synergos\nls /home/alguien/synergos\n```\n\nLas memorias en `~/.claude/projects/x/memory/MEMORY.md`.' },
  { nombre: 'a-en-la-description', espera: { a: 1 }, linea: 3,
    description: 'Publica a C:\\LOCAL_CDN\\ para que el CMS lo sirva.', cuerpo: 'Nada más.' },
  { nombre: 'b-parrafo-que-niega-al-lado', espera: { b: 1 },
    cuerpo: 'No uses la Management API.\n\n```powershell\nInvoke-RestMethod "$base/umbraco/management/api/v1/document-type"\n```' },
  { nombre: 'b-renglon-de-al-lado', espera: { b: 1 },
    cuerpo: 'No uses la Management API.\nPara verificar, pedí `GET /umbraco/management/api/v1/document-type`.' },
  { nombre: 'b-mismo-renglon-tras-dos-puntos', espera: { b: 1 },
    cuerpo: 'No uses la Management API: pedí `GET /umbraco/management/api/v1/document-type`.' },
  { nombre: 'b-por-su-nombre', espera: { b: 1 },
    cuerpo: 'Verificá los tipos importados vía Management API.' },
  { nombre: 'b-negada-y-citada', espera: {},
    cuerpo: 'Umbraco 13 no tiene **Management API** (ADR 0093).\n\n> Acá vivía un POST a `/umbraco/management/api/v1/document`, que ya no existe.' },
  { nombre: 'b-tabla-prohibido-y-remedio', espera: { b: 1 },
    cuerpo: '| ❌ Nunca | ✅ En su lugar |\n|---|---|\n| `npx nx build x` | `npm run build:cdn` |\n\n| Acción | Alternativa |\n|---|---|\n| Borrar nodos en SQL | Usar `DELETE /document/{key}` |' },
  { nombre: 'b-contra-el-disco', espera: { b: 2 },
    cuerpo: '```bash\nnpm run release:angular\nnpm run build:cdn\nnpm run --prefix platforms/angular build\nnode tools/usync-audit.mjs\nnode tools/no-existe.mjs\n```' },
  { nombre: 'b-nx', espera: { b: 1 },
    cuerpo: 'Compilá con `npx nx build elements-x`.\n\nSin Nx desde la purga: el build es de `platforms/angular/tools/`.' },
  { nombre: 'c-cifras', espera: { c: 3 },
    cuerpo: 'El catálogo tiene 122 bundles publicados.\n\n## Primitives (31)\n\nSon tres repos.' },
  { nombre: 'c-citada-o-historica', espera: {},
    cuerpo: 'El catálogo decía 122 elementos, y la cita «122 bundles» es de otro.\n\nUn umbral de 50 no es una cifra del árbol.' },
  { nombre: 'a-no-no-cruza-la-coma', espera: { a: 1 },
    cuerpo: 'Si no hay registry, usá `C:\\LOCAL_CDN\\synergos`.' },
  // El caso real de run-dev §1C: dentro de código, «no existe» NO excusa — como prosa sí lo haría.
  { nombre: 'a-codigo-nunca-se-excusa', espera: { a: 2 },
    cuerpo: '```powershell\nif (-not (Test-Path "C:\\LOCAL_CDN")) { Write-Warning "C:\\LOCAL_CDN no existe." }\n```' },
  { nombre: 'b-negaciones-del-arbol-real', espera: {},
    cuerpo: 'El upload vía Management API NO funciona en Umbraco 13.\n\n`SetValue` recibe el valor de almacenamiento (NO el formato de la Management API).\n\nEl paquete `Umbraco.Cms.Api.Management` empieza en v14.' },
  { nombre: 'c-caso-y-regla-no-son-censo', espera: {},
    cuerpo: 'Dos archivos uSync tienen el mismo Key.\n\n`Api.X.csproj` referencia **exactamente dos** proyectos.' },
  { nombre: 'c-version-clavada', espera: { c: 1 },
    cuerpo: 'Umbraco está clavado en 13.16.2.\n\nEl pin de Umbraco decía 13.13.1 hasta el #149.\n\nPublicá la 0.1.0 del elemento.' },
  { nombre: 'd-el-caso-feo-con-negritas', espera: { b: 1, d: 1 },
    description: 'Crea contenido editorial vía Management API.',
    cuerpo: 'Umbraco 13 no tiene **Management API** (`/umbraco/management/api/*` → 404).' },
  { nombre: 'd-description-que-niega', espera: {},
    description: 'Autoría server-side. Umbraco 13 NO tiene Management API — la autoría es C#.',
    cuerpo: 'Umbraco 13 **NO tiene Management API**. La autoría es `IContentService`.' },
  { nombre: 'd-termino-no-tecnico', espera: {},
    description: 'Tiene sentido usarla al empezar.', cuerpo: 'Esto no tiene sentido sin datos.' },
];

function autoprueba() {
  const tmp = mkdtempSync(join(tmpdir(), 'criterios-'));
  try {
    const cms = join(tmp, 'Synergos.CMS');
    const ui = join(tmp, 'Synergos.UI');
    mkdirSync(join(cms, 'tools'), { recursive: true });
    writeFileSync(join(cms, 'tools', 'usync-audit.mjs'), '');
    mkdirSync(join(ui, 'tools'), { recursive: true });
    mkdirSync(join(ui, 'platforms', 'angular', 'tools'), { recursive: true });
    writeFileSync(join(ui, 'package.json'), JSON.stringify({ scripts: { 'build:cdn': 'x', 'build:runtime': 'x' } }));
    writeFileSync(join(ui, 'platforms', 'angular', 'package.json'), JSON.stringify({ scripts: { build: 'x' } }));
    const raiz = join(tmp, 'fabrica');
    for (const c of CASOS) {
      const d = join(raiz, 'skills', c.nombre);
      mkdirSync(d, { recursive: true });
      const desc = c.description ?? `Caso de autoprueba ${c.nombre}.`;
      writeFileSync(join(d, 'SKILL.md'), `---\nname: ${c.nombre}\ndescription: ${desc}\n---\n\n${c.cuerpo}\n`);
    }
    const r = medir({ raiz, arboles: cargarArboles(cms, ui) });
    let fallos = 0;
    for (const c of CASOS) {
      const obtenido = r.porSkill[c.nombre] ?? { a: 0, b: 0, c: 0, d: 0 };
      const esperado = { a: 0, b: 0, c: 0, d: 0, ...c.espera };
      let ok = Object.keys(esperado).every((k) => obtenido[k] === esperado[k]);
      if (ok && c.linea) ok = r.hallazgos.some((h) => h.fichero.includes(`/${c.nombre}/`) && h.linea === c.linea);
      const fmt = (v) => `a=${v.a} b=${v.b} c=${v.c} d=${v.d}`;
      console.log(`${ok ? '✓' : '✗'} ${c.nombre.padEnd(34)} espera ${fmt(esperado)}${ok ? '' : `  obtuvo ${fmt(obtenido)}`}`);
      if (!ok) {
        fallos++;
        for (const h of r.hallazgos.filter((x) => x.fichero.includes(`/${c.nombre}/`))) {
          console.log(`      (${h.criterio}) línea ${h.linea} [${h.que}] ${h.fragmento}`);
        }
      }
    }
    console.log(`\nautoprueba: ${CASOS.length - fallos} de ${CASOS.length} casos en verde`);
    return fallos === 0 ? 0 : 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ── Principal ────────────────────────────────────────────────────────────────

function principal(argv, env) {
  if (argv.includes('--autoprueba')) return autoprueba();
  const avisos = [];
  let arboles = null;
  if (argv.includes('--sin-arboles')) {
    avisos.push('--sin-arboles: el criterio (b) sólo miró el vocabulario fijo; npm/node/dotnet NO se comprobaron contra el disco.');
  } else {
    const cms = resolverArbol('Synergos.CMS', 'cms-path', 'SYNERGOS_CMS_PATH', argv, env);
    const ui = resolverArbol('Synergos.UI', 'ui-path', 'SYNERGOS_UI_PATH', argv, env);
    const faltan = [[cms, 'tools'], [ui, 'package.json']].filter(([r, x]) => !existsSync(join(r, x))).map(([r]) => r);
    if (faltan.length) {
      console.error(`[criterios] no puedo medir el criterio (b) sin los dos árboles. No encontré: ${faltan.join(', ')}`);
      console.error('[criterios] Apuntalos con --cms-path=RUTA --ui-path=RUTA, con SYNERGOS_CMS_PATH / SYNERGOS_UI_PATH,');
      console.error('[criterios] o cloná los repos como hermanos. --sin-arboles mide sin ellos, y lo dice.');
      return 2;
    }
    arboles = cargarArboles(cms, ui);
  }
  const r = medir({ raiz: RAIZ_FABRICA, arboles });
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ...r, avisos, arboles: arboles ? { cms: arboles.cms, ui: arboles.ui } : null }, null, 2));
  } else {
    imprimir(r, avisos);
  }
  const t = r.porCriterio;
  return t.a + t.b + t.c + t.d > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal(process.argv.slice(2), process.env);
}
