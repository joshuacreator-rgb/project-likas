import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { mapNewsArticles, mapYoutubeVideos, resetNewsCache } from "./news";

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

const NEWS_PAYLOAD = {
  status: "ok",
  articles: [
    {
      source: { name: "Pateros News" },
      title: "Flood warnings issued for low-lying areas",
      description: "Rain continues overnight.",
      url: "https://example.com/flood",
      urlToImage: "https://example.com/flood.jpg",
      publishedAt: "2026-10-09T08:00:00Z",
    },
    {
      source: { name: null },
      title: "",
      url: "https://example.com/empty",
    },
    {
      source: { name: null },
      title: "Without an image",
      description: null,
      url: "https://example.com/no-image",
    },
  ],
};

const YOUTUBE_PAYLOAD = {
  items: [
    {
      id: { videoId: "AbCdEf12345" },
      snippet: {
        title: "PAGASA weather update",
        channelTitle: "PAGASA",
        publishedAt: "2026-10-09T07:00:00Z",
      },
    },
    {
      id: { videoId: "not-a-valid-youtube-id-12345" },
      snippet: { title: "Bad id must be dropped", channelTitle: "X" },
    },
    {
      id: { videoId: "ZzYyXx99999" },
      snippet: {
        title: "Typhoon Kiko update",
        channelTitle: "ABS-CBN News",
        publishedAt: "2026-10-09T06:00:00Z",
      },
    },
  ],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("mapNewsArticles", () => {
  it("maps only complete articles and defaults missing fields", () => {
    const mapped = mapNewsArticles(NEWS_PAYLOAD);
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toEqual({
      id: "https://example.com/flood",
      title: "Flood warnings issued for low-lying areas",
      description: "Rain continues overnight.",
      url: "https://example.com/flood",
      imageUrl: "https://example.com/flood.jpg",
      source: "Pateros News",
      publishedAt: "2026-10-09T08:00:00Z",
    });
    expect(mapped[1].source).toBe("News");
    expect(mapped[1].imageUrl).toBeNull();
  });

  it("returns an empty list for a non-ok or malformed payload", () => {
    expect(mapNewsArticles({ status: "error" })).toEqual([]);
    expect(mapNewsArticles(null)).toEqual([]);
  });
});

describe("mapYoutubeVideos", () => {
  it("maps only videos with a valid 11-character id", () => {
    const mapped = mapYoutubeVideos(YOUTUBE_PAYLOAD);
    expect(mapped.map(v => v.videoId)).toEqual(["AbCdEf12345", "ZzYyXx99999"]);
    expect(mapped[0].channel).toBe("PAGASA");
  });

  it("returns an empty list for a malformed payload", () => {
    expect(mapYoutubeVideos({})).toEqual([]);
    expect(mapYoutubeVideos(null)).toEqual([]);
  });
});

describe("news router", () => {
  let fetchCalls: string[];

  beforeEach(() => {
    resetNewsCache();
    fetchCalls = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEWS_API_KEY;
    delete process.env.YOUTUBE_API_KEY;
  });

  function stubFetchWith(payload: unknown, status = 200) {
    vi.stubGlobal(
      "fetch",
      (async (input: string) => {
        fetchCalls.push(input);
        return jsonResponse(payload, status);
      }) as unknown as typeof fetch
    );
  }

  it("reports unavailable without calling upstream when NewsAPI key is missing", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.news.articles()).resolves.toEqual({ available: false, items: [] });
    expect(fetchCalls).toEqual([]);
  });

  it("maps NewsAPI results into the citizen shape", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-09T07:21:26.000Z"));
    try {
      process.env.NEWS_API_KEY = "test-news-key";
      stubFetchWith(NEWS_PAYLOAD);
      const result = await appRouter.createCaller(anonymousContext()).news.articles();
      expect(result).toEqual({ available: true, items: mapNewsArticles(NEWS_PAYLOAD) });
      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0]).toContain("newsapi.org/v2/everything");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports unavailable when the upstream call fails", async () => {
    process.env.NEWS_API_KEY = "test-news-key";
    stubFetchWith({}, 500);
    await expect(
      appRouter.createCaller(anonymousContext()).news.articles()
    ).resolves.toEqual({ available: false, items: [] });
  });

  it("serves the cached payload without a second upstream call", async () => {
    process.env.NEWS_API_KEY = "test-news-key";
    stubFetchWith(NEWS_PAYLOAD);
    const caller = appRouter.createCaller(anonymousContext());
    await caller.news.articles();
    await caller.news.articles();
    expect(fetchCalls).toHaveLength(1);
  });

  it("reports unavailable when the YouTube key is missing", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.news.videos()).resolves.toEqual({ available: false, items: [] });
    expect(fetchCalls).toEqual([]);
  });

  it("maps YouTube results into the citizen shape", async () => {
    process.env.YOUTUBE_API_KEY = "test-youtube-key";
    stubFetchWith(YOUTUBE_PAYLOAD);
    const result = await appRouter.createCaller(anonymousContext()).news.videos();
    expect(result).toEqual({ available: true, items: mapYoutubeVideos(YOUTUBE_PAYLOAD) });
    expect(fetchCalls[0]).toContain("googleapis.com/youtube/v3/search");
  });

  it("reports unavailable when the YouTube call fails", async () => {
    process.env.YOUTUBE_API_KEY = "test-youtube-key";
    stubFetchWith({}, 403);
    await expect(
      appRouter.createCaller(anonymousContext()).news.videos()
    ).resolves.toEqual({ available: false, items: [] });
  });
});