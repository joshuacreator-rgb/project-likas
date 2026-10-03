/**
 * Safety advice domain logic (US-8 / US-9 / US-10).
 *
 * Pure helpers only: no database, no React. Kept here so both the admin
 * authoring UI and the public citizen view enforce the same rules.
 *
 * Bilingual convention (matches alerts and evacuation centers): English is
 * the required source text and Filipino is an optional translation. A missing
 * Filipino value always falls back to English rather than rendering empty.
 */

import type { CitizenLanguage } from "./citizen";

export type AdviceStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/**
 * Content taxonomy. Stored as varchar (not a MySQL enum) because the DRRM
 * office adds hazard types as content needs change, and that should not
 * require a database migration.
 */
export const adviceCategories = {
  EARTHQUAKE: { label: "Earthquake", labelFilipino: "Lindol" },
  STORM: { label: "Storm / Typhoon", labelFilipino: "Bagyo" },
  FLOOD: { label: "Flooding", labelFilipino: "Baha" },
  FIRE: { label: "Fire", labelFilipino: "Sunog" },
  GENERAL: { label: "General safety", labelFilipino: "Kaligtasang pangkalahatan" },
} as const;

export type AdviceCategory = keyof typeof adviceCategories;

export const adviceCategoryOrder: readonly AdviceCategory[] = [
  "EARTHQUAKE",
  "STORM",
  "FLOOD",
  "FIRE",
  "GENERAL",
];

export const adviceStatusLabels: Record<AdviceStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export type AdviceRecord = {
  id: number;
  slug: string;
  category: string;
  title: string;
  titleFilipino?: string | null;
  summary: string;
  summaryFilipino?: string | null;
  body: string;
  bodyFilipino?: string | null;
  status: AdviceStatus | string;
  isEmergency?: boolean | null;
  sortOrder?: number | null;
  publishedAt?: Date | string | null;
  archivedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type AdviceStepRecord = {
  id?: number;
  stepNo?: number | null;
  title?: string | null;
  titleFilipino?: string | null;
  instruction?: string | null;
  instructionFilipino?: string | null;
  imageUrl?: string | null;
  imageKey?: string | null;
};

/** Draft shape used by the admin editor before an id or slug exists. */
export type AdviceDraft = {
  category: string;
  title: string;
  titleFilipino?: string | null;
  summary: string;
  summaryFilipino?: string | null;
  body: string;
  bodyFilipino?: string | null;
  isEmergency?: boolean | null;
  steps?: AdviceStepRecord[] | null;
};

/** Pick the requested language, falling back to English when a translation is blank. */
export function localizedText(
  english: string | null | undefined,
  filipino: string | null | undefined,
  language: CitizenLanguage,
): string {
  const fallback = (english ?? "").trim();
  if (language !== "fil") return fallback;
  return (filipino ?? "").trim() || fallback;
}

export function adviceCategoryLabel(
  category: string | null | undefined,
  language: CitizenLanguage = "en",
): string {
  const entry = adviceCategories[(category ?? "") as AdviceCategory];
  if (!entry) return (category ?? "General safety").trim() || "General safety";
  return language === "fil" ? entry.labelFilipino : entry.label;
}

/** Lifecycle: draft -> published -> archived, and archived -> draft for revisions. */
export function canTransitionAdviceStatus(
  current: AdviceStatus | string,
  next: AdviceStatus | string,
): boolean {
  if (current === next) return true;
  const transitions: Record<AdviceStatus, AdviceStatus[]> = {
    DRAFT: ["PUBLISHED", "ARCHIVED"],
    PUBLISHED: ["DRAFT", "ARCHIVED"],
    ARCHIVED: ["DRAFT", "PUBLISHED"],
  };
  const from = transitions[current as AdviceStatus];
  return from ? from.includes(next as AdviceStatus) : false;
}

export function nextAdviceStatuses(
  current: AdviceStatus | string,
): AdviceStatus[] {
  if (current === "DRAFT") return ["PUBLISHED"];
  if (current === "PUBLISHED") return ["DRAFT", "ARCHIVED"];
  if (current === "ARCHIVED") return ["DRAFT", "PUBLISHED"];
  return [];
}

/**
 * Publishing gate. English title, summary and body are required, and at least
 * one step must carry either an instruction or a photo so published guidance is
 * actionable rather than an empty shell.
 */
export function validateAdviceDraft(draft: {
  title?: string | null;
  summary?: string | null;
  body?: string | null;
  steps?: AdviceStepRecord[] | null;
}): { title?: string; summary?: string; body?: string; steps?: string } {
  const errors: { title?: string; summary?: string; body?: string; steps?: string } =
    {};
  if (!(draft.title ?? "").trim()) errors.title = "Title is required.";
  if ((draft.summary ?? "").trim().length < 10)
    errors.summary = "Summary must be at least 10 characters.";
  if (!(draft.body ?? "").trim()) errors.body = "Body is required.";
  const usableSteps = (draft.steps ?? []).filter(
    step =>
      Boolean((step.instruction ?? "").trim()) ||
      Boolean((step.instructionFilipino ?? "").trim()) ||
      Boolean(step.imageUrl),
  );
  if (usableSteps.length === 0)
    errors.steps = "Add at least one step with instructions or a photo.";
  return errors;
}

export function isAdviceDraftPublishable(draft: Parameters<typeof validateAdviceDraft>[0]): boolean {
  return Object.keys(validateAdviceDraft(draft)).length === 0;
}

/** URL-safe slug derived from the English title, trimmed to the column width. */
export function slugifyAdviceTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return base || "safety-advice";
}

