/**
 * Citizen disaster-news proxy (client change, backlog §24).
 *
 * NewsAPI does not send CORS headers, so a browser cannot call it directly,
 * and API keys must never ship in the client bundle. This router fetches
 * NewsAPI and the YouTube Data API server-side and hands the citizen page
 * only the mapped articles/videos. Results are cached in-process for
 * NEWS_REFRESH_MS so a busy page or demo does not hammer either quota.
 *
 * A missing or failing upstream is deliberately not an error path: the
 * citizen page renders its friendly "news unavailable" state instead. Only
 * truly unreachable helpers fail the request.
 */

import { publicProcedure, router } from "./_core/trpc";
import { NEWS_REFRESH_MS, type NewsArticle, type NewsVideo } from "../shared/news";

const NEWS_QUERY = "disaster philippines flood earthquake";
const NEWS_PAGE_SIZE = 10;
const NEWS_SOURCE_LABEL = "News";
const VIDEO_QUERY = "philippines disaster news today";
const VIDEO_MAX_RESULTS = 3;
const VIDEO_CHANNEL_LABEL = "YouTube";
const YOUTUBE_VIDEO_ID = /^[\w-]{11}$/;

type CacheEntry = { at: number; value: unknown };
const newsCache = new Map<string, CacheEntry>();

/** Test-only: drop the in-process cache so suites start from a clean slate. */
export function resetNewsCache() {
  newsCache.clear();
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`upstream ${response.status}`);
  return (await response.json()) as unknown;
}

async function fetchJsonWithCache(
  cacheKey: string,
  url: string,
  ttlMs: number
): Promise<unknown> {
  const hit = newsCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await defaultFetchJson(url);
  newsCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

type NewsApiPayload = {
  status?: string;
  articles?: Array<{
    source?: { name?: string | null } | null;
    title?: string | null;
    description?: string | null;
    url?: string | null;
    urlToImage?: string | null;
    publishedAt?: string | null;
  }>;
};

export function mapNewsArticles(payload: unknown): NewsArticle[] {
  const root = payload as NewsApiPayload;
  if (!root || root.status !== "ok" || !Array.isArray(root.articles)) return [];
  const articles: NewsArticle[] = [];
  for (const raw of root.articles) {
    const title = raw?.title?.trim();
    const url = raw?.url?.trim();
    if (!title || !url) continue;
    articles.push({
      id: url,
      title,
      description: raw.description?.trim() ? raw.description.trim() : null,
      url,
      imageUrl: raw.urlToImage?.trim() ? raw.urlToImage.trim() : null,
      source: raw.source?.name?.trim() || NEWS_SOURCE_LABEL,
      publishedAt: raw.publishedAt ?? new Date().toISOString(),
    });
  }
  return articles;
}

type YoutubeSearchPayload = {
  items?: Array<{
    id?: { videoId?: string | null } | null;
    snippet?: {
      title?: string | null;
      channelTitle?: string | null;
      publishedAt?: string | null;
    } | null;
  }>;
};

export function mapYoutubeVideos(payload: unknown): NewsVideo[] {
  const root = payload as YoutubeSearchPayload;
  if (!root || !Array.isArray(root.items)) return [];
  const videos: NewsVideo[] = [];
  for (const raw of root.items) {
    const videoId = raw?.id?.videoId?.trim() ?? "";
    const title = raw?.snippet?.title?.trim() ?? "";
    if (!YOUTUBE_VIDEO_ID.test(videoId) || !title) continue;
    videos.push({
      id: videoId,
      videoId,
      title,
      channel: raw.snippet?.channelTitle?.trim() || VIDEO_CHANNEL_LABEL,
      publishedAt: raw.snippet?.publishedAt ?? new Date().toISOString(),
    });
  }
  return videos;
}

export const newsRouter = router({
  articles: publicProcedure.query(async () => {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) return { available: false as const, items: [] as NewsArticle[] };
    try {
      const url = new URL("https://newsapi.org/v2/everything");
      url.searchParams.set("q", NEWS_QUERY);
      url.searchParams.set("language", "en");
      url.searchParams.set("sortBy", "publishedAt");
      url.searchParams.set("pageSize", String(NEWS_PAGE_SIZE));
      url.searchParams.set("apiKey", apiKey);
      const payload = await fetchJsonWithCache("news-articles", url.toString(), NEWS_REFRESH_MS);
      return { available: true as const, items: mapNewsArticles(payload) };
    } catch (error) {
      console.warn("[News] articles fetch failed:", error);
      return { available: false as const, items: [] as NewsArticle[] };
    }
  }),
  videos: publicProcedure.query(async () => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return { available: false as const, items: [] as NewsVideo[] };
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("q", VIDEO_QUERY);
      url.searchParams.set("type", "video");
      url.searchParams.set("order", "date");
      url.searchParams.set("maxResults", String(VIDEO_MAX_RESULTS));
      url.searchParams.set("key", apiKey);
      const payload = await fetchJsonWithCache("news-videos", url.toString(), NEWS_REFRESH_MS);
      return { available: true as const, items: mapYoutubeVideos(payload) };
    } catch (error) {
      console.warn("[News] videos fetch failed:", error);
      return { available: false as const, items: [] as NewsVideo[] };
    }
  }),
});