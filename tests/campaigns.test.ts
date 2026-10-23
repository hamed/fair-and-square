import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { campaignId, campaignLink } from '../stage/analytics/campaign.ts';
import { sharedUrl } from '../stage/analytics.ts';

describe('campaign attribution', () => {
  const landing = 'https://example.com/fair/?utm_source=telegram&utm_medium=messaging&utm_campaign=launch&utm_content=k7m2q9vd#n=16';

  it('recognises opaque IDs without treating free-form content labels as registry IDs', () => {
    expect(campaignId(new URL(landing).search)).toBe('k7m2q9vd');
    expect(campaignId('?utm_content=cafe-a-flyer')).toBeUndefined();
    expect(campaignId('?utm_content=K7m2q9vd')).toBeUndefined();
    expect(campaignId('')).toBeUndefined();
  });

  it('carries all tags through About, Making Of and back, preserving anchors and existing queries', () => {
    const about = campaignLink('./about.html#elsewhere', landing);
    expect(new URL(about).hash).toBe('#elsewhere');
    const making = campaignLink('making-of.html?view=essay', about);
    const back = campaignLink('./', making);
    for (const url of [about, making, back]) {
      for (const [key, value] of new URL(landing).searchParams) expect(new URL(url).searchParams.get(key)).toBe(value);
      expect(new URL(url).hash).not.toContain('n=');
    }
    expect(new URL(making).searchParams.get('view')).toBe('essay');
  });

  it('does not overwrite explicit attribution, change external links, or cross into another project', () => {
    expect(new URL(campaignLink('about.html?utm_content=p4r8w6ab', landing)).searchParams.get('utm_content')).toBe('p4r8w6ab');
    for (const href of ['https://x.com/allaei', 'https://paypal.me/example', 'https://example.com/other/about.html', 'https://example.com/fair/document.pdf'])
      expect(campaignLink(href, landing)).toBe(href);
  });

  it('never carries replay contents, developer flags or fs_share, and gives newly shared links fresh attribution', () => {
    const url = new URL(campaignLink('about.html', landing.replace('#n=16', '&fs_share=yard&console=1#p=secret')));
    expect(url.searchParams.has('fs_share')).toBe(false);
    expect(url.searchParams.has('console')).toBe(false);
    expect(url.hash).toBe('');
    const shared = new URL(sharedUrl(landing, '#n=16', 'yard'));
    expect(shared.search).toBe('?fs_share=yard');
    expect(shared.hash).toBe('#n=16');
  });

  it('preserves attribution for early clicks, middle clicks and copied links before page modules load', () => {
    const handlers = new Map<string, (event: unknown) => void>();
    const document = { addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler) };
    runInNewContext(readFileSync('public/analytics-init.js', 'utf8'), { window: {}, document, location: new URL(landing), URL });
    for (const name of ['click', 'auxclick', 'contextmenu']) {
      for (const href of ['./about.html#elsewhere', 'making-of.html?view=essay', './', 'https://paypal.me/example', '/other/about.html']) {
        const link = { href: new URL(href, landing).href };
        handlers.get(name)!({ target: { closest: () => link } });
        expect(link.href).toBe(campaignLink(href, landing));
      }
    }
  });
});

