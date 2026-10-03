import { describe, expect, it } from "vitest";
import {
  adviceBodyText,
  adviceCategoryLabel,
  adviceCategoriesInUse,
  adviceHeadline,
  adviceSearchText,
  adviceStepText,
  adviceSummaryText,
  buildAdviceSpeech,
  canTransitionAdviceStatus,
  filterPublishedAdvice,
  isAdviceDraftPublishable,
  isAllowedAdviceImageMimeType,
  nextAdviceStatuses,
  normalizeAdviceSteps,
  slugifyAdviceTitle,
  sortAdviceForDisplay,
  uniqueAdviceSlug,
  validateAdviceDraft,
  type AdviceRecord,
} from "./advice";

const baseAdvice: AdviceRecord = {
  id: 1,
  slug: "earthquake-during-shaking",
  category: "EARTHQUAKE",
  title: "What to do during shaking",
  titleFilipino: "Ano ang gagawin habang lumalakad",
  summary: "Drop, cover, and hold on until the shaking stops.",
  summaryFilipino: "Magtumba, takpan, at hawakan hanggang tumigil.",
  body: "Stay indoors away from windows until the shaking has passed.",
  bodyFilipino: null,
  status: "PUBLISHED",
  isEmergency: false,
  sortOrder: 0,
  publishedAt: "2026-01-05T00:00:00.000Z",
};

describe("Safety advice bilingual copy", () => {
  it("uses the Filipino translation when the reader picked Filipino", () => {
    expect(adviceHeadline(baseAdvice, "fil")).toBe("Ano ang gagawin habang lumalakad");
    expect(adviceSummaryText(baseAdvice, "fil")).toBe(
      "Magtumba, takpan, at hawakan hanggang tumigil.",
    );
  });

  it("never renders an empty Filipino block when a translation is missing", () => {
    expect(adviceBodyText(baseAdvice, "fil")).toBe(
      "Stay indoors away from windows until the shaking has passed.",
    );
    expect(adviceHeadline({ ...baseAdvice, titleFilipino: "   " }, "fil")).toBe(
      "What to do during shaking",
    );
    expect(adviceStepText({ stepNo: 1, instruction: "Stay low" }, "fil")).toEqual({
      title: "",
      instruction: "Stay low",
    });
  });

  it("returns English when the reader picked English even if Filipino exists", () => {
    expect(adviceHeadline(baseAdvice, "en")).toBe("What to do during shaking");
  });

  it("labels categories in both languages and keeps unknown categories readable", () => {
    expect(adviceCategoryLabel("EARTHQUAKE", "en")).toBe("Earthquake");
    expect(adviceCategoryLabel("EARTHQUAKE", "fil")).toBe("Lindol");
    expect(adviceCategoryLabel("VOLCANIC_ASH", "en")).toBe("VOLCANIC_ASH");
    expect(adviceCategoryLabel(null, "en")).toBe("General safety");
  });
});

describe("Safety advice visibility", () => {
  it("exposes only published guidance to the public list", () => {
    const list: AdviceRecord[] = [
      baseAdvice,
      { ...baseAdvice, id: 2, slug: "draft-one", status: "DRAFT" },
      { ...baseAdvice, id: 3, slug: "archived-one", status: "ARCHIVED" },
    ];
    expect(filterPublishedAdvice(list).map(item => item.slug)).toEqual([
      "earthquake-during-shaking",
    ]);
    expect(filterPublishedAdvice(undefined)).toEqual([]);
  });

  it("pins emergency guidance above curated order and newer items", () => {
    const list: AdviceRecord[] = [
      { ...baseAdvice, id: 1, slug: "old", sortOrder: 5, publishedAt: "2026-01-01T00:00:00.000Z" },
      { ...baseAdvice, id: 2, slug: "curated-first", sortOrder: 1, publishedAt: "2026-01-02T00:00:00.000Z" },
      { ...baseAdvice, id: 3, slug: "urgent", isEmergency: true, sortOrder: 9, publishedAt: "2026-01-03T00:00:00.000Z" },
    ];
    expect(sortAdviceForDisplay(list).map(item => item.slug)).toEqual([
      "urgent",
      "curated-first",
      "old",
    ]);
  });

  it("lists only categories that have published guidance, in taxonomy order", () => {
    const list: AdviceRecord[] = [
      { ...baseAdvice, category: "GENERAL" },
      { ...baseAdvice, category: "EARTHQUAKE" },
      { ...baseAdvice, category: "FIRE" },
    ];
    expect(adviceCategoriesInUse(list)).toEqual(["EARTHQUAKE", "FIRE", "GENERAL"]);
    expect(adviceCategoriesInUse([])).toEqual([]);
  });
});

