// Runs before Umami's async tracker on every page. Keep saved simulations out of page/referrer reports.
window.fsUmamiBeforeSend = function (_type, payload) {
  const clean = function (value) {
    if (!value) return value;
    try {
      const url = new URL(value, location.href);
      url.hash = '';
      url.searchParams.delete('fs_share');
      return url.origin === location.origin ? url.pathname + url.search : url.href;
    } catch {
      return undefined;
    }
  };
  return { ...payload, url: clean(payload.url), referrer: clean(payload.referrer) };
};

// A prose-page link may be activated before its module finishes loading. Preserve attribution even then.
// Keep the page/tag allowlists in sync with stage/analytics/campaign.ts (covered together by tests).
if (typeof document !== 'undefined') {
  const carry = function (event) {
    const link = event.target?.closest?.('a[href]');
    if (typeof link?.href !== 'string') return;
    const current = new URL(location.href);
    const target = new URL(link.href, current);
    const root = new URL('./', current);
    const pages = ['', 'index.html', 'about.html', 'making-of.html'].map((page) => new URL(page, root).pathname);
    if (target.origin !== current.origin || !pages.includes(target.pathname)) return;
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const value = current.searchParams.get(key);
      if (value && value.length <= 500 && !target.searchParams.has(key)) target.searchParams.set(key, value);
    }
    if (target.href !== link.href) link.href = target.href;
  };
  for (const event of ['click', 'auxclick', 'contextmenu']) document.addEventListener(event, carry, true);
}