describe('the private campaign CLI', () => {
  const directories: string[] = [];
  const script = fileURLToPath(new URL('../scripts/campaigns.mjs', import.meta.url));
  function workspace() {
    const dir = mkdtempSync(join(tmpdir(), 'fns-campaign-test-'));
    directories.push(dir);
    const path = join(dir, 'campaigns.private.json');
    const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args, '--registry', path], { encoding: 'utf8' });
    const read = () => JSON.parse(readFileSync(path, 'utf8'));
    const add = (...args: string[]) => run('add', ...args);
    return { dir, path, run, read, add };
  }
  afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

  it('initialises a private registry, preserves existing entries, and generates unique eight-character IDs', () => {
    const { path, run, read, add } = workspace();
    expect(run('init').status).toBe(0);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(add('--count', '200').status).toBe(0);
    const before = read();
    expect(before.entries).toHaveLength(200);
    expect(new Set(before.entries.map((e: { id: string }) => e.id)).size).toBe(200);
    for (const entry of before.entries) expect(entry.id).toMatch(/^[a-z0-9]{8}$/);
    const first = JSON.parse(run('show', before.entries[0].id).stdout);
    expect(first.destination).toBe(`https://hamed.github.io/fair-and-square/?utm_content=${first.id}`);
    expect(first).not.toHaveProperty('short_url');
    expect(add().status).toBe(0);
    expect(read().entries.slice(0, 200)).toEqual(before.entries);
    expect(read().entries).toHaveLength(201);
    expect(run('init').status).toBe(0);
    expect(read().entries).toHaveLength(201);
  });

  it('builds directly usable links without changing their simulation fragment or exposing placement details', () => {
    const { run, read, add } = workspace();
    expect(add('--url', 'https://example.com/fair/?existing=1&utm_source=private-platform&utm_campaign=private-campaign#n=16&seed=5').status).toBe(0);
    const entry = read().entries[0];
    const shown = run('show', entry.id);
    expect(shown.status).toBe(0);
    const destination = new URL(JSON.parse(shown.stdout).destination);
    expect(destination.hash).toBe('#n=16&seed=5');
    expect(destination.searchParams.get('existing')).toBe('1');
    expect(destination.searchParams.get('utm_content')).toBe(entry.id);
    expect(destination.searchParams.get('utm_source')).toBeNull();
    expect(destination.searchParams.get('utm_campaign')).toBeNull();
    expect(read().entries[0]).not.toHaveProperty('label');
    expect(run('list').stdout).toContain(entry.id);
    expect(run('list').stdout).toContain('https://example.com/fair/');
  });

  it('refuses registry and export paths inside the checkout, including symlinks', () => {
    const { dir, run, add } = workspace();
    const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
    const bad = spawnSync(process.execPath, [script, 'init', '--registry', join(publicDir, 'campaigns.private.json')], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('outside the repository');
    expect(existsSync(join(publicDir, 'campaigns.private.json'))).toBe(false);
    symlinkSync(publicDir, join(dir, 'public-link'));
    const symlinked = spawnSync(process.execPath, [script, 'init', '--registry', join(dir, 'public-link', 'campaigns.private.json')], { encoding: 'utf8' });
    expect(symlinked.status).toBe(1);
    expect(symlinked.stderr).toContain('symlink into the repository');
    expect(add().status).toBe(0);
    expect(run('export', '--out', join(publicDir, 'campaigns.private.csv')).status).toBe(1);
  });

  it('exports a private, spreadsheet-safe CSV without overwriting the registry or previous exports', () => {
    const { dir, path, run, add } = workspace();
    expect(add('--label', '=HYPERLINK("https://example.com")').status).toBe(0);
    expect(run('export', '--out', path).status).toBe(1);
    expect(run('export').status).toBe(0);
    const csvPath = join(dir, 'campaigns.private.csv');
    const csv = readFileSync(csvPath, 'utf8');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
    expect(statSync(csvPath).mode & 0o777).toBe(0o600);
    expect(run('export').status).toBe(1);
    expect(readFileSync(csvPath, 'utf8')).toBe(csv);
  });

  it('rejects invalid inputs and concurrent changes without modifying existing data', () => {
    const { path, add } = workspace();
    expect(add().status).toBe(0);
    const before = readFileSync(path, 'utf8');
    for (const options of [['--count', '0'], ['--count', '1.2'], ['--label', ''], ['--url', 'javascript:alert(1)']])
      expect(add(...options).status).toBe(1);
    writeFileSync(path + '.lock', '');
    expect(add().stderr).toContain('Another campaign command');
    expect(readFileSync(path, 'utf8')).toBe(before);
  });
});
