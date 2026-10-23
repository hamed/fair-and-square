/** Campaign links carry public tags only. Their human-readable registry stays outside the site. */
const TAGS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export function campaignId(search: string): string | undefined {
  const id = new URLSearchParams(search).get('utm_content');
  return id && /^[a-z0-9]{8}$/.test(id) ? id : undefined;
}

/** Carry attribution only between this site's three pages; never into social/payment or simulation links. */
export function campaignLink(href: string, base: string): string {
  const current = new URL(base);
  const target = new URL(href, current);
  const root = new URL('./', current);
  const pages = ['', 'index.html', 'about.html', 'making-of.html'].map((page) => new URL(page, root).pathname);
  if (target.origin !== current.origin || !pages.includes(target.pathname)) return target.href;
  for (const key of TAGS) {
    const value = current.searchParams.get(key);
    if (value && value.length <= 500 && !target.searchParams.has(key)) target.searchParams.set(key, value);
  }
  return target.href;
}
