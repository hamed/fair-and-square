/** Small, non-blocking event client shared by the stage and the two prose pages. */
import { campaignId, campaignLink } from './analytics/campaign.ts';

export type AnalyticsData = Record<string, string | number | boolean>;
export type AnalyticsEvent =
  | 'entry_choice' | 'navigation' | 'learn_start' | 'learn_progress' | 'learn_choice_shown'
  | 'learn_choice' | 'learn_action' | 'learn_complete' | 'about_click' | 'share'
  | 'shared_link_open' | 'play_engaged' | 'build_edited' | 'model_selected';
export type ShareSource = 'yard' | 'square' | 'embed';
interface Tracker { track(name: string, data: AnalyticsData): unknown }
declare global {
  interface Window {
    umami?: Tracker;
    fsUmamiBeforeSend?: (type: string, payload: Record<string, unknown>) => Record<string, unknown>;
  }
}

/** Bounded memory only; a failed/blocked tracker never interferes with the site. */
export function createEventClient(resolve: () => Tracker | undefined) {
  const pending: { name: AnalyticsEvent; data: AnalyticsData }[] = [];
  let stopped = false;
  const send = (tracker: Tracker, name: AnalyticsEvent, data: AnalyticsData) => {
    try { void Promise.resolve(tracker.track(name, data)).catch(() => {}); } catch { /* analytics is optional */ }
  };
  const flush = () => {
    const tracker = resolve();
    if (!tracker) return;
    for (const event of pending.splice(0)) send(tracker, event.name, event.data);
  };
  return {
    track(name: AnalyticsEvent, data: AnalyticsData) {
      if (stopped) return;
      const tracker = resolve();
      if (tracker) { flush(); send(tracker, name, data); }
      else if (pending.length < 100) pending.push({ name, data: { ...data } });
    },
    flush,
    stop() { stopped = true; pending.length = 0; },
  };
}

const client = createEventClient(() => typeof window === 'undefined' ? undefined : window.umami);
const once = new Set<AnalyticsEvent>();
if (typeof document !== 'undefined') {
  const script = document.querySelector('script[data-website-id]');
  script?.addEventListener('load', client.flush, { once: true });
  script?.addEventListener('error', client.stop, { once: true });
}

export function pageName(): string {
  if (typeof location === 'undefined') return 'main';
  return location.pathname.endsWith('making-of.html') ? 'making_of' : location.pathname.endsWith('about.html') ? 'about' : 'main';
}

export function track(name: AnalyticsEvent, data: AnalyticsData = {}): void {
  if (typeof window === 'undefined') return;
  const clean: AnalyticsData = { page: pageName() };
  const campaign = typeof location === 'undefined' ? undefined : campaignId(location.search);
  if (campaign) clean.campaign_id = campaign;
  for (const [key, value] of Object.entries(data).slice(0, 50 - Object.keys(clean).length)) {
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    clean[key] = typeof value === 'string' ? value.slice(0, 500) : value;
  }
  client.track(name, clean);
}

export function trackOnce(name: AnalyticsEvent, data: AnalyticsData = {}): void {
  if (once.has(name)) return;
  once.add(name);
  track(name, data);
}

/** Explicit labels avoid collecting arbitrary link URLs or free-form text. */
export function initAnalyticsLinks(onNavigate?: (destination: string) => boolean): void {
  const targets: Record<string, [string, string]> = {
    'x.com': ['x', 'social'], 'www.linkedin.com': ['linkedin', 'social'],
    'www.instagram.com': ['instagram', 'social'], 'www.tiktok.com': ['tiktok', 'social'],
    'www.youtube.com': ['youtube', 'social'], 'github.com': ['github', 'social'],
    'a.co': ['amazon_books', 'books'], 'bookshop.org': ['bookshop', 'books'],
    'ko-fi.com': ['kofi', 'payment'], 'paypal.me': ['paypal', 'payment'],
    'arxiv.org': ['arxiv', 'research'], 'doi.org': ['doi', 'research'],
  };
  for (const el of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const attributed = campaignLink(el.href, location.href);
    if (attributed !== el.href) el.href = attributed;
    const url = new URL(el.href);
    const target = targets[url.hostname];
    if (target) { el.dataset.trackTarget = target[0]; el.dataset.trackCategory = target[1]; }
    else if (url.origin === location.origin) {
      const destination = url.pathname.endsWith('about.html') ? (url.hash === '#elsewhere' ? 'about_socials' : 'about') : url.pathname.endsWith('making-of.html') ? 'making_of' : /\/(index\.html)?$/.test(url.pathname) ? 'play' : '';
      if (destination) el.dataset.trackNav = destination;
    }
    el.dataset.trackSource ??= el.closest('[id]')?.id ?? 'link';
  }
  const activate = (event: MouseEvent) => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const el = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-track-nav], [data-track-target]') : null;
    if (!el || el.getAttribute('aria-disabled') === 'true' || (el instanceof HTMLButtonElement && el.disabled)) return;
    if (event.type === 'auxclick' && !(el instanceof HTMLAnchorElement && el.hasAttribute('href'))) return;
    if (el.dataset.trackNav) {
      if (onNavigate?.(el.dataset.trackNav)) return;
      track('navigation', { destination: el.dataset.trackNav, source: el.dataset.trackSource ?? 'link' });
    } else if (el.dataset.trackTarget) {
      track('about_click', { destination: el.dataset.trackTarget, category: el.dataset.trackCategory ?? 'research' });
    }
  };
  document.addEventListener('click', activate, true);
  document.addEventListener('auxclick', activate, true);
}

/** The simulation fragment is unchanged; attribution is a small, separate query parameter. */
export function sharedUrl(base: string, hash: string, source: ShareSource): string {
  const url = new URL(base);
  url.search = '';
  url.searchParams.set('fs_share', source);
  url.hash = hash;
  return url.href;
}

export function incomingShareSource(search: string): ShareSource | 'unknown' {
  const source = new URLSearchParams(search).get('fs_share');
  return source === 'yard' || source === 'square' || source === 'embed' ? source : 'unknown';
}
