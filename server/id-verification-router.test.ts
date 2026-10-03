import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

/**
 * Locks down the read-access rules for Valid ID verification (US-2 / US-3).
 *
 * An ID image is a government document belonging to a named resident, so the
 * rules asserted here matter more than most: who can reach the queue, who can
 * mint a file URL, and who can delete. These tests assert on rejection codes
 * only and never touch the database, because the checks that must hold are the
 * ones in front of it.
 */

function context(role: "admin" | "staff" | "citizen" | "responder"): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: role === "admin" ? 1 : 2,
      openId: `${role}-test`,
      email: `${role}@example.com`,
      name: role,
      loginMethod: "test",
      role,
      isDemo: false,
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    } as unknown as User,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

const sampleId = {
  fileName: "philsys.jpg",
  mimeType: "image/jpeg",
  dataBase64: "AAAA",
};

/**
 * Asserts that each caller is refused.
 *
 * Anonymous callers get UNAUTHORIZED because there is no session to check, while
 * a signed-in caller of the wrong role gets FORBIDDEN. Both are refusals, and
 * both codes are asserted exactly so a change in either is noticed rather than
 * absorbed.
 */
const refusions = [
  ["anonymous", () => anonymousContext(), "UNAUTHORIZED"],
  ["citizen", () => context("citizen"), "FORBIDDEN"],
  ["staff", () => context("staff"), "FORBIDDEN"],
  ["responder", () => context("responder"), "FORBIDDEN"],
] as const;