/** Append -2, -3, ... until the slug is free. */
export function uniqueAdviceSlug(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map(value => value.toLowerCase()));
  const root = slugifyAdviceTitle(base);
  if (!used.has(root)) return root;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${root}-${suffix}`.slice(0, 110);
    if (!used.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/**
 * Drop blank steps, keep author order, and renumber from 1 so `stepNo` always
 * matches display order after reordering in the admin editor.
 */
export function normalizeAdviceSteps(
  steps: readonly AdviceStepRecord[] | null | undefined,
): AdviceStepRecord[] {
  const usable = (steps ?? []).filter(
    step =>
      Boolean((step.title ?? "").trim()) ||
      Boolean((step.titleFilipino ?? "").trim()) ||
      Boolean((step.instruction ?? "").trim()) ||
      Boolean((step.instructionFilipino ?? "").trim()) ||
      Boolean(step.imageUrl),
  );
  return usable.map((step, index) => ({ ...step, stepNo: index + 1 }));
}

/** Public list: emergency guidance first, then curated order, then newest. */
export function sortAdviceForDisplay<T extends AdviceRecord>(advice: readonly T[]): T[] {
  return [...advice].sort((a, b) => {
    if (Boolean(b.isEmergency) !== Boolean(a.isEmergency))
      return a.isEmergency ? -1 : 1;
    const orderDelta = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDelta !== 0) return orderDelta;
    return adviceTimestamp(b) - adviceTimestamp(a);
  });
}

export function adviceTimestamp(advice: AdviceRecord): number {
  const value = advice.publishedAt ?? advice.updatedAt ?? advice.createdAt;
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Only published guidance is ever exposed to the public endpoint. */
export function isPublishedAdvice(advice: AdviceRecord): boolean {
  return advice.status === "PUBLISHED";
}

export function filterPublishedAdvice<T extends AdviceRecord>(
  advice: readonly T[] | undefined,
): T[] {
  return sortAdviceForDisplay((advice ?? []).filter(isPublishedAdvice));
}

export function adviceHeadline(advice: AdviceRecord, language: CitizenLanguage): string {
  return localizedText(advice.title, advice.titleFilipino, language);
}

export function adviceSummaryText(advice: AdviceRecord, language: CitizenLanguage): string {
  return localizedText(advice.summary, advice.summaryFilipino, language);
}

export function adviceBodyText(advice: AdviceRecord, language: CitizenLanguage): string {
  return localizedText(advice.body, advice.bodyFilipino, language);
}

export function adviceStepText(
  step: AdviceStepRecord,
  language: CitizenLanguage,
): { title: string; instruction: string } {
  return {
    title: localizedText(step.title, step.titleFilipino, language),
    instruction: localizedText(step.instruction, step.instructionFilipino, language),
  };
}

/** Flatten one advice item (plus its steps) into a single read-aloud script. */
export function buildAdviceSpeech(
  advice: AdviceRecord,
  steps: readonly AdviceStepRecord[] | undefined,
  language: CitizenLanguage,
): string {
  const parts = [
    adviceHeadline(advice, language),
    adviceSummaryText(advice, language),
    adviceBodyText(advice, language),
  ];
  const ordered = normalizeAdviceSteps(steps);
  ordered.forEach((step, index) => {
    const text = adviceStepText(step, language);
    const label = text.title || `Step ${index + 1}`;
    parts.push(`${language === "fil" ? `Hakbang ${index + 1}` : `Step ${index + 1}`}: ${label}.`);
    if (text.instruction) parts.push(text.instruction);
  });
  return parts.filter(Boolean).join(" ");
}

export function adviceSearchText(
  advice: AdviceRecord,
  steps?: readonly AdviceStepRecord[],
): string {
  return [
    advice.title,
    advice.titleFilipino,
    advice.summary,
    advice.summaryFilipino,
    advice.category,
    ...(steps ?? []).flatMap(step => [
      step.title,
      step.titleFilipino,
      step.instruction,
      step.instructionFilipino,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Categories actually present in published guidance, in taxonomy order. */
export function adviceCategoriesInUse(advice: readonly AdviceRecord[]): AdviceCategory[] {
  const used = new Set(advice.map(item => item.category));
  return adviceCategoryOrder.filter(category => used.has(category));
}

const adviceImageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Step photos only: keeps the advice gallery light and avoids upload surprises. */
export function isAllowedAdviceImageMimeType(mimeType: string): boolean {
  return adviceImageMimeTypes.includes(mimeType.toLowerCase());
}

export const adviceImageMaxBytes = 5_000_000;