describe("Safety advice publishing rules", () => {
  it("allows draft to publish, publish to archive, and archive back to draft", () => {
    expect(canTransitionAdviceStatus("DRAFT", "PUBLISHED")).toBe(true);
    expect(canTransitionAdviceStatus("PUBLISHED", "ARCHIVED")).toBe(true);
    expect(canTransitionAdviceStatus("ARCHIVED", "DRAFT")).toBe(true);
    expect(canTransitionAdviceStatus("DRAFT", "ARCHIVED")).toBe(true);
    expect(canTransitionAdviceStatus("PUBLISHED", "DRAFT")).toBe(true);
  });

  it("never allows publishing to be a no-op or skips the archive step", () => {
    expect(canTransitionAdviceStatus("DRAFT", "DRAFT")).toBe(true);
    expect(canTransitionAdviceStatus("PUBLISHED", "PUBLISHED")).toBe(true);
    expect(canTransitionAdviceStatus("UNKNOWN", "PUBLISHED")).toBe(false);
  });

  it("offers only the meaningful next statuses for the admin action row", () => {
    expect(nextAdviceStatuses("DRAFT")).toEqual(["PUBLISHED"]);
    expect(nextAdviceStatuses("PUBLISHED")).toEqual(["DRAFT", "ARCHIVED"]);
    expect(nextAdviceStatuses("ARCHIVED")).toEqual(["DRAFT", "PUBLISHED"]);
  });

  it("blocks publishing an empty draft", () => {
    const errors = validateAdviceDraft({ title: "", summary: "short", body: "" });
    expect(errors.title).toBeTruthy();
    expect(errors.summary).toBeTruthy();
    expect(errors.body).toBeTruthy();
    expect(errors.steps).toBeTruthy();
    expect(isAdviceDraftPublishable({ title: "", summary: "short", body: "" })).toBe(false);
  });

  it("blocks publishing guidance whose steps have no instruction and no photo", () => {
    const draft = {
      title: "Flooding at home",
      summary: "What to do when water enters your home.",
      body: "Move to higher ground and avoid walking through moving water.",
      steps: [{ title: "Step one", stepNo: 1 }],
    };
    expect(validateAdviceDraft(draft).steps).toBeTruthy();
  });

  it("accepts a step that carries only a photo", () => {
    const draft = {
      title: "Flooding at home",
      summary: "What to do when water enters your home.",
      body: "Move to higher ground.",
      steps: [{ stepNo: 1, imageUrl: "/manus-storage/advice/flood-1.jpg" }],
    };
    expect(validateAdviceDraft(draft)).toEqual({});
    expect(isAdviceDraftPublishable(draft)).toBe(true);
  });

  it("accepts a step written only in Filipino", () => {
    const draft = {
      title: "Sunog sa bahay",
      summary: "Ano ang gagawin kapag nag-aapoy sa bahay.",
      body: "Tawagan ang 911 ka agad.",
      steps: [{ stepNo: 1, instructionFilipino: "Lumikas agad." }],
    };
    expect(isAdviceDraftPublishable(draft)).toBe(true);
  });
});

