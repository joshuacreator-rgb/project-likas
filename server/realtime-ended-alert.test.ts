import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  broadcastAlert,
  broadcastAlertEnded,
  subscribeRealtime,
} from "./_core/realtime";
import type { RealtimeStreamPayload } from "../shared/citizen";

/**
 * The operations alert center shows a role everything it may see (admins see
 * all). An ended alert must therefore reach admin dashboards too, otherwise a
 * resolved report's CITIZEN_EMERGENCY alert keeps showing as ACTIVE on an open
 * admin view — the §25 "alert stays active after the report is done" bug.
 */

function makeAlert(
  overrides: { targetAudience?: "RESPONDERS" | "ALL_USERS"; id?: number } = {}
) {
  return {
    id: overrides.id ?? 1,
    title: "Flood warning",
    message: "Water level rising",
    alertType: "CITIZEN_EMERGENCY",
    priority: "HIGH" as const,
    targetAudience: (overrides.targetAudience ?? "RESPONDERS") as
      | "RESPONDERS"
      | "ALL_USERS",
    isActive: false,
    createdAt: new Date(),
  };
}

describe("broadcastAlertEnded delivery", () => {
  const received: Record<string, RealtimeStreamPayload[]> = {};
  const unsubscribe: Array<() => void> = [];

  function subscribe(role: string) {
    received[role] = [];
    unsubscribe.push(subscribeRealtime((payload) => received[role].push(payload), role));
  }

  beforeEach(() => {
    Object.keys(received).forEach((k) => delete received[k]);
  });

  afterEach(() => {
    let fn: (() => void) | undefined;
    while ((fn = unsubscribe.pop())) fn();
    Object.keys(received).forEach((k) => delete received[k]);
  });

  it("reaches admin and responder dashboards for a RESPONDERS-targeted alert", () => {
    subscribe("admin");
    subscribe("responder");
    subscribe("staff");
    subscribe("citizen");

    broadcastAlertEnded(makeAlert({ targetAudience: "RESPONDERS" }));

    expect(received.admin).toHaveLength(1);
    expect(received.responder).toHaveLength(1);
    // Targeted audiences stay targeted: staff and citizens never received the
    // live RESPONDERS alert, so they must not receive the end either.
    expect(received.staff).toHaveLength(0);
    expect(received.citizen).toHaveLength(0);
  });

  it("still broadcasts ALL_USERS ends to every role", () => {
    subscribe("admin");
    subscribe("staff");
    subscribe("responder");

    broadcastAlertEnded(makeAlert({ targetAudience: "ALL_USERS" }));

    expect(received.admin).toHaveLength(1);
    expect(received.staff).toHaveLength(1);
    expect(received.responder).toHaveLength(1);
  });

  it("keeps regular create broadcasts audience-limited (admin sees no RESPONDERS create)", () => {
    subscribe("admin");
    subscribe("responder");

    broadcastAlert(makeAlert({ targetAudience: "RESPONDERS" }), "RESPONDERS");

    expect(received.admin).toHaveLength(0);
    expect(received.responder).toHaveLength(1);
  });
});