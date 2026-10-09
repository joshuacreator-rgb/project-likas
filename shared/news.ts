/**
 * Vocabulary, types, and pure logic for the citizen disaster-news feed
 * (client change, backlog §24).
 *
 * NewsAPI and the YouTube Data API are consumed through the `news` tRPC
 * router (server/news.ts) because NewsAPI has no CORS support and neither
 * key belongs in the client bundle. This file carries only what both sides
 * need: the shared 5-minute refresh window, the mapped article/video
 * shapes, the English/Filipino copy, and the pure text helpers the UI
 * renders with.
 */

import type { CitizenLanguage } from "./citizen";

export const NEWS_REFRESH_MS = 5 * 60 * 1000;

export type NewsCategory = "ALL" | "FLOOD" | "EARTHQUAKE" | "TYPHOON" | "WEATHER";
export const NEWS_CATEGORIES: readonly NewsCategory[] = [
  "ALL",
  "FLOOD",
  "EARTHQUAKE",
  "TYPHOON",
  "WEATHER",
];

export type NewsArticle = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  source: string;
  publishedAt: string;
};

export type NewsVideo = {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  publishedAt: string;
};

/** What the news router returns; the reason for unavailability stays server-side. */
export type NewsFeedPayload<T> = {
  available: boolean;
  items: T[];
};

/** UI-facing projection of a payload plus the react-query lifecycle. */
export type NewsFeedState<T> =
  | { status: "loading" }
  | { status: "ready"; items: T[] }
  | { status: "unavailable" };

export function toNewsFeedState<T>(
  payload: NewsFeedPayload<T> | undefined,
  loading: boolean
): NewsFeedState<T> {
  if (!payload) return loading ? { status: "loading" } : { status: "unavailable" };
  return payload.available
    ? { status: "ready", items: payload.items }
    : { status: "unavailable" };
}

/**
 * Embedded demo-period feed (§24, approved deviation: graceful no-key
 * fallback). While the NewsAPI/YouTube keys are not yet provisioned the
 * citizen page renders this curated set instead of an empty section. The
 * dates are pinned relative to module load so the "x hours ago" labels stay
 * plausible no matter when the bundle runs. Once live keys return an actual
 * result, this fallback is ignored — no code change is needed.
 */
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const HARDCODED_NEWS_ARTICLES: readonly NewsArticle[] = [
  {
    id: "fallback-article-marikina-river",
    title:
      "Marikina River above first alarm — possible flooding in low-lying Pateros barangays",
    description:
      "Pateros MDRRMO is monitoring the Marikina River water level. Residents near San Roque, Sta. Ana, and Sto. Rosario should move valuables to higher ground and stay alert for official evacuation messages.",
    url: "https://www.pagasa.dost.gov.ph/",
    imageUrl: null,
    source: "Pateros MDRRMO",
    publishedAt: ago(35),
  },
  {
    id: "fallback-article-typhoon-checklist",
    title: "Typhoon preparation checklist: what every Pateros household should do now",
    description:
      "Secure loose roofing and outdoor items, stock drinking water and a flashlight with batteries, keep important documents in a waterproof bag, and know the quickest route to your nearest evacuation center.",
    url: "https://www.pagasa.dost.gov.ph/",
    imageUrl: null,
    source: "PAGASA Weather Advisory",
    publishedAt: ago(190),
  },
  {
    id: "fallback-article-open-centers",
    title: "Evacuation centers open across Pateros as monsoon rains continue",
    description:
      "Open centers include the Rizal Tolentino Center, Pateros Elementary School, M. L. Quezon Center, and Sta. Ana Gymnasium. Coordinate with your barangay captain before moving so occupancy stays accurate.",
    url: "https://pateros.gov.ph/",
    imageUrl: null,
    source: "Pateros MDRRMO",
    publishedAt: ago(370),
  },
] as const;

export const HARDCODED_NEWS_VIDEOS: readonly NewsVideo[] = [
  {
    id: "fallback-video-deped-typhoons",
    videoId: "IPjyCzkD8L8",
    title: "Typhoons: What to do before, during, and after",
    channel: "DepEd Philippines",
    publishedAt: ago(1_440),
  },
  {
    id: "fallback-video-untv-prepare",
    videoId: "KDZ_AfZ1hWA",
    title: "How to prepare for a typhoon",
    channel: "UNTV News",
    publishedAt: ago(2_880),
  },
  {
    id: "fallback-video-anc-pagasa",
    videoId: "NRS1Je0lu_U",
    title: "PAGASA: Typhoon enters PH, now called 'Obet'",
    channel: "ANC",
    publishedAt: ago(4_320),
  },
] as const;

/**
 * The demo-period projection: return the live feed whenever it has items,
 * otherwise render the embedded fallback so the section is never empty.
 */
