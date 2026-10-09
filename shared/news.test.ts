import { describe, expect, it } from "vitest";
import {
  filterNewsByCategory,
  HARDCODED_NEWS_ARTICLES,
  HARDCODED_NEWS_VIDEOS,
  newsCategoryLabel,
  newsRelativeTime,
  toNewsFeedState,
  toNewsFeedStateWithFallback,
  truncateNewsText,
  type NewsArticle,
} from "./news";

const NOW = Date.parse("2026-10-09T10:00:00Z");

function article(overrides: Partial<NewsArticle>): NewsArticle {
  return {
    id: "https://example.com/a",
    title: "Typhoon brings heavy rain to Manila",
    description: "Flood warnings issued for low-lying areas.",
    url: "https://example.com/a",
    imageUrl: "https://example.com/a.jpg",
    source: "Pateros News",
    publishedAt: "2026-10-09T08:00:00Z",
    ...overrides,
  };
}

describe("newsRelativeTime", () => {
  it("labels a timestamp two hours old as hours ago", () => {
    expect(newsRelativeTime("2026-10-09T08:00:00Z", "en", NOW)).toBe("2 hours ago");
    expect(newsRelativeTime("2026-10-09T08:00:00Z", "fil", NOW)).toBe("2 oras ang nakalipas");
  });

  it("labels less than a minute as just now", () => {
    expect(newsRelativeTime("2026-10-09T09:59:30Z", "en", NOW)).toBe("Just now");
  });

  it("labels minutes with singular and plural forms", () => {
    expect(newsRelativeTime("2026-10-09T09:01:00Z", "en", NOW)).toBe("59 minutes ago");
    expect(newsRelativeTime("2026-10-09T09:59:30Z", "en", NOW)).toBe("Just now");
  });

  it("labels days before falling back to a calendar date", () => {
    expect(newsRelativeTime("2026-10-06T10:00:00Z", "en", NOW)).toBe("3 days ago");
    expect(newsRelativeTime("2026-09-01T10:00:00Z", "en", NOW)).toMatch(/\d{4}/);
  });

  it("handles a future timestamp and an unparseable one gracefully", () => {
    expect(newsRelativeTime("2026-10-10T10:00:00Z", "en", NOW)).toBe("Just now");
    expect(newsRelativeTime("not-a-date", "en", NOW)).toBe("");
  });
});

describe("filterNewsByCategory", () => {
  const articles = [
    article({ title: "Typhoon Kiko strengthens over the Pacific", description: "Bagyo update from PAGASA" }),
    article({ id: "b", url: "https://example.com/b", title: "Earthquake shakes northern Luzon", description: "Aftershocks expected." }),
    article({ id: "c", url: "https://example.com/c", title: "City opens new flood control pumps", description: "Flooding risk reduced." }),
  ];

  it("returns everything for ALL", () => {
    expect(filterNewsByCategory(articles, "ALL")).toHaveLength(3);
  });

  it("matches flood by English and Filipino keywords", () => {
    expect(filterNewsByCategory(articles, "FLOOD").map(a => a.id)).toEqual(["c"]);
  });

  it("matches earthquake by keyword", () => {
    expect(filterNewsByCategory(articles, "EARTHQUAKE").map(a => a.id)).toEqual(["b"]);
  });

  it("matches typhoon by Filipino keyword in the description", () => {
    expect(filterNewsByCategory(articles, "TYPHOON").map(a => a.id)).toEqual([
      "https://example.com/a",
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterNewsByCategory(articles, "WEATHER")).toEqual([]);
  });
});

describe("newsCategoryLabel", () => {
  it("translates every tab label", () => {
    expect(newsCategoryLabel("ALL", "en")).toBe("All");
    expect(newsCategoryLabel("ALL", "fil")).toBe("Lahat");
    expect(newsCategoryLabel("FLOOD", "fil")).toBe("Baha");
    expect(newsCategoryLabel("EARTHQUAKE", "fil")).toBe("Lindol");
    expect(newsCategoryLabel("TYPHOON", "fil")).toBe("Bagyo");
    expect(newsCategoryLabel("WEATHER", "fil")).toBe("Panahon");
  });
});

describe("truncateNewsText", () => {
  it("keeps short text untouched", () => {
    expect(truncateNewsText("Short.", 100)).toBe("Short.");
  });

  it("trims to the limit with an ellipsis", () => {
    expect(truncateNewsText("a".repeat(120), 100)).toHaveLength(100);
    expect(truncateNewsText("a".repeat(120), 100).endsWith("…")).toBe(true);
  });

  it("handles a limit smaller than the ellipsis", () => {
    expect(truncateNewsText("hello", 0)).toBe("…");
  });
});

describe("toNewsFeedState", () => {
  it("projects the router payloads into UI states", () => {
    expect(toNewsFeedState(undefined, true)).toEqual({ status: "loading" });
    expect(toNewsFeedState(undefined, false)).toEqual({ status: "unavailable" });
    expect(toNewsFeedState({ available: false, items: [] }, false)).toEqual({
      status: "unavailable",
    });
    expect(
      toNewsFeedState({ available: true, items: [article({})] }, false)
    ).toEqual({ status: "ready", items: [article({})] });
  });
});

describe("toNewsFeedStateWithFallback", () => {
  const fallback: NewsArticle[] = [
    article({ id: "fb", url: "https://example.com/fb" }),
  ];

  it("uses the live feed whenever it has items", () => {
    const live = [article({})];
    expect(
      toNewsFeedStateWithFallback({ available: true, items: live }, false, fallback)
    ).toEqual({ status: "ready", items: live });
  });

  it("keeps the loading skeleton while the query is in flight", () => {
    expect(toNewsFeedStateWithFallback(undefined, true, fallback)).toEqual({
      status: "loading",
    });
  });

  it("renders the embedded fallback during the no-key demo period", () => {
    expect(toNewsFeedStateWithFallback(undefined, false, fallback)).toEqual({
      status: "ready",
      items: fallback,
    });
    expect(
      toNewsFeedStateWithFallback({ available: false, items: [] }, false, fallback)
    ).toEqual({ status: "ready", items: fallback });
    expect(
      toNewsFeedStateWithFallback({ available: true, items: [] }, false, fallback)
    ).toEqual({ status: "ready", items: fallback });
  });
});

describe("hardcoded demo-period feed", () => {
  it("articles have unique ids, https links, and parseable timestamps", () => {
    const ids = new Set(HARDCODED_NEWS_ARTICLES.map(item => item.id));
    expect(ids.size).toBe(HARDCODED_NEWS_ARTICLES.length);
    for (const item of HARDCODED_NEWS_ARTICLES) {
      expect(item.url).toMatch(/^https:\/\//);
      expect(Number.isNaN(Date.parse(item.publishedAt))).toBe(false);
      expect(item.title.length).toBeGreaterThan(10);
    }
  });

  it("every category tab has at least one matching fallback article", () => {
    for (const category of ["FLOOD", "TYPHOON", "WEATHER"] as const) {
      expect(filterNewsByCategory(HARDCODED_NEWS_ARTICLES, category).length).toBeGreaterThan(0);
    }
  });

  it("videos reference distinct 11-character YouTube ids", () => {
    const ids = new Set(HARDCODED_NEWS_VIDEOS.map(item => item.videoId));
    expect(ids.size).toBe(HARDCODED_NEWS_VIDEOS.length);
    for (const item of HARDCODED_NEWS_VIDEOS) {
      expect(item.videoId).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(Number.isNaN(Date.parse(item.publishedAt))).toBe(false);
    }
  });
});