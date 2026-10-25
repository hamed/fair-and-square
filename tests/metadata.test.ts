// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = 'https://hamed.github.io/fair-and-square/';
const personId = `${root}about.html#person`;
const gameId = `${root}#game`;
const pngSize = (file: string) => {
  const data = readFileSync(resolve('public', file));
  expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(data.subarray(12, 16).toString()).toBe('IHDR');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
};

describe('initial HTML sharing and search metadata', () => {
  for (const [file, path, type] of [
    ['index.html', '', 'website'],
    ['about.html', 'about.html', 'profile'],
    ['making-of.html', 'making-of.html', 'article'],
  ]) {
    it(`${file} has one consistent, crawlable metadata set`, () => {
      const doc = new DOMParser().parseFromString(readFileSync(resolve(file), 'utf8'), 'text/html');
      const one = (selector: string, attribute: string) => {
        const matches = doc.head.querySelectorAll(selector);
        expect(matches, selector).toHaveLength(1);
        const value = matches[0].getAttribute(attribute);
        expect(value, selector).toBeTruthy();
        return value!;
      };
      const meta = (name: string, property = false) => one(`meta[${property ? 'property' : 'name'}="${name}"]`, 'content');
      expect(doc.head.querySelectorAll('title')).toHaveLength(1);
      const title = doc.title;
      const description = meta('description');
      expect(title).toContain('Fair and Square');
      expect(meta('og:title', true)).toBe(title);
      expect(meta('twitter:title')).toBe(title);
      expect(meta('og:description', true)).toBe(description);
      expect(meta('twitter:description')).toBe(description);
      expect(one('link[rel="canonical"]', 'href')).toBe(`${root}${path}`);
      expect(meta('og:url', true)).toBe(`${root}${path}`);
      expect(meta('og:type', true)).toBe(type);
      expect(meta('og:site_name', true)).toBe('Fair and Square');
      expect(meta('author')).toBe('Hamed Seyed-Allaei');
      expect(meta('robots')).toContain('max-image-preview:large');
      expect(meta('twitter:card')).toBe('summary_large_image');
      expect(meta('twitter:creator')).toBe('@allaei');
      expect(meta('og:image', true)).toBe(`${root}social-preview.png`);
      expect(meta('twitter:image')).toBe(meta('og:image', true));
      expect(meta('twitter:image:alt')).toBe(meta('og:image:alt', true));
      expect(meta('og:image:width', true)).toBe('1200');
      expect(meta('og:image:height', true)).toBe('630');
      expect(meta('og:image:type', true)).toBe('image/png');
      expect(one('link[rel="icon"]', 'href')).toBe(`${root}favicon.png`);
      expect(one('link[rel="apple-touch-icon"]', 'href')).toBe(`${root}apple-touch-icon.png`);

      const scripts = doc.head.querySelectorAll('script[type="application/ld+json"]');
      expect(scripts).toHaveLength(1);
      const data = JSON.parse(scripts[0].textContent!);
      expect(data['@context']).toBe('https://schema.org');
      const graph = data['@graph'] as Record<string, any>[];
      expect(Array.isArray(graph)).toBe(true);
      const findType = (type: string) => graph.find((node) => [node['@type']].flat().includes(type));
      const person = findType('Person');
      expect(person).toMatchObject({ '@id': personId, name: 'Hamed Seyed-Allaei', url: `${root}about.html` });
      if (file === 'index.html') {
        expect(findType('VideoGame')).toMatchObject({ '@id': gameId, name: 'Fair and Square', author: { '@id': personId } });
      } else if (file === 'about.html') {
        expect(findType('ProfilePage')).toMatchObject({ url: `${root}${path}`, mainEntity: { '@id': personId } });
      } else {
        expect(findType('Article')).toMatchObject({ url: `${root}${path}`, author: { '@id': personId }, about: { '@id': gameId } });
      }
      for (const node of graph) {
        for (const key of ['datePublished', 'dateModified', 'aggregateRating', 'review', 'offers', 'license']) expect(node).not.toHaveProperty(key);
      }
    });
  }

  it('ships correctly sized PNG preview and branding assets', () => {
    expect(pngSize('social-preview.png')).toEqual([1200, 630]);
    expect(pngSize('favicon.png')).toEqual([32, 32]);
    expect(pngSize('apple-touch-icon.png')).toEqual([180, 180]);
    expect(readFileSync(resolve('public/social-preview.png')).length).toBeLessThan(500_000);
  });
});
