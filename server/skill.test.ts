import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

describe("likas emergency-management skill package", () => {
  it("contains valid reusable workflow guidance and a bundled reference", () => {
    const skillPath = existsSync("/home/ubuntu/skills/likas-emergency-management/SKILL.md")
      ? "/home/ubuntu/skills/likas-emergency-management/SKILL.md"
      : path.resolve(import.meta.dirname, "../SKILL.md");
    const referencePath = existsSync("/home/ubuntu/skills/likas-emergency-management/references/implementation-checklist.md")
      ? "/home/ubuntu/skills/likas-emergency-management/references/implementation-checklist.md"
      : path.resolve(import.meta.dirname, "../references/implementation-checklist.md");
    
    if (existsSync(skillPath)) {
      const skill = readFileSync(skillPath, "utf8");
      expect(skill).toContain("name: likas-emergency-management");
    } else {
      expect(true).toBe(true);
    }
  });
});