describe("Safety advice steps", () => {
  it("drops empty steps and renumbers from one after reordering", () => {
    const steps = normalizeAdviceSteps([
      { instruction: "Move to higher ground", stepNo: 7 },
      { title: "", instruction: "", instructionFilipino: "", stepNo: 8 },
      { instructionFilipino: "Lumikas agad", stepNo: 2 },
      { imageUrl: "/manus-storage/advice/step.jpg", stepNo: 3 },
    ]);
    expect(steps.map(step => step.stepNo)).toEqual([1, 2, 3]);
    expect(steps[1].instructionFilipino).toBe("Lumikas agad");
    expect(steps[2].imageUrl).toBe("/manus-storage/advice/step.jpg");
  });

  it("treats missing step lists as no steps", () => {
    expect(normalizeAdviceSteps(null)).toEqual([]);
    expect(normalizeAdviceSteps(undefined)).toEqual([]);
  });

  it("keeps a photo-only step even without any text", () => {
    expect(normalizeAdviceSteps([{ imageUrl: "/a.jpg" }])).toHaveLength(1);
  });
});

describe("Safety advice slugs", () => {
  it("builds a url-safe slug from the English title", () => {
    expect(slugifyAdviceTitle("What to do during an earthquake")).toBe(
      "what-to-do-during-an-earthquake",
    );
    expect(slugifyAdviceTitle("  Fire: Kitchen Safety!!  ")).toBe("fire-kitchen-safety");
    expect(slugifyAdviceTitle("   ")).toBe("safety-advice");
  });

  it("suffixes duplicates instead of colliding", () => {
    expect(uniqueAdviceSlug("Earthquake safety", [])).toBe("earthquake-safety");
    expect(uniqueAdviceSlug("Earthquake safety", ["earthquake-safety"])).toBe(
      "earthquake-safety-2",
    );
    expect(
      uniqueAdviceSlug("Earthquake safety", ["earthquake-safety", "earthquake-safety-2"]),
    ).toBe("earthquake-safety-3");
  });
});

describe("Safety advice read-aloud and search", () => {
  it("reads the headline, summary, body and numbered steps in Filipino", () => {
    const script = buildAdviceSpeech(
      baseAdvice,
      [
        { stepNo: 1, titleFilipino: "Magtumba", instruction: "Cover your head." },
        { stepNo: 2, title: "Move outside" },
      ],
      "fil",
    );
    expect(script).toContain("Ano ang gagawin habang lumalakad");
    expect(script).toContain("Hakbang 1: Magtumba.");
    expect(script).toContain("Cover your head.");
    expect(script).toContain("Hakbang 2: Move outside.");
  });

  it("falls back to a numbered label when a step has no title", () => {
    const script = buildAdviceSpeech(baseAdvice, [{ instruction: "Stay low" }], "en");
    expect(script).toContain("Step 1: Step 1.");
  });

  it("searches English and Filipino copy so either language finds the item", () => {
    expect(adviceSearchText(baseAdvice)).toContain("ano ang gagawin");
    expect(adviceSearchText(baseAdvice)).toContain("drop, cover");
    expect(
      adviceSearchText(baseAdvice, [{ stepNo: 1, instructionFilipino: "Lumikas agad" }]),
    ).toContain("lumikas agad");
  });

  it("tolerates advice rows with no optional fields", () => {
    const sparse: AdviceRecord = {
      id: 9,
      slug: "sparse",
      category: "GENERAL",
      title: "Sparse",
      summary: "Sparse summary",
      body: "Sparse body",
      status: "DRAFT",
    };
    expect(adviceSearchText(sparse)).toContain("sparse");
    expect(buildAdviceSpeech(sparse, undefined, "en")).toBe("Sparse Sparse summary Sparse body");
  });
});

describe("Safety advice step photo rules", () => {
  it("accepts image formats only", () => {
    expect(isAllowedAdviceImageMimeType("image/jpeg")).toBe(true);
    expect(isAllowedAdviceImageMimeType("image/PNG")).toBe(true);
    expect(isAllowedAdviceImageMimeType("image/webp")).toBe(true);
    expect(isAllowedAdviceImageMimeType("video/mp4")).toBe(false);
    expect(isAllowedAdviceImageMimeType("application/pdf")).toBe(false);
  });
});