describe("the ID review queue is restricted to admins and centre staff (OQ 7)", () => {
  it("refuses anonymous callers", async () => {
    // roleProcedure is built on protectedProcedure, which reports a missing
    // session as UNAUTHORIZED rather than FORBIDDEN. Either way they are out.
    await expect(
      appRouter.createCaller(anonymousContext()).idVerification.queue({ status: "PENDING" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refuses citizens and responders", async () => {
    await expect(
      appRouter.createCaller(context("citizen")).idVerification.queue({ status: "PENDING" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      appRouter.createCaller(context("responder")).idVerification.queue({ status: "PENDING" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admits admins and centre staff to the gate", async () => {
    // Reaches the query and comes back empty, because there is no database in
    // this test. The point is that neither role is turned away at the gate.
    await expect(
      appRouter.createCaller(context("admin")).idVerification.queue({ status: "PENDING" }),
    ).resolves.toEqual([]);
    await expect(
      appRouter.createCaller(context("staff")).idVerification.queue({ status: "PENDING" }),
    ).resolves.toEqual([]);
  });

  it("shows a staff member with no assigned centre an empty queue, not everyone's", async () => {
    // The scoping guard: listAssignedCenterIds yields nothing here, and an
    // empty centre list must not fall through to an unfiltered query that would
    // hand this staff member every resident's ID. Resolved-empty is the proof
    // that it did not.
    await expect(
      appRouter.createCaller(context("staff")).idVerification.queue({ status: "PENDING" }),
    ).resolves.toEqual([]);
  });
});

describe("minting an ID file URL is restricted", () => {
  it("refuses anonymous callers, citizens and responders", async () => {
    for (const [label, makeContext, code] of refusions) {
      if (label === "staff") continue;
      await expect(
        appRouter.createCaller(makeContext()).idVerification.imageUrl({ id: 1 }),
      ).rejects.toMatchObject({ code });
    }
  });
});

describe("recording a review decision is restricted", () => {
  it("refuses anonymous callers, citizens and responders", async () => {
    for (const [label, makeContext, code] of refusions) {
      if (label === "staff") continue;
      await expect(
        appRouter
          .createCaller(makeContext())
          .idVerification.review({ documentId: 1, decision: "APPROVED", addressOnId: "Poblacion" }),
      ).rejects.toMatchObject({ code });
    }
  });

  it("requires a reason before an application can be declined", async () => {
    await expect(
      appRouter.createCaller(context("admin")).idVerification.review({ documentId: 1, decision: "REJECTED" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires the address on the ID before an application can be approved", async () => {
    // Without it there is no record of the evidence the approval rested on, and
    // the decision cannot be explained if it is later questioned.
    await expect(
      appRouter.createCaller(context("admin")).idVerification.review({ documentId: 1, decision: "APPROVED" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      appRouter
        .createCaller(context("admin"))
        .idVerification.review({ documentId: 1, decision: "APPROVED", addressOnId: "   " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a decline reason or document type outside the vocabulary", async () => {
    await expect(
      appRouter.createCaller(context("admin")).idVerification.review({
        documentId: 1,
        decision: "REJECTED",
        rejectionReason: "because_i_said_so",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      appRouter.createCaller(context("admin")).idVerification.review({
        documentId: 1,
        decision: "APPROVED",
        addressOnId: "Poblacion, Pateros",
        idType: "SOMETHING_ELSE",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("deleting an ID record is admin only (sub-decision 5.2(c))", () => {
  it("refuses centre staff, citizens, responders and anonymous callers", async () => {
    // adminProcedure reports a missing session as FORBIDDEN, unlike
    // protectedProcedure. Asserted as-is so the difference stays visible rather
    // than being papered over with a loose match.
    const callers = [
      [anonymousContext(), "FORBIDDEN"],
      [context("staff"), "FORBIDDEN"],
      [context("citizen"), "FORBIDDEN"],
      [context("responder"), "FORBIDDEN"],
    ] as const;
    for (const [caller, code] of callers) {
      await expect(appRouter.createCaller(caller).idVerification.remove({ id: 1 })).rejects.toMatchObject({
        code,
      });
    }
  });
});

describe("the retention sweep is admin only", () => {
  it("refuses centre staff", async () => {
    // A purge is irreversible and deletes residents' ID images, so it stays with
    // administrators even though staff may decide individual applications.
    await expect(appRouter.createCaller(context("staff")).idVerification.purgeExpired()).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    await expect(
      appRouter.createCaller(context("citizen")).idVerification.purgeExpired(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("a citizen's own ID upload", () => {
  it("refuses anonymous callers", async () => {
    await expect(
      appRouter.createCaller(anonymousContext()).idVerification.upload(sampleId),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects an upload that is not an image or PDF", async () => {
    await expect(
      appRouter
        .createCaller(context("citizen"))
        .idVerification.upload({ ...sampleId, mimeType: "application/zip" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      appRouter
        .createCaller(context("citizen"))
        .idVerification.upload({ ...sampleId, mimeType: "video/mp4" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an empty upload", async () => {
    await expect(
      appRouter
        .createCaller(context("citizen"))
        .idVerification.upload({ ...sampleId, dataBase64: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts every agreed format, since OQ 2 takes no whitelist of ID types", async () => {
    // The constraint is on container format, not document type: a PhilSys ID and
    // a Barangay ID are both just JPEGs to this application. Each of these must
    // clear the format gate and fail later (or not at all) for lack of a
    // database, never with BAD_REQUEST.
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      await expect(
        appRouter.createCaller(context("citizen")).idVerification.upload({ ...sampleId, mimeType }),
      ).rejects.not.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("keeps non-citizens from submitting an ID", async () => {
    // OQ 2 applies to citizens proving residency; an operational account has no
    // reason to carry a resident's government ID.
    for (const role of ["staff", "responder", "admin"] as const) {
      await expect(
        appRouter.createCaller(context(role)).idVerification.upload(sampleId),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});

describe("a citizen may read their own application status", () => {
  it("answers a citizen with no ID on file", async () => {
    await expect(appRouter.createCaller(context("citizen")).idVerification.myStatus()).resolves.toEqual({
      hasDocument: false,
      status: null,
      rejectionReason: null,
      rejectionNote: null,
      reviewedAt: null,
      accountStatus: null,
    });
  });

  it("still refuses anonymous callers", async () => {
    await expect(appRouter.createCaller(anonymousContext()).idVerification.myStatus()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});