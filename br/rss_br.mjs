// RSS del catálogo de SonorBooks Brasil («Audiolivros grátis em português»).
// Un episodio por obra de sonorbooks.com/br/: el mismo audio CTA corto en todos, la portada de la obra (640x640)
// y el enlace a su ficha. Mismo formato que los demás países (catalogo_sonorbooks_paises.py del PC «joan»).
//
// Corre en el servidor de la web (catálogo sacado de la versión activa, sin rastrear la web):
//   node rss_br.mjs exportar   catálogo activo de /br/ -> obras.json
//   node rss_br.mjs portadas   descarga, 640x640 JPEG (sharp) y sube a R2 por tandas; reanudable
//   node rss_br.mjs feeds      rss/feed-NN.xml (4.000 episodios cada uno)
//   node rss_br.mjs subir      audio, portada del pódcast y feeds a R2
//   node rss_br.mjs verificar  feeds, portadas y audio por sus URL públicas
//   node rss_br.mjs spotify    spotify/<tema>-NNN.xml: programas de 99 episodios por tema (visto bueno de Joan 27/11)
//   node rss_br.mjs subir-spotify / verificar-spotify
//
// Claves de R2: solo en .env de esta carpeta (chmod 600), nunca en Git ni en el chat:
//   R2_ACCOUNT_ID=…  R2_ACCESS_KEY_ID=…  R2_SECRET_ACCESS_KEY=…  R2_BUCKET=…  MEDIA_BASE=https://…  FEED_BASE=https://…
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SITE = 'https://sonorbooks.com';
const PER_FEED = 4000;
const COVER = 640;
const OWNER_EMAIL = 'brasil@sonorbooks.com';
const APP = process.env.SB_APP || path.join(process.env.HOME, 'sonorbooks-rehearsal-20261023-7e1b8e4d/code-fresh-five-v7');
const T = {
  lang: 'pt-br', home: '/br/',
  title: 'Audiolivros grátis em português',
  subtitle: 'Audiolivros completos grátis em português',
  description: 'Audiolivros grátis em português: em cada episódio você encontra o link para ouvir o audiolivro completo de graça. *Sujeito a termos e condições.',
  cta: 'OUÇA O AUDIOLIVRO COMPLETO GRÁTIS AQUI 👉', terms: '*Sujeito a termos e condições.', word: 'Audiolivro',
  audio: 'cta-sonorbooks-br.mp3', cover: 'podcast-cover-audiolivros-gratis.jpg',
};

// ---------------------------------------------------------------------------------------------- utilidades
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const writeJson = (f, v) => { fs.writeFileSync(f + '.tmp', JSON.stringify(v)); fs.renameSync(f + '.tmp', f); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function env() {
  const f = path.join(HERE, '.env');
  const out = { ...process.env };
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// ---------------------------------------------------------------------------------------------- R2 (S3, SigV4)
function r2() {
  const e = env();
  for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) if (!e[k]) throw new Error(`falta ${k} en .env`);
  const host = `${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  async function put(key, body, type, cache = 'public, max-age=86400') {
    const amz = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const date = amz.slice(0, 8);
    const uri = '/' + e.R2_BUCKET + '/' + key.split('/').map(encodeURIComponent).join('/');
    const h = { 'cache-control': cache, 'content-type': type, host, 'x-amz-content-sha256': sha(body), 'x-amz-date': amz };
    const names = Object.keys(h).sort();
    const creq = ['PUT', uri, '', names.map((n) => `${n}:${h[n]}`).join('\n') + '\n', names.join(';'), h['x-amz-content-sha256']].join('\n');
    const scope = `${date}/auto/s3/aws4_request`;
    const sts = ['AWS4-HMAC-SHA256', amz, scope, sha(creq)].join('\n');
    let k = hmac('AWS4' + e.R2_SECRET_ACCESS_KEY, date); k = hmac(k, 'auto'); k = hmac(k, 's3'); k = hmac(k, 'aws4_request');
    const auth = `AWS4-HMAC-SHA256 Credential=${e.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${names.join(';')}, Signature=${hmac(k, sts).toString('hex')}`;
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`https://${host}${uri}`, { method: 'PUT', headers: { ...h, authorization: auth }, body });
        if (r.ok) return;
        throw new Error(`R2 ${r.status} ${(await r.text()).slice(0, 200)}`);
      } catch (err) { if (i >= 4) throw err; await sleep(2000 * (i + 1)); }
    }
  }
  return { put, mediaBase: e.MEDIA_BASE, feedBase: e.FEED_BASE };
}

