/** Local campaign registry. Never imported by the site or used by the public build. */
import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const DEFAULT_REGISTRY = join(homedir(), '.local', 'share', 'fair-and-square', 'campaigns.private.json');
const DESTINATION = 'https://hamed.github.io/fair-and-square/';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const HELP = `Private campaign links (registry is stored outside GitHub)

  npm run campaign -- init
  npm run campaign -- add                  Create an ID-only link
  npm run campaign -- add --count 20       Create IDs for 20 individual copies
  npm run campaign -- list                 Look up your placements
  npm run campaign -- show ID              Show a placement and its tagged destination
  npm run campaign -- export               Write a private CSV beside the registry

add options: --label (optional, private), --url, --count
All commands accept --registry /absolute/path/outside/the/repository.
export accepts --out /absolute/path/outside/the/repository.

Registry: ${DEFAULT_REGISTRY}
Links use your own website directly and are ready for posts or QR codes.
`;

function inside(path, root) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..' + '/') && rel !== '..' && !isAbsolute(rel));
}

/** Reject repository paths, public assets, and symlinks back into the checkout. */
function privatePath(input) {
  const path = resolve(input);
  if (inside(path, ROOT)) throw new Error('Private campaign data must be stored outside the repository.');
  let parent = path;
  while (!existsSync(parent)) parent = dirname(parent);
  if (inside(realpathSync(parent), ROOT)) throw new Error('Private campaign data cannot use a symlink into the repository.');
  if (existsSync(path) && (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()))
    throw new Error('The private file must be a regular file, not a symlink.');
  return path;
}

function readRegistry(path) {
  if (!existsSync(path)) return { version: 1, entries: [] };
  const registry = JSON.parse(readFileSync(path, 'utf8'));
  if (registry.version !== 1 || !Array.isArray(registry.entries) ||
      registry.entries.some((entry) => !entry || !/^[a-z0-9]{8}$/.test(entry.id)) ||
      new Set(registry.entries.map((entry) => entry.id)).size !== registry.entries.length)
    throw new Error('Invalid campaign registry; existing data was left unchanged.');
  return registry;
}

function updateRegistry(path, change) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const lock = path + '.lock';
  let fd;
  try { fd = openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another campaign command is using this registry (.lock exists).');
    throw error;
  }
  const temp = path + '.' + randomUUID() + '.tmp';
  try {
    const registry = readRegistry(path);
    const result = change(registry);
    writeFileSync(temp, JSON.stringify(registry, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    renameSync(temp, path);
    return result;
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
    closeSync(fd);
    unlinkSync(lock);
  }
}

function newId(used) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const id = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    if (!used.has(id)) { used.add(id); return id; }
  }
  throw new Error('Could not generate an unused ID.');
}

function webUrl(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) URL without embedded credentials.');
  return url;
}

function destinationOf(entry) {
  const url = webUrl(entry.destination);
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term']) url.searchParams.delete(key);
  url.searchParams.set('utm_content', entry.id);
  return url.href;
}

function rowOf(entry) {
  return { id: entry.id, label: entry.label ?? '',
    destination: destinationOf(entry), created: entry.created };
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, registry: { type: 'string' }, label: { type: 'string' },
    url: { type: 'string' }, count: { type: 'string' }, out: { type: 'string' },
  } });
  const [command, id] = positionals;
  if (values.help || !command) { console.log(HELP); return; }
  const path = privatePath(values.registry ?? DEFAULT_REGISTRY);
  if (command === 'init') {
    updateRegistry(path, () => {});
    console.log(`Private registry ready: ${path}`);
  } else if (command === 'add') {
    const count = Number(values.count ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('--count must be an integer from 1 to 1000.');
    if (values.label !== undefined && (!values.label.trim() || values.label.length > 500)) throw new Error('Private labels must be 1–500 characters.');
    const info = { destination: webUrl(values.url ?? DESTINATION).href, ...(values.label ? { label: values.label.trim() } : {}) };
    const added = updateRegistry(path, (registry) => {
      const used = new Set(registry.entries.map((entry) => entry.id));
      const entries = Array.from({ length: count }, (_, i) => ({ ...info, id: newId(used),
        ...(info.label && count > 1 ? { label: `${info.label} · copy ${i + 1}` } : {}),
        ...(count > 1 ? { copy: i + 1 } : {}), created: new Date().toISOString() }));
      registry.entries.push(...entries);
      return entries;
    });
    for (const entry of added) console.log(JSON.stringify(rowOf(entry)));
    console.log(`Saved privately in ${path}\nUse the destination URL directly in your post or QR code.`);
  } else if (command === 'list') {
    console.table(readRegistry(path).entries.map((entry) => ({ id: entry.id, label: entry.label ?? '', copy: entry.copy ?? '', destination: destinationOf(entry) })));
    console.log(`Private registry: ${path}`);
  } else if (command === 'show') {
    const registry = readRegistry(path);
    const entry = registry.entries.find((entry) => entry.id === id);
    if (!entry) throw new Error('ID not found in the private registry.');
    console.log(JSON.stringify(rowOf(entry), null, 2));
  } else if (command === 'export') {
    const out = privatePath(values.out ?? join(dirname(path), 'campaigns.private.csv'));
    if (out === path) throw new Error('CSV export cannot overwrite the registry.');
    const rows = readRegistry(path).entries.map(rowOf);
    const columns = ['id', 'label', 'destination', 'created'];
    // Prevent spreadsheet formulas in private labels/URLs when opening CSV in Excel or Sheets.
    const csv = (value) => '"' + (/^[=+@\-\t\r\n]/.test(String(value)) ? "'" : '') + String(value).replaceAll('"', '""') + '"';
    const content = [columns, ...rows.map((row) => columns.map((key) => row[key]))].map((row) => row.map(csv).join(',')).join('\r\n') + '\r\n';
    mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
    // Explicit output files are exclusive: do not silently overwrite a user's spreadsheet.
    writeFileSync(out, content, { mode: 0o600, flag: 'wx' });
    console.log(`Private CSV exported: ${out}`);
  } else throw new Error('Unknown command. Run npm run campaign -- --help.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