export function toNewsFeedStateWithFallback<T>(
  payload: NewsFeedPayload<T> | undefined,
  loading: boolean,
  fallback: readonly T[]
): NewsFeedState<T> {
  if (!payload) return loading ? { status: "loading" } : { status: "ready", items: [...fallback] };
  if (payload.available && payload.items.length > 0) return { status: "ready", items: payload.items };
  return { status: "ready", items: [...fallback] };
}

export const newsCopy = {
  en: {
    tickerLabel: "Latest disaster updates",
    breakingPrefix: "🔴 BREAKING:",
    videosEyebrow: "DISASTER VIDEOS",
    videoSectionTitle: "Latest Disaster Videos",
    videoSectionHelp: "Video reports on disasters affecting the Philippines.",
    newsEyebrow: "LATEST NEWS",
    newsSectionTitle: "News & Updates",
    newsSectionHelp: "Disaster headlines from Philippine and international sources.",
    allCategory: "All",
    floodCategory: "Flood",
    earthquakeCategory: "Earthquake",
    typhoonCategory: "Typhoon",
    weatherCategory: "Weather",
    newsUnavailable: "News unavailable. Please try again in a few minutes.",
    noNews: "No news to show right now.",
    readMore: "Read more",
    justNow: "Just now",
    minutesAgo: (n: number) => `${n} minute${n === 1 ? "" : "s"} ago`,
    hoursAgo: (n: number) => `${n} hour${n === 1 ? "" : "s"} ago`,
    daysAgo: (n: number) => `${n} day${n === 1 ? "" : "s"} ago`,
  },
  fil: {
    tickerLabel: "Pinakabagong balita tungkol sa sakuna",
    breakingPrefix: "🔴 BREAKING:",
    videosEyebrow: "MGA VIDEO NG SAKUNA",
    videoSectionTitle: "Pinakabagong Balita sa Sakuna",
    videoSectionHelp: "Mga video report tungkol sa mga sakuna sa Pilipinas.",
    newsEyebrow: "MGA PINAKABAGONG BALITA",
    newsSectionTitle: "Mga Balita at Updates",
    newsSectionHelp: "Mga ulo ng balita tungkol sa sakuna mula sa lokal at pandaigdigang sanggunian.",
    allCategory: "Lahat",
    floodCategory: "Baha",
    earthquakeCategory: "Lindol",
    typhoonCategory: "Bagyo",
    weatherCategory: "Panahon",
    newsUnavailable: "Hindi available ang balita ngayon. Subukan muli sa ilang minuto.",
    noNews: "Walang balita na maipapakita ngayon.",
    readMore: "Magbasa pa",
    justNow: "Ngayon lang",
    minutesAgo: (n: number) => `${n} minuto ang nakalipas`,
    hoursAgo: (n: number) => `${n} oras ang nakalipas`,
    daysAgo: (n: number) => `${n} araw ang nakalipas`,
  },
} as const;

export function newsCategoryLabel(category: NewsCategory, language: CitizenLanguage): string {
  const copy = newsCopy[language];
  switch (category) {
    case "ALL":
      return copy.allCategory;
    case "FLOOD":
      return copy.floodCategory;
    case "EARTHQUAKE":
      return copy.earthquakeCategory;
    case "TYPHOON":
      return copy.typhoonCategory;
    case "WEATHER":
      return copy.weatherCategory;
  }
}

/**
 * "2 hours ago"-style label. Purely presentational: any garbage or future
 * timestamp degrades to "just now" (or an empty string when unparseable),
 * never an error.
 */
export function newsRelativeTime(iso: string, language: CitizenLanguage, nowMs = Date.now()): string {
  const publishedMs = Date.parse(iso);
  if (Number.isNaN(publishedMs)) return "";
  const copy = newsCopy[language];
  const elapsedMinutes = Math.max(0, Math.floor((nowMs - publishedMs) / 60_000));
  if (elapsedMinutes < 1) return copy.justNow;
  if (elapsedMinutes < 60) return copy.minutesAgo(elapsedMinutes);
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return copy.hoursAgo(elapsedHours);
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return copy.daysAgo(elapsedDays);
  return new Date(publishedMs).toLocaleDateString(language === "fil" ? "fil-PH" : "en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function truncateNewsText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** English and Filipino keywords used to fit a headline into a category tab. */
const CATEGORY_KEYWORDS: Record<Exclude<NewsCategory, "ALL">, readonly string[]> = {
  FLOOD: ["flood", "floods", "flooding", "baha"],
  EARTHQUAKE: ["earthquake", "quake", "aftershock", "lindol"],
  TYPHOON: ["typhoon", "storm", "cyclone", "bagyo", "bagyong"],
  WEATHER: ["weather", "forecast", "rain", "rains", "ulan", "panahon", "satellite"],
};

export function filterNewsByCategory(
  articles: readonly NewsArticle[],
  category: NewsCategory
): NewsArticle[] {
  if (category === "ALL") return [...articles];
  const needles = CATEGORY_KEYWORDS[category];
  return articles.filter(article => {
    const haystack = `${article.title} ${article.description ?? ""}`.toLowerCase();
    return needles.some(needle => haystack.includes(needle));
  });
}