// ---------------------------------------------------------------------------------------------- exportar
function exportar() {
  const base = path.join(APP, 'countries/br/data');
  const active = JSON.parse(fs.readFileSync(path.join(base, 'active-startup-cache.json'), 'utf8'));
  const startup = JSON.parse(fs.readFileSync(path.join(APP, 'countries/br', active.file), 'utf8'));
  const version = startup.catalogue.version;
  const catFile = fs.readdirSync(path.join(base, 'versions')).find((f) => f.startsWith(version + '-' + startup.catalogue.sha256.slice(0, 12)));
  const cat = JSON.parse(fs.readFileSync(path.join(base, 'versions', catFile), 'utf8'));
  const alias = new Set(Object.keys(cat.header?.workAliases || {}));
  const dir = path.join(base, 'versions', cat.partsDirectory);
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('books-')).sort();
  const excl = exclusiones();
  const seenTA = new Set(); const out = []; const drop = {};
  const d = (k) => { drop[k] = (drop[k] || 0) + 1; };
  for (const f of files) for (const r of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).rows) {
    if (alias.has(r.id)) { d('alias'); continue; }
    const href = `/br/audiolivro/${r.slug}/`;
    const author = r.author || (r.authors || []).join(', ');
    if (!r.title || !r.slug) { d('sin título'); continue; }
    if (excl(href, r.authors || author)) { d('excluida'); continue; }
    const ta = norm(r.title) + '|' + norm(author);
    if (author && seenTA.has(ta)) { d('misma obra (título y autor)'); continue; }
    seenTA.add(ta);
    out.push({ wid: String(r.id).split(':').pop(), href, title: String(r.title).trim(), author: String(author).trim(), cover_src: r.cover || null });
  }
  if (new Set(out.map((w) => w.wid)).size !== out.length) throw new Error('wid repetido');
  writeJson(path.join(HERE, 'obras.json'), out);
  writeJson(path.join(HERE, 'obras-resumen.json'), { version, catalogue: catFile, obras: out.length, descartadas: drop, sinPortada: out.filter((w) => !w.cover_src).length, volumenes: Math.ceil(out.length / PER_FEED) });
  log('exportar', version, out.length, 'obras', JSON.stringify(drop));
}

function exclusiones() {
  // misma lista y reglas que la web (web/exclusiones/exclusiones.json + exclusiones.mjs del repositorio central)
  const cands = [process.env.SB_EXCLUSIONES, path.join(HERE, 'exclusiones.json')].filter(Boolean);
  const f = cands.find((x) => fs.existsSync(x));
  if (!f) { log('AVISO: sin exclusiones.json; no se excluye nada'); return () => false; }
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (doc.esquema !== 'sonorbooks-exclusiones-v1') throw new Error('exclusiones.json: esquema no válido');
  const clave = (n) => (String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).sort().join(' ');
  const autores = new Set(doc.autores.flatMap((x) => x.nombres.map(clave)));
  const rutas = new Set(doc.fichas.map((x) => x.ruta));
  const SEP = /\s*[,;&/|]\s*|\s+(?:y|e|i|and|et|und|en|og|och|ja)\s+/i;
  const autorEx = (t) => { t = String(t || ''); if (!t.trim() || !autores.size) return false; const p = t.split(SEP).filter(Boolean);
    return [t, ...p, ...p.slice(0, -1).map((x, i) => x + ' ' + p[i + 1])].some((c) => autores.has(clave(c))); };
  log('exclusiones:', f, autores.size, 'autores,', rutas.size, 'fichas');
  return (href, a) => rutas.has(href) || (Array.isArray(a) ? a : [a]).some((x) => autorEx(typeof x === 'object' ? x?.name : x));
}

// ---------------------------------------------------------------------------------------------- portadas
async function portadas() {
  const require = createRequire(path.join(APP, 'release/app/package.json'));
  const sharp = require('sharp');
  sharp.concurrency(2);
  const { put } = r2();
  const obras = readJson(path.join(HERE, 'obras.json'));
  const doneF = path.join(HERE, 'portadas-subidas.json'), failF = path.join(HERE, 'portadas-fallidas.json');
  const done = new Set(readJson(doneF, [])); const failed = readJson(failF, {});
  const todo = obras.filter((w) => w.cover_src && !done.has(w.wid) && !failed[w.wid]);
  const workers = Number(process.env.WORKERS || 6);
  log(`portadas: ${obras.length} obras, ${done.size} subidas, ${Object.keys(failed).length} fallidas, ${todo.length} pendientes`);
  let i = 0, n = 0, errs = 0, lastSave = Date.now();
  async function one(w) {
    for (let t = 0; t < 3; t++) {
      try {
        const r = await fetch(w.cover_src, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; SonorBooks-catalogo/1.0)', accept: 'image/avif,image/webp,image/*,*/*;q=0.5' }, signal: AbortSignal.timeout(60000) });
        if (r.status === 404 || r.status === 410 || r.status === 403) { failed[w.wid] = `http ${r.status}`; return; }
        if (!r.ok) throw new Error(`http ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        const img = sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' });
        const meta = await img.metadata();
        if (!meta.width || Math.min(meta.width, meta.height) < 50) { failed[w.wid] = 'ilegible'; return; }
        let jpg;
        if (Math.abs(meta.width - meta.height) <= Math.max(2, 0.01 * Math.max(meta.width, meta.height))) {
          jpg = await img.resize(COVER, COVER).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
        } else { // misma regla que los demás países: centrada sobre la misma imagen difuminada
          const bg = await sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).resize(COVER, COVER, { fit: 'fill' }).blur(24).toBuffer();
          const fg = await sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).resize(COVER, COVER, { fit: 'inside' }).toBuffer();
          jpg = await sharp(bg).composite([{ input: fg, gravity: 'center' }]).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
        }
        await put(`covers/${w.wid}.jpg`, jpg, 'image/jpeg');
        done.add(w.wid); return;
      } catch (err) { if (errs++ < 20) log('  error', w.wid, String(err.message || err).slice(0, 160)); if (t === 2) { failed[w.wid] = String(err.message || err).slice(0, 120); } else await sleep(3000 * (t + 1)); }
    }
  }
  await Promise.all(Array.from({ length: workers }, async () => {
    while (i < todo.length) {
      const w = todo[i++]; await one(w); n++;
      if (Date.now() - lastSave > 30000) { lastSave = Date.now(); writeJson(doneF, [...done]); writeJson(failF, failed); log(`  ${n}/${todo.length} · subidas ${done.size} · fallidas ${Object.keys(failed).length}`); }
    }
  }));
  writeJson(doneF, [...done]); writeJson(failF, failed);
  log(`portadas: ${done.size} en R2, ${Object.keys(failed).length} fallidas (llevan la portada del pódcast)`);
}

// ---------------------------------------------------------------------------------------------- feeds
function rfc822(d) { return d.toUTCString().replace('UTC', 'GMT'); }
function feeds() {
  const e = env();
  const media = (e.MEDIA_BASE || '').replace(/\/$/, ''), feedBase = (e.FEED_BASE || '').replace(/\/$/, '');
  if (!media || !feedBase) throw new Error('faltan MEDIA_BASE y FEED_BASE en .env');
  const obras = readJson(path.join(HERE, 'obras.json'));
  const have = new Set(readJson(path.join(HERE, 'portadas-subidas.json'), []));
  const audioLen = fs.statSync(path.join(HERE, T.audio)).size;
  const seconds = Number(e.AUDIO_SECONDS || 12);
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const FP = e.FEED_PREFIX || 'rss';
  fs.mkdirSync(path.join(HERE, FP), { recursive: true });
  const report = [];
  const nFeeds = Math.ceil(obras.length / PER_FEED);
  for (let i = 0; i < nFeeds; i++) {
    const chunk = obras.slice(i * PER_FEED, (i + 1) * PER_FEED);
    const items = chunk.map((w, j) => {
      const pub = new Date(now.getTime() - j * 60000);
      const title = w.author ? `${T.word}: ${w.title} - ${w.author} ${T.word} - ${w.title} ${T.word}` : `${T.word}: ${w.title} ${T.word} - ${w.title} ${T.word}`;
      const link = SITE + w.href;
      const desc = esc(`${T.cta} <a href="${link}">${link}</a> ${T.terms}`);
      const cover = have.has(w.wid) ? `${media}/covers/${w.wid}.jpg` : `${media}/podcast-cover.jpg`;
      return '    <item>\r\n'
        + `      <title>${esc(title)}</title>\r\n`
        + `      <description>${desc}</description>\r\n`
        + `      <itunes:summary>${esc(T.cta)} ${link} ${esc(T.terms)}</itunes:summary>\r\n`
        + `      <link>${link}</link>\r\n`
        + `      <guid isPermaLink="false">sonorbooks-br:${w.wid}</guid>\r\n`
        + `      <pubDate>${rfc822(pub)}</pubDate>\r\n`
        + `      <enclosure url="${media}/audio/${T.audio}?ep=${w.wid}" type="audio/mpeg" length="${audioLen}" />\r\n`
        + `      <itunes:image href="${cover}" />\r\n`
        + `      <itunes:duration>${seconds}</itunes:duration>\r\n`
        + '      <itunes:explicit>false</itunes:explicit>\r\n'
        + '      <itunes:episodeType>full</itunes:episodeType>\r\n'
        + '    </item>\r\n';
    }).join('');
    const name = `feed-${String(i + 1).padStart(2, '0')}.xml`;
    const ftitle = `${T.title} Vol. ${String(i + 1).padStart(2, '0')}`;
    const home = SITE + T.home;
    const xml = "<?xml version='1.0' encoding='utf-8'?>\r\n"
      + '<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">\r\n  <channel>\r\n'
      + `    <title>${esc(ftitle)}</title>\r\n    <link>${home}</link>\r\n    <description>${esc(T.description)}</description>\r\n`
      + `    <itunes:subtitle>${esc(T.subtitle)}</itunes:subtitle>\r\n    <itunes:summary>${esc(T.description)}</itunes:summary>\r\n`
      + `    <lastBuildDate>${rfc822(now)}</lastBuildDate>\r\n    <language>${T.lang}</language>\r\n`
      + `    <atom:link href="${feedBase}/${name}" rel="self" type="application/rss+xml" />\r\n`
      + `    <itunes:author>${esc(T.title)}</itunes:author>\r\n    <itunes:owner>\r\n      <itunes:name>${esc(T.title)}</itunes:name>\r\n      <itunes:email>${OWNER_EMAIL}</itunes:email>\r\n    </itunes:owner>\r\n`
      + '    <itunes:category text="Arts">\r\n      <itunes:category text="Books" />\r\n    </itunes:category>\r\n'
      + '    <itunes:explicit>false</itunes:explicit>\r\n    <itunes:type>episodic</itunes:type>\r\n'
      + `    <itunes:image href="${media}/podcast-cover.jpg" />\r\n    <image>\r\n      <url>${media}/podcast-cover.jpg</url>\r\n      <title>${esc(ftitle)}</title>\r\n      <link>${home}</link>\r\n    </image>\r\n`
      + items + '  </channel>\r\n</rss>\r\n';
    fs.writeFileSync(path.join(HERE, FP, name), xml);
    report.push({ file: name, title: ftitle, episodes: chunk.length, with_cover: chunk.filter((w) => have.has(w.wid)).length,
      sha256: crypto.createHash('sha256').update(xml).digest('hex'), first: chunk[0].title, last: chunk.at(-1).title });
    log(`${name}: ${chunk.length} episodios`);
  }
  writeJson(path.join(HERE, 'feeds.json'), { generated: now.toISOString(), episodes: obras.length, with_cover: obras.filter((w) => have.has(w.wid)).length, feeds: report });
}

async function subir() {
  const { put } = r2();
  const FP = env().FEED_PREFIX || 'rss';
  await put(`audio/${T.audio}`, fs.readFileSync(path.join(HERE, T.audio)), 'audio/mpeg');
  await put('podcast-cover.jpg', fs.readFileSync(path.join(HERE, T.cover)), 'image/jpeg');
  for (const f of readJson(path.join(HERE, 'feeds.json')).feeds) {
    await put(`${FP}/${f.file}`, fs.readFileSync(path.join(HERE, FP, f.file)), 'application/rss+xml; charset=utf-8', 'public, max-age=60');
    log('subido', f.file);
  }
  await put(`${FP}/feeds.json`, fs.readFileSync(path.join(HERE, 'feeds.json')), 'application/json', 'public, max-age=60');
}

async function verificar() {
  const e = env(); const media = e.MEDIA_BASE.replace(/\/$/, ''); const FP = e.FEED_PREFIX || 'rss';
  const info = readJson(path.join(HERE, 'feeds.json'));
  const fails = [];
  const get = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'Spotify/1.0', 'cache-control': 'no-cache' } }); return { status: r.status, buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') }; };
  for (const f of info.feeds) {
    const u = `${media}/${FP}/${f.file}?v=${Date.now()}`;
    const r = await get(u);
    const sha = crypto.createHash('sha256').update(r.buf).digest('hex');
    const items = (r.buf.toString('utf8').match(/<item>/g) || []).length;
    if (r.status !== 200 || sha !== f.sha256 || items !== f.episodes) fails.push(`${f.file}: ${r.status} ${items}/${f.episodes} ${sha === f.sha256 ? '' : 'sha distinto'}`);
  }
  const have = readJson(path.join(HERE, 'portadas-subidas.json'), []);
  for (const wid of have.sort(() => Math.random() - 0.5).slice(0, 40)) {
    const r = await get(`${media}/covers/${wid}.jpg`);
    if (r.status !== 200 || r.buf[0] !== 0xff) fails.push(`portada ${wid}: ${r.status}`);
  }
  for (const u of [`${media}/audio/${T.audio}?ep=verify`, `${media}/podcast-cover.jpg`]) {
    const r = await get(u); if (r.status !== 200 || r.buf.length < 1000) fails.push(`${u}: ${r.status} ${r.buf.length}`);
  }
  const obras = readJson(path.join(HERE, 'obras.json'));
  for (const w of obras.sort(() => Math.random() - 0.5).slice(0, 20)) {
    const r = await fetch(SITE + w.href, { method: 'HEAD', redirect: 'manual' });
    if (r.status !== 200) fails.push(`ficha ${w.href}: ${r.status}`);
  }
  writeJson(path.join(HERE, 'verificacion.json'), { fecha: new Date().toISOString(), fallos: fails });
  if (fails.length) { log('FALLOS', fails.length); fails.slice(0, 30).forEach((x) => log('  ', x)); process.exitCode = 1; }
  else log(`todo verificado: ${info.feeds.length} feeds, portadas, audio y fichas`);
}

async function prueba() {
  const { put, mediaBase } = r2();
  try { await put('prueba/hola.txt', Buffer.from('hola ' + new Date().toISOString()), 'text/plain'); log('R2 put: ok'); }
  catch (err) { log('R2 put: ERROR', err.message); }
  const w = readJson(path.join(HERE, 'obras.json')).find((x) => x.cover_src);
  try { const r = await fetch(w.cover_src, { signal: AbortSignal.timeout(30000) }); log('portada', r.status, r.headers.get('content-type'), w.cover_src.slice(0, 80)); }
  catch (err) { log('portada: ERROR', err.message); }
  try { const r = await fetch(`${mediaBase}/prueba/hola.txt`); log('público', r.status, await r.text()); }
  catch (err) { log('público: ERROR', err.message); }
}

// ---------------------------------------------------------------------------------------------- spotify (programas de 99)
// Visto bueno de Joan el 27/11/2026 tras hablar con Spotify: el catálogo va a Spotify en programas de 99 episodios,
// agrupados por tema. Feeds aparte en `spotify/` (no tocan `feeds/`, que lee YouTube). Mismas portadas y audio.
const SPOTIFY_PER = 99;
const TEMAS = [ // [nombre del tema, regla sobre la categoría normalizada]; gana la primera que encaja
  ['Jornais e Revistas', /^(jornal|revistas)$/],
  ['Variados', /nao ficcao|non fiction/],
  ['Ficção e Literatura', /ficcao historica|historical fiction|ficcao biografica|fictional biograph/],
  ['Infantil e Juvenil', /child|infant|juvenil|jovens adultos|young adult|adolescent|contos de fada|fairy|amadurecimento/],
  ['Poesia', /poet|poesia|free verse/],
  ['Clássicos da Literatura', /classic|classicos|1800|literatura antiga/],
  ['Mistério, Suspense e Policial', /myster|thriller|policial|suspense|misterio|true crime|crimes reais|crime/],
  ['Fantasia e Ficção Científica', /fantas|science fiction|ficcao cientifica|distopi|dystop|cyberpunk|steampunk|opera espacial|viagem no tempo|primeiro contato|pos apocal|gaslamp|dragoes|realismo magico|historia alternativa/],
  ['Terror e Sobrenatural', /horror|terror|paranormal|gothic/],
  ['Romance', /romance|erotic|erotico/],
  ['Humor', /humor|comedy|comedia|satire|humoristico/],
  ['Educação e Aprendizagem', /educa|learning|aprendizagem|cursos|enem|provas|didatic|idiomas/],
  ['Espiritualidade e Religião', /spirit|relig|espiritual|esoter|cristian|christian|budism|ocult|metafisica|bible|biblico|isla|hindu/],
  ['Política e Sociedade', /politic|government|governo|sociais|sociolog|direito|legisla|mulheres$|lgbt|ciencias humanas|militar|guerra|ativismo/],
  ['Autoajuda e Desenvolvimento Pessoal', /self help|autoajuda|desenvolvimento pessoal|sucesso na carreira|relacionamentos/],
  ['Psicologia', /psycholog|psicolog/],
  ['Negócios e Economia', /business|negocios|empresa|gestao|lideranca|marketing|financ|dinheiro|econom|investiment|administra|organizacional/],
  ['Ciência e Tecnologia', /science|ciencia|technolog|tecnolog|comput|engenharia|exploracao espacial|natureza|nature/],
  ['Saúde e Bem-estar', /health|saude|beleza|medic|doenca|envelhecimento|preparo fisico|higiene|vicio/],
  ['Filosofia', /philosoph|filosofia/],
  ['Biografias e Memórias', /biograph|biografi|memori|celebridades|aventureiros/],
  ['História', /histor|seculo xx|americas|europa|mundo|asia|africa|russia|oriente medio|antiga/],
  ['Ficção e Literatura', /fic|literat|aventura|adventure|contos|antolog|short stor|ensaios|essays|contemporaneo|dramaturgia|plays|drama|epic|epico|sagas|faroeste/],
  ['Estilo de Vida e Lazer', /travel|viage|esporte|futebol|tenis|basquete|beisebol|comida|gastronomia|casa|arte|music|hobbies|lazer|animais|feriados|vida|jogos|veiculos|eventos|entretenimento|cultura/],
];
const slug = (s) => norm(s).replace(/ /g, '-');
function temaDe(cat) {
  const c = norm(cat);
  for (const [t, re] of TEMAS) if (re.test(c)) return t;
  return 'Variados';
}
function categorias() { // id de obra -> categoría, del mismo catálogo que `exportar`
  const base = path.join(APP, 'countries/br/data');
  const active = JSON.parse(fs.readFileSync(path.join(base, 'active-startup-cache.json'), 'utf8'));
  const startup = JSON.parse(fs.readFileSync(path.join(APP, 'countries/br', active.file), 'utf8'));
  const version = startup.catalogue.version;
  const catFile = fs.readdirSync(path.join(base, 'versions')).find((f) => f.startsWith(version + '-' + startup.catalogue.sha256.slice(0, 12)));
  const cat = JSON.parse(fs.readFileSync(path.join(base, 'versions', catFile), 'utf8'));
  const dir = path.join(base, 'versions', cat.partsDirectory);
  const m = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith('books-'))) for (const r of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).rows) m.set(String(r.id).split(':').pop(), String(r.category || ''));
  return m;
}
function spotify() {
  const e = env();
  const media = (e.MEDIA_BASE || '').replace(/\/$/, '');
  const base = (e.SPOTIFY_BASE || `${media}/spotify`).replace(/\/$/, '');
  if (!media) throw new Error('falta MEDIA_BASE en .env');
  const obras = readJson(path.join(HERE, 'obras.json'));
  const have = new Set(readJson(path.join(HERE, 'portadas-subidas.json'), []));
  const cats = categorias();
  const audioLen = fs.statSync(path.join(HERE, T.audio)).size;
  const seconds = Number(e.AUDIO_SECONDS || 12);
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const porTema = new Map();
  for (const w of obras) { const t = temaDe(cats.get(w.wid) || ''); if (!porTema.has(t)) porTema.set(t, []); porTema.get(t).push(w); }
  const coll = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
  const outDir = path.join(HERE, 'spotify'); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const home = SITE + T.home; const programas = [];
  for (const tema of [...porTema.keys()].sort(coll.compare)) {
    const lista = porTema.get(tema).sort((a, b) => coll.compare(a.title, b.title) || coll.compare(a.author, b.author) || coll.compare(a.wid, b.wid));
    const n = Math.ceil(lista.length / SPOTIFY_PER), pad = String(n).length < 2 ? 2 : String(n).length;
    for (let i = 0; i < n; i++) {
      const chunk = lista.slice(i * SPOTIFY_PER, (i + 1) * SPOTIFY_PER);
      const num = String(i + 1).padStart(pad, '0');
      const name = `${slug(tema)}-${num}.xml`;
      const ftitle = `Audiolivros grátis · ${tema} · ${num}`;
      const fdesc = `Audiolivros grátis em português: ${tema}. Em cada episódio, o link para ouvir o audiolivro completo de graça. Episódios narrados com voz sintética (IA). *Sujeito a termos e condições.`;
      const items = chunk.map((w, j) => {
        const pub = new Date(now.getTime() - j * 60000);
        const title = w.author ? `${w.title} — ${w.author}` : w.title;
        const link = SITE + w.href;
        const desc = esc(`${T.cta} <a href="${link}">${link}</a> ${T.terms} Narração com voz sintética (IA).`);
        const cover = have.has(w.wid) ? `${media}/covers/${w.wid}.jpg` : `${media}/podcast-cover.jpg`;
        return '    <item>\r\n'
          + `      <title>${esc(title)}</title>\r\n`
          + `      <description>${desc}</description>\r\n`
          + `      <itunes:summary>${esc(T.cta)} ${link} ${esc(T.terms)} Narração com voz sintética (IA).</itunes:summary>\r\n`
          + `      <link>${link}</link>\r\n`
          + `      <guid isPermaLink="false">sonorbooks-br:${w.wid}</guid>\r\n`
          + `      <pubDate>${rfc822(pub)}</pubDate>\r\n`
          + `      <enclosure url="${media}/audio/${T.audio}?ep=${w.wid}" type="audio/mpeg" length="${audioLen}" />\r\n`
          + `      <itunes:image href="${cover}" />\r\n`
          + `      <itunes:duration>${seconds}</itunes:duration>\r\n`
          + '      <itunes:explicit>false</itunes:explicit>\r\n'
          + '      <itunes:episodeType>full</itunes:episodeType>\r\n'
          + '    </item>\r\n';
      }).join('');
      const xml = "<?xml version='1.0' encoding='utf-8'?>\r\n"
        + '<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">\r\n  <channel>\r\n'
        + `    <title>${esc(ftitle)}</title>\r\n    <link>${home}</link>\r\n    <description>${esc(fdesc)}</description>\r\n`
        + `    <itunes:subtitle>${esc(`Audiolivros grátis: ${tema}`)}</itunes:subtitle>\r\n    <itunes:summary>${esc(fdesc)}</itunes:summary>\r\n`
        + `    <lastBuildDate>${rfc822(now)}</lastBuildDate>\r\n    <language>${T.lang}</language>\r\n`
        + `    <atom:link href="${base}/${name}" rel="self" type="application/rss+xml" />\r\n`
        + `    <itunes:author>${esc(T.title)}</itunes:author>\r\n    <itunes:owner>\r\n      <itunes:name>${esc(T.title)}</itunes:name>\r\n      <itunes:email>${OWNER_EMAIL}</itunes:email>\r\n    </itunes:owner>\r\n`
        + '    <itunes:category text="Arts">\r\n      <itunes:category text="Books" />\r\n    </itunes:category>\r\n'
        + '    <itunes:explicit>false</itunes:explicit>\r\n    <itunes:type>episodic</itunes:type>\r\n'
        + `    <itunes:image href="${media}/podcast-cover.jpg" />\r\n    <image>\r\n      <url>${media}/podcast-cover.jpg</url>\r\n      <title>${esc(ftitle)}</title>\r\n      <link>${home}</link>\r\n    </image>\r\n`
        + items + '  </channel>\r\n</rss>\r\n';
      fs.writeFileSync(path.join(outDir, name), xml);
      programas.push({ file: name, url: `${base}/${name}`, title: ftitle, tema, episodes: chunk.length,
        sha256: crypto.createHash('sha256').update(xml).digest('hex'), first: chunk[0].title, last: chunk.at(-1).title });
    }
  }
  const temas = {}; for (const p of programas) temas[p.tema] = (temas[p.tema] || 0) + p.episodes;
  writeJson(path.join(HERE, 'spotify.json'), { generated: now.toISOString(), episodes: obras.length, programas: programas.length, temas, feeds: programas });
  log(`spotify: ${programas.length} programas, ${obras.length} episodios`); for (const [t, k] of Object.entries(temas)) log('  ', k, t);
}
async function subirSpotify() {
  const { put } = r2();
  const info = readJson(path.join(HERE, 'spotify.json'));
  let n = 0;
  for (const f of info.feeds) { await put(`spotify/${f.file}`, fs.readFileSync(path.join(HERE, 'spotify', f.file)), 'application/rss+xml; charset=utf-8', 'public, max-age=60'); if (++n % 100 === 0) log('subidos', n); }
  await put('spotify/spotify.json', fs.readFileSync(path.join(HERE, 'spotify.json')), 'application/json', 'public, max-age=60');
  log('subidos', n, 'feeds de spotify');
}
async function verificarSpotify() {
  const info = readJson(path.join(HERE, 'spotify.json'));
  const fails = []; let ok = 0;
  for (const f of info.feeds) {
    const r = await fetch(`${f.url}?v=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
    const buf = Buffer.from(await r.arrayBuffer());
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (r.status !== 200 || sha !== f.sha256) fails.push(`${f.file}: ${r.status} ${sha === f.sha256 ? '' : 'sha distinto'}`); else ok++;
  }
  log(`spotify verificado: ${ok}/${info.feeds.length} bien`); fails.slice(0, 30).forEach((x) => log('  FALLO', x));
  if (fails.length) process.exitCode = 1;
}

const step = process.argv[2];
const steps = { exportar, portadas, feeds, subir, verificar, prueba, spotify, 'subir-spotify': subirSpotify, 'verificar-spotify': verificarSpotify };
if (!steps[step]) { console.log('uso: node rss_br.mjs exportar|portadas|feeds|subir|verificar|spotify|subir-spotify|verificar-spotify'); process.exit(2); }
await steps[step]();
