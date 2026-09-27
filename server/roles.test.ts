import { describe, expect, it } from "vitest";
import { formatRoleLabel, getHomePath, getLoginPath, getRegisterPath, getRoleFromSearch, getVoiceFallbackMessage, getVoiceInputMode, isRoleSelectionAllowed, isSelfRegistrationAllowed } from "../shared/roles";

describe("role labels", () => {
  it("uses clear exact names for operational roles", () => {
    expect(formatRoleLabel("admin")).toBe("Administrator");
    expect(formatRoleLabel("staff")).toBe("Evacuation Center Staff");
    expect(formatRoleLabel("responder")).toBe("Responder / Disaster Team");
    expect(formatRoleLabel("citizen")).toBe("Citizen");
  });
  it("keeps the legacy role citizen-friendly", () => {
    expect(formatRoleLabel("user")).toBe("Citizen");
    expect(formatRoleLabel(null)).toBe("Citizen");
  });
  it("routes each role to its own dashboard", () => {
    expect(getHomePath("admin")).toBe("/admin");
    expect(getHomePath("staff")).toBe("/staff");
    expect(getHomePath("responder")).toBe("/responder");
    expect(getHomePath("citizen")).toBe("/citizen");
    expect(getHomePath("user")).toBe("/citizen");
  });
  it("falls back to typing when browser voice input is unavailable", () => {
    expect(getVoiceInputMode(true)).toBe("voice");
    expect(getVoiceInputMode(false)).toBe("type");
  });
  it("explains denied microphone permissions in plain language", () => {
    expect(getVoiceFallbackMessage("not-allowed")).toContain("Microphone access was not allowed");
    expect(getVoiceFallbackMessage("network")).toContain("try again or type");
  });
  it("allows only the stored role, with legacy user mapping to citizen", () => {
    expect(isRoleSelectionAllowed("responder", "responder")).toBe(true);
    expect(isRoleSelectionAllowed("admin", "citizen")).toBe(false);
    expect(isRoleSelectionAllowed("citizen", "user")).toBe(true);
  });
  it("keeps demo dashboard Log in and Register targets explicit", () => {
    expect(getLoginPath()).toBe("/login");
    expect(getRegisterPath()).toBe("/register?role=citizen");
    expect(getLoginPath("responder")).toBe("/login?role=responder");
  });
  it("preserves valid role choices in login and registration links", () => {
    expect(getRoleFromSearch("?role=admin")).toBe("admin");
    expect(getRoleFromSearch("?role=responder")).toBe("responder");
    expect(getRoleFromSearch("?role=unknown")).toBe("citizen");
  });
  it("allows self-registration only for citizen accounts", () => {
    expect(isSelfRegistrationAllowed("citizen")).toBe(true);
    expect(isSelfRegistrationAllowed("admin")).toBe(false);
    expect(isSelfRegistrationAllowed("staff")).toBe(false);
    expect(isSelfRegistrationAllowed("responder")).toBe(false);
  });
});
