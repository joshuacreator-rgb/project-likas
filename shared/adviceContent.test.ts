import { describe, expect, it } from "vitest";
import { adviceCategories, adviceCategoryOrder, isAdviceDraftPublishable } from "./advice";
import { builtinAdvice } from "./adviceContent";

/**
 * Backlog §13: the citizen home always shows built-in tips, so the content
 * itself is a deliverable and is guarded the same way the shared publish gate
 * guards authoring. These tests fail loudly if a future editor drops a
 * category, leaves a half translation, or ships a tip set with no action.
 */
describe("builtin safety advice content", () => {
  it("covers every hazard category exactly once", () => {
    const present = builtinAdvice.map(item => item.category);
    expect(new Set(present).size).toBe(present.length);
    expect([...present].sort()).toEqual([...adviceCategoryOrder].sort());
  });

  it("has stable, unique ids and slugs", () => {
    const ids = new Set(builtinAdvice.map(item => item.id));
    const slugs = new Set(builtinAdvice.map(item => item.slug));
    expect(ids.size).toBe(builtinAdvice.length);
    expect(slugs.size).toBe(builtinAdvice.length);
    for (const item of builtinAdvice) {
      expect(item.id).toBeLessThan(0);
      expect(item.slug.trim()).toBeTruthy();
    }
  });

  it("is fully bilingual: title, summary and body in English and Filipino", () => {
    for (const item of builtinAdvice) {
      expect(item.title.trim()).toBeTruthy();
      expect(item.titleFilipino.trim()).toBeTruthy();
      expect(item.summary.trim()).toBeTruthy();
      expect(item.summaryFilipino.trim()).toBeTruthy();
      expect(item.body.trim()).toBeTruthy();
      expect(item.bodyFilipino.trim()).toBeTruthy();
    }
  });

  it("has at least one actionable step in both languages", () => {
    for (const item of builtinAdvice) {
      expect(item.steps.length).toBeGreaterThan(0);
      for (const step of item.steps) {
        expect((step.instruction ?? "").trim()).toBeTruthy();
        expect((step.instructionFilipino ?? "").trim()).toBeTruthy();
      }
    }
  });

  it("uses only known hazard categories", () => {
    for (const item of builtinAdvice) {
      expect(item.category in adviceCategories).toBe(true);
    }
  });

  it("passes the shared publish gate used for authored content", () => {
    for (const item of builtinAdvice) {
      expect(isAdviceDraftPublishable(item)).toBe(true);
    }
  });

  it("has one valid, unique YouTube video id per item for the click-to-play facade", () => {
    const ids = builtinAdvice.map(item => item.youtubeId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[\w-]{11}$/);
    }
  });
});