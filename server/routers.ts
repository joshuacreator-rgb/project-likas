import { z } from "zod";
import { jwtVerify, SignJWT } from "jose";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { newsRouter } from "./news";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { clearRateLimit, enforceRateLimit } from "./_core/rateLimit";
import { getResourceStatus, canTransitionReport, type ReportStatus } from "../shared/operations";
import { sendInvitationEmail, sendPasswordResetEmail } from "./_core/email";
import {
  isRoleSelectionAllowed,
  isSelfRegistrationAllowed,
  requiresTwoFactor,
} from "../shared/roles";
import {
  acceptInvitation,
  archiveCenter,
  assignCenterStaff,
  beginTwoFactorSetup,
  changeLocalPassword,
  confirmTwoFactorSetup,
  countActiveAdmins,
  createAlert,
  createCitizenIdDocument,
  createInvitation,
  createResponderAction,
  createResource,
  createRiskReport,
  createRoleChangeRequest,
  createSafetyAdvice,
  deleteSafetyAdvice,
  disableTwoFactor,
  getOperationsSummary,
  getPublicSmsSettings,
  getEvacueeById,
  getAlertById,
  getResourceById,
  getRiskReportById,
  getRoleChangeRequest,
  getIdDocumentById,
  getLatestIdDocumentForUser,
  getPendingIdDocumentForUser,
  refreshApprovedIdPurgeDates,
  getSafetyAdviceById,
  getSafetyAdviceBySlug,
  getSettings,
  getTwoFactorStatus,
  getUserById,
  getWeatherSnapshot,
  issuePasswordReset,
  listActivityLogs,
  listAdviceSteps,
  listAlerts,
  listAssignedCenterIds,
  listCenters,
  listCentersForUser,
  listDemoAccounts,
  listEvacuees,
  listEvacueesForCenters,
  listEvidenceForReport,
  listIdDocumentsForReview,
  listInvitations,
  listPublishedAdviceWithSteps,
  listResources,
  listResourcesForCenters,
  listResourceTransactions,
  listResponderActions,
  listRiskReports,
  listRiskReportsForUser,
  listResponders,
  listSafetyAdvice,
  listUsers,
  listRoleChangeRequests,
  logActivity,
  provisionDemoAccount,
  provisionDemoAccounts,
  queueReportExport,
  registerEvacuee,
  registerLocalUser,
  reviewIdDocument,
  deleteIdDocument,
  endAlert,
  endAlertsForReport,
  purgeExpiredIdDocuments,
  updateUserApproval,
  releaseEvacuee,
  removeResource,
  resetLocalPassword,
  revokeDemoAccount,
  setRoleChangeRequestStatus,
  setSafetyAdviceStatus,
  transactResource,
  transferEvacuee,
  updateResource,
  updateRiskReport,
  updateSafetyAdvice,
  updateSetting,
  updateUserRole,
  uploadAdviceStepImage,
  uploadEvidence,
  recordEvidenceUploadFailure,
  upsertCenter,
  verifyLocalCredentials,
  getUserByEmail,
  verifyUserTotp,
} from "./db";
import { accessDenialReason, canAccessReport } from "./report-access";
import { broadcastAlert, broadcastAlertEnded, broadcastAssignment, broadcastEvacuee, broadcastIncident } from "./_core/realtime";
import { toCitizenEmergencyNotification } from "../shared/citizen";
import {
  adviceCategoryOrder,
  canTransitionAdviceStatus,
  isAdviceDraftPublishable,
  validateAdviceDraft,
} from "../shared/advice";
import {
  checkIdFileSize,
  evaluatePaterosResidency,
  idDocumentTypes,
  idRejectionReasons,
  isAllowedIdMimeType,
  isIdDocumentType,
  isIdRejectionReason,
  maskIdNumber,
} from "../shared/idVerification";
import { storageDelete, storageGetSignedUrl, storagePut } from "./storage";

const allowedRoles = [
  "admin",
  "staff",
  "responder",
  "citizen",
  "user",
] as const;
const roleProcedure = (roles: readonly string[]) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.user.role))
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Your role cannot perform this operation",
      });
    return next();
  });
type AdviceCategoryValue = (typeof adviceCategoryOrder)[number];
const adviceCategoryValues = [
  ...adviceCategoryOrder,
] as [AdviceCategoryValue, ...AdviceCategoryValue[]];

/** Shared content fields for create and update so both stay in lockstep. */
const adviceContentShape = {
  category: z.enum(adviceCategoryValues),
  title: z.string().min(3).max(180),
  titleFilipino: z.string().max(180).nullish(),
  summary: z.string().min(10).max(600),
  summaryFilipino: z.string().max(600).nullish(),
  body: z.string().min(10).max(20000),
  bodyFilipino: z.string().max(20000).nullish(),
  isEmergency: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(999).nullish(),
};

/** One step-by-step photo instruction. Text and photo are both optional. */
const adviceStepShape = z.object({
  title: z.string().max(180).nullish(),
  titleFilipino: z.string().max(180).nullish(),
  instruction: z.string().max(2000).nullish(),
  instructionFilipino: z.string().max(2000).nullish(),
  imageUrl: z.string().max(1000).nullish(),
  imageKey: z.string().max(500).nullish(),
});
const reportInput = z.object({
  reportCode: z.string().min(4).max(32),
  reportType: z.string().min(2).max(80),
  description: z.string().min(5),
  location: z.string().min(2),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
});
const evacueeInput = z.object({
  firstName: z.string().min(1),
  middleName: z.string().optional(),
  lastName: z.string().min(1),
  age: z.number().int().min(0).max(120),
  sex: z
    .enum(["FEMALE", "MALE", "OTHER", "UNSPECIFIED"])
    .default("UNSPECIFIED"),
  contactNumber: z.string().optional(),
  address: z.string().optional(),
  barangay: z.string().optional(),
  emergencyContact: z.string().optional(),
  medicalNotes: z.string().optional(),
  specialNeeds: z.string().optional(),
  centerId: z.number().int().positive(),
});
const centerInput = z.object({
  centerCode: z.string().min(2).max(32),
  name: z.string().min(2),
  nameFilipino: z.string().max(180).optional(),
  address: z.string().min(2),
  addressFilipino: z.string().optional(),
  barangay: z.string().min(2),
  latitude: z.string(),
  longitude: z.string(),
  maximumCapacity: z.number().int().positive(),
  currentOccupancy: z.number().int().min(0).default(0),
  contactPerson: z.string().optional(),
  contactNumber: z.string().optional(),
  status: z
    .enum(["OPEN", "FULL", "CLOSED", "UNDER_MAINTENANCE", "EMERGENCY_ONLY"])
    .default("OPEN"),
  facilities: z.string().optional(),
  description: z.string().optional(),
});
const publicUser = (user: Awaited<ReturnType<typeof verifyLocalCredentials>>) =>
  user && {
    id: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    loginMethod: user.loginMethod,
    role: user.role,
    phone: user.phone,
    isDemo: user.isDemo,
    demoExpiresAt: user.demoExpiresAt,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSignedIn: user.lastSignedIn,
  };
const sessionKey = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not configured. Set JWT_SECRET before starting the server."
    );
  }
  return new TextEncoder().encode(secret);
};
async function issueLocalSession(
  ctx: { res: any; req: any },
  user: NonNullable<Awaited<ReturnType<typeof verifyLocalCredentials>>>
) {
  const token = await new SignJWT({ role: user.role, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(sessionKey());
  ctx.res.cookie("likas_session", token, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return { user: publicUser(user), requiresTwoFactor: false as const };
}

const idDocumentTypeValues = Object.keys(idDocumentTypes) as [
  (keyof typeof idDocumentTypes),
  ...(keyof typeof idDocumentTypes)[],
];
const idRejectionReasonValues = Object.keys(idRejectionReasons) as [
  (keyof typeof idRejectionReasons),
  ...(keyof typeof idRejectionReasons)[],
];

/** A Valid ID as it arrives from the browser. Shared by registration and resubmission. */
const uploadedIdShape = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  dataBase64: z.string().min(1),
});

/**
 * Validates and stores an uploaded ID, then records it against a user.
 *
 * Called from two places: the citizen's own registration, where there is no
 * session yet because an unapproved citizen cannot sign in, and the resubmission
 * route for a declined ID (US-4).
 *
 * The file is written to storage before the database row and removed again if
 * the row cannot be created. Storing afterwards would leak an orphan object in
 * the bucket on every failure, and orphans of government IDs are exactly what
 * the retention rules exist to prevent.
 */
async function attachCitizenIdDocument(input: {
  userId: number;
  centerId: number | null;
  supersedesId?: number | null;
  upload: z.infer<typeof uploadedIdShape>;
}) {
  if (!isAllowedIdMimeType(input.upload.mimeType))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An ID must be a JPEG, PNG, WebP or PDF file.",
    });

  const bytes = Buffer.from(
    input.upload.dataBase64.replace(/^data:[^;]+;base64,/, ""),
    "base64",
  );
  const sizeCheck = checkIdFileSize(bytes.byteLength);
  if (!sizeCheck.ok) throw new TRPCError({ code: "BAD_REQUEST", message: sizeCheck.message });

  const cleanName = input.upload.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Namespaced by user id so one resident's documents are never mixed with
  // another's in the bucket, and so a single resident's set is easy to find.
  //
  // A storage backend failure is re-thrown as a TRPCError with a message safe to
  // show a resident. The underlying error names configuration variables and
  // hosts, which is exactly the sort of detail that does not belong in a
  // browser or in a resident's hands.
  let stored: Awaited<ReturnType<typeof storagePut>>;
  try {
    stored = await storagePut(
      `citizen-ids/${input.userId}/${cleanName}`,
      bytes,
      input.upload.mimeType,
    );
  } catch (error) {
    console.error("[ID upload] storage write failed", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "We could not save your ID right now. Your account was created — please try uploading it again.",
    });
  }

  try {
    return await createCitizenIdDocument({
      userId: input.userId,
      fileKey: stored.key,
      fileName: cleanName,
      mimeType: input.upload.mimeType,
      sizeBytes: bytes.byteLength,
      centerId: input.centerId,
      supersedesId: input.supersedesId ?? null,
    });
  } catch (error) {
    await storageDelete(stored.key).catch(() => {
      console.warn("[ID upload] orphan cleanup failed for", stored.key);
    });
    throw error;
  }
}

export const appRouter = router({
  system: systemRouter,
  news: newsRouter,
  /**
   * Citizen Valid ID verification (US-2 / US-3).
   *
   * Read access follows OQ 7 and the accepted sub-decisions:
   *   - admins and centre staff may view, approve and decline
   *   - only admins may delete, because deletion is irreversible
   *   - citizens reach only their own status and their own upload
   *
   * `imageUrl` is the only way an ID file leaves the server. It mints a
   * short-lived signed URL after an authorization check and writes an audit
   * entry, because `storagePut`'s own path is unsigned and must never be used
   * for a government ID.
   */
  idVerification: router({
    /**
     * The applicant's own current state. Safe for a pending citizen to call: it
     * reports only their own document's status and reason, never the file and
     * never the address read off it.
     */
    myStatus: protectedProcedure.query(async ({ ctx }) => {
      const pending = await getPendingIdDocumentForUser(ctx.user.id);
      if (pending)
        return {
          hasDocument: true as const,
          status: pending.status,
          createdAt: pending.createdAt,
          purgeAfter: pending.purgeAfter,
          fileName: pending.fileName,
          mimeType: pending.mimeType,
          // Deliberately absent: fileKey, addressOnId, idNumberMasked.
        };

      const latest = await getLatestIdDocumentForUser(ctx.user.id);
      const user = await getUserById(ctx.user.id);
      return {
        hasDocument: false as const,
        status: latest?.status ?? null,
        rejectionReason: latest?.rejectionReason ?? null,
        rejectionNote: latest?.rejectionNote ?? null,
        reviewedAt: latest?.reviewedAt ?? null,
        accountStatus: user?.accountStatus ?? null,
      };
    }),

    /**
     * Uploads an ID for the signed-in citizen. This is the resubmission path
     * (US-4) for someone whose ID was declined.
     *
     * Scoped to `ctx.user.id` with no userId in the input: a citizen must not be
     * able to attach a document to somebody else's application by changing a
     * number in the request.
     */
    upload: protectedProcedure.input(uploadedIdShape).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "citizen")
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only citizen accounts submit a Valid ID.",
        });

      // One unreviewed upload at a time. A second would otherwise sit in the
      // queue ahead of the first and leave the reviewer choosing between two
      // documents the applicant may not know differ.
      const existing = await getPendingIdDocumentForUser(ctx.user.id);
      if (existing)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already have an ID awaiting review.",
        });

      const latest = await getLatestIdDocumentForUser(ctx.user.id);
      const documentId = await attachCitizenIdDocument({
        userId: ctx.user.id,
        centerId: null,
        supersedesId: latest && latest.status === "REJECTED" ? latest.id : null,
        upload: input,
      });

      await logActivity({
        actorId: ctx.user.id,
        action: "ID_DOCUMENT_UPLOADED",
        entityType: "citizen_id_document",
        entityId: documentId,
        metadata: JSON.stringify({ resubmission: Boolean(latest) }),
      });

      return { id: documentId };
    }),

    /**
     * The review queue. Centre staff are scoped to their own centres, so a
     * staff member never sees applicants assigned elsewhere (sub-decision 5.2(b)).
     */
    queue: roleProcedure(["admin", "staff"])
      .input(
        z
          .object({ status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING") })
          .nullish(),
      )
      .query(async ({ ctx, input }) => {
        const centerIds =
          ctx.user.role === "admin" ? undefined : await listAssignedCenterIds(ctx.user.id);
        const rows = await listIdDocumentsForReview({
          status: input?.status ?? "PENDING",
          centerIds,
        });

        // Each row carries an advisory read of the address so staff need not
        // retype it to compare against the Pateros barangays. It advises; it
        // does not decide, because OQ 2 verifies no ID type and staff judgement
        // is the only control.
        return rows.map(row => ({ ...row, residency: evaluatePaterosResidency(row.addressOnId) }));
      }),

    /**
     * Mints a short-lived URL for one ID image after checking the caller may see
     * it, and records the view. This is the only path by which an ID file ever
     * reaches anyone.
     */
    imageUrl: roleProcedure(["admin", "staff"])
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const document = await getIdDocumentById(input.id);
        if (!document)
          throw new TRPCError({ code: "NOT_FOUND", message: "That ID document no longer exists." });
        if (document.purgedAt)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That ID image was deleted under the retention policy.",
          });

        // Centre scoping is enforced per document, not only in the queue query,
        // so a crafted request for a known id cannot walk around it.
        if (ctx.user.role === "staff") {
          const centerIds = await listAssignedCenterIds(ctx.user.id);
          if (document.centerId === null || !centerIds.includes(document.centerId))
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "This applicant is not assigned to your centre.",
            });
        }

        const url = await storageGetSignedUrl(document.fileKey);
        await logActivity({
          actorId: ctx.user.id,
          action: "ID_DOCUMENT_VIEWED",
          entityType: "citizen_id_document",
          entityId: document.id,
          metadata: JSON.stringify({ userId: document.userId }),
        });
        return { url, expiresInSeconds: 300 };
      }),

    /**
     * Records an approve or decline. OQ 7 admits centre staff; per sub-decision
     * 5.2(c) that right covers deciding only, never deleting.
     */
    review: roleProcedure(["admin", "staff"])
      .input(
        z.object({
          documentId: z.number().int().positive(),
          decision: z.enum(["APPROVED", "REJECTED"]),
          idType: z.enum(idDocumentTypeValues).nullish(),
          idNumber: z.string().max(60).nullish(),
          addressOnId: z.string().max(300).nullish(),
          rejectionReason: z.enum(idRejectionReasonValues).nullish(),
          rejectionNote: z.string().max(500).nullish(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.decision === "REJECTED" && !input.rejectionReason)
          throw new TRPCError({ code: "BAD_REQUEST", message: "A decline needs a reason." });
        if (input.decision === "APPROVED" && !input.addressOnId?.trim())
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Record the address on the ID so the approval can be explained later.",
          });

        const existing = await getIdDocumentById(input.documentId);
        if (!existing)
          throw new TRPCError({ code: "NOT_FOUND", message: "That ID document no longer exists." });

        if (ctx.user.role === "staff") {
          const centerIds = await listAssignedCenterIds(ctx.user.id);
          if (existing.centerId === null || !centerIds.includes(existing.centerId))
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "This applicant is not assigned to your centre.",
            });
        }

        const result = await reviewIdDocument({
          documentId: input.documentId,
          reviewerId: ctx.user.id,
          decision: input.decision,
          idType: input.idType ?? null,
          // Masked on the way in. The full number is never persisted, so it
          // cannot resurface from a later query or an export.
          idNumberMasked: maskIdNumber(input.idNumber) || null,
          addressOnId: input.addressOnId?.trim() || null,
          rejectionReason: input.rejectionReason ?? null,
          rejectionNote: input.rejectionNote?.trim() || null,
        });

        await logActivity({
          actorId: ctx.user.id,
          action: input.decision === "APPROVED" ? "ID_DOCUMENT_APPROVED" : "ID_DOCUMENT_REJECTED",
          entityType: "citizen_id_document",
          entityId: input.documentId,
          metadata: JSON.stringify({
            userId: result.userId,
            idType: input.idType ?? null,
            rejectionReason: input.rejectionReason ?? null,
          }),
        });

        return {
          userId: result.userId,
          accountStatus: input.decision,
          reviewedAt: result.reviewedAt,
        };
      }),

    /** Admin only (sub-decision 5.2(c)). Removes both the record and the file. */
    remove: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const result = await deleteIdDocument(input.id, ctx.user.id);
        if (!result.alreadyPurged) {
          await storageDelete(result.fileKey).catch(error => {
            // The record is already gone; a leftover object is an operational
            // problem to reconcile, not a reason to fail the caller's request.
            console.warn("[ID retention] file delete failed for", result.fileKey, error);
          });
        }
        return { removed: true as const, alreadyPurged: result.alreadyPurged };
      }),

    /**
     * Retention sweep (OQ 3). Admin-triggered rather than left on a timer, so
     * there is no unattended job holding credentials and every purge is
     * auditable.
     *
     * The refresh runs first: an account that has since deactivated starts its
     * one-year clock now, before the sweep decides what is already due.
     */
    purgeExpired: adminProcedure.mutation(async ({ ctx }) => {
      const scheduled = await refreshApprovedIdPurgeDates();
      const result = await purgeExpiredIdDocuments();
      for (const key of result.keys) {
        await storageDelete(key).catch(error =>
          console.warn("[ID retention] file delete failed for", key, error),
        );
      }
      await logActivity({
        actorId: ctx.user.id,
        action: "ID_DOCUMENTS_PURGED",
        entityType: "citizen_id_document",
        entityId: null,
        metadata: JSON.stringify({ purged: result.purged, newlyScheduled: scheduled }),
      });
      return { purged: result.purged, newlyScheduled: scheduled };
    }),
  }),
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      const user = ctx.user;
      return (
        user && {
          id: user.id,
          openId: user.openId,
          name: user.name,
          email: user.email,
          loginMethod: user.loginMethod,
          role: user.role,
          phone: user.phone,
          isDemo: user.isDemo,
          demoExpiresAt: user.demoExpiresAt,
          twoFactorEnabled: user.twoFactorEnabled,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastSignedIn: user.lastSignedIn,
        }
      );
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
      ctx.res.clearCookie("likas_session", cookieOptions);
      return { success: true } as const;
    }),
  }),
  localAuth: router({
    register: publicProcedure
      .input(
        z.object({
          email: z
            .string()
            .email()
            .refine(email => email.toLowerCase().endsWith("@gmail.com"), {
              message: "Use a Gmail address ending in @gmail.com.",
            }),
          password: z.string().min(10),
          firstName: z.string().trim().min(2).max(80),
          lastName: z.string().trim().min(2).max(80),
          middleName: z.string().trim().max(80).nullable().optional(),
          address: z.string().trim().min(2).max(500),
          age: z.number().int().min(0).max(120),
          phone: z
            .string()
            .regex(/^09\d{9}$/, "Enter an 11-digit mobile number starting with 09."),
          role: z
            .enum(["admin", "staff", "responder", "citizen"])
            .default("citizen"),
          // Optional rather than required. OQ 2 accepts every valid ID type and
          // OQ 1 proves residency from it, so an ID is the primary evidence a
          // reviewer has, but making it mandatory at this stage would lock out
          // anyone whose only document is a phone photo of a barangay clearance
          // they have not yet collected. A registration without one is approved
          // on judgement, and flagged as having no ID on file.
          //
          // That flag is load-bearing, and it used to be a lie. `registerLocalUser`
          // hardcoded PENDING for every registration, so an ID-less resident was
          // refused at login, produced no citizen_id_documents row, and therefore
          // appeared in no review queue, which lists documents rather than
          // accounts. No staff screen offered a list of PENDING accounts to approve
          // from, so nobody could ever release them. `hasValidId` below now decides
          // the status, and the client is told which case it is in.
          validId: uploadedIdShape.nullish(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        enforceRateLimit(ctx.req, `register:${input.email}`, 5, 60 * 60 * 1000);
        if (!isSelfRegistrationAllowed(input.role))
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Only Citizen accounts can self-register. Operational roles require an Administrator invitation or demo provisioning.",
          });
        const user = await registerLocalUser({
          email: input.email,
          password: input.password,
          firstName: input.firstName,
          middleName: input.middleName?.trim() || null,
          lastName: input.lastName,
          address: input.address,
          age: input.age,
          phone: input.phone,
          name: [input.firstName, input.middleName?.trim(), input.lastName]
            .filter(Boolean)
            .join(" "),
          role: input.role,
          hasValidId: Boolean(input.validId),
        });

        // The ID is attached after the account is created, not before.
        //
        // It used to be validated and stored first, so that a bad upload failed
        // registration outright rather than leaving an account that can never be
        // approved. That was sound in principle but wrong in practice: a storage
        // outage destroyed everything the resident had just typed, which is a far
        // worse outcome than an account awaiting an ID.
        //
        // A failed upload is now survivable because `uploadPendingId` below lets
        // the resident retry using the approval token, no sign-in required. A
        // pending citizen cannot sign in, so that route is the only way back and
        // it has to exist for this to be safe.
        let idDocumentId: number | null = null;
        let idUploadFailed = false;
        if (input.validId) {
          try {
            idDocumentId = await attachCitizenIdDocument({
              userId: user.userId,
              centerId: null,
              upload: input.validId,
            });
            await logActivity({
              actorId: null,
              action: "ID_DOCUMENT_UPLOADED",
              entityType: "citizen_id_document",
              entityId: idDocumentId,
              metadata: JSON.stringify({ userId: user.userId, via: "registration" }),
            });
          } catch (error) {
            idUploadFailed = true;
            // Logged with the real reason for our own diagnosis; the resident
            // gets a plain message. Error text can carry storage credentials'
            // hostnames and configuration names, which have no business in a
            // browser.
            console.error("[registration] ID upload failed for", user.userId, error);
            await logActivity({
              actorId: null,
              action: "ID_DOCUMENT_UPLOAD_FAILED",
              entityType: "user",
              entityId: user.userId,
              metadata: JSON.stringify({ via: "registration" }),
            }).catch(() => {
              /* never fail registration over an audit write */
            });
          }
        }
        const approvalToken = await new SignJWT({ type: "citizen-approval" })
          .setProtectedHeader({ alg: "HS256" })
          .setSubject(String(user.userId))
          .setIssuedAt()
          .setExpirationTime("1d")
          .sign(sessionKey());
        return {
          // A registration with a document attached waits for a reviewer,
          // because there is a document to review. A registration without one is
          // approved on judgement, which is what the comment above has always
          // claimed. Reporting this truthfully matters: the client uses it to
          // decide whether to show the resident a waiting screen at all.
          approvalRequired: Boolean(input.validId),
          email: user.email,
          approvalToken,
          idDocumentId,
          idUploadFailed,
        };
      }),

    /**
     * Retries the ID upload for a citizen whose account exists but whose ID
     * never made it into storage.
     *
     * Authorized by the registration approval token rather than a session,
     * because a PENDING citizen cannot sign in: `login` refuses pending
     * accounts and `completeApproval` only issues a session once the account is
     * already approved. Without this route, an account created during a storage
     * outage would be permanently stuck.
     *
     * The token is scoped to one user id and expires in a day, and the upload is
     * bound to that same user id, so a token cannot be used to attach a document
     * to somebody else's application.
     */
    uploadPendingId: publicProcedure
      .input(
        z.object({
          token: z.string().min(20),
          validId: uploadedIdShape,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Before the work, not after: the point is to cap how much upload work an
        // attacker can queue with one token. Keyed on the token so two residents
        // registering together cannot exhaust each other's budget.
        enforceRateLimit(ctx.req, `pending-id:${input.token.slice(-16)}`, 10, 60 * 60 * 1000);

        let userId = 0;
        try {
          const { payload } = await jwtVerify(input.token, sessionKey());
          if (payload.type !== "citizen-approval" || typeof payload.sub !== "string") {
            throw new Error("Invalid approval token");
          }
          userId = Number(payload.sub);
        } catch {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "This registration session has expired. Please register again.",
          });
        }

        const user = await getUserById(userId);
        if (!user || user.role !== "citizen")
          throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found." });
        if (user.accountStatus === "APPROVED")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Your account is already approved. Upload your ID from your account page.",
          });

        const existing = await getPendingIdDocumentForUser(userId);
        if (existing)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You already have an ID awaiting review.",
          });

        const latest = await getLatestIdDocumentForUser(userId);
        const documentId = await attachCitizenIdDocument({
          userId,
          centerId: null,
          supersedesId: latest && latest.status === "REJECTED" ? latest.id : null,
          upload: input.validId,
        });

        await logActivity({
          actorId: userId,
          action: "ID_DOCUMENT_UPLOADED",
          entityType: "citizen_id_document",
          entityId: documentId,
          metadata: JSON.stringify({ via: "approval-token-retry" }),
        });

        return { id: documentId };
      }),
    checkApproval: publicProcedure
      .input(z.object({ token: z.string().min(20) }))
      .query(async ({ input }) => {
        let userId = 0;
        try {
          const { payload } = await jwtVerify(input.token, sessionKey());
          if (payload.type !== "citizen-approval" || typeof payload.sub !== "string") throw new Error("Invalid approval token");
          userId = Number(payload.sub);
        } catch {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "The registration approval session has expired." });
        }
        const user = await getUserById(userId);
        if (!user || user.role !== "citizen") throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found." });
        return { accountStatus: user.accountStatus };
      }),
    completeApproval: publicProcedure
      .input(z.object({ token: z.string().min(20) }))
      .mutation(async ({ ctx, input }) => {
        let userId = 0;
        try {
          const { payload } = await jwtVerify(input.token, sessionKey());
          if (payload.type !== "citizen-approval" || typeof payload.sub !== "string") throw new Error("Invalid approval token");
          userId = Number(payload.sub);
        } catch {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "The registration approval session has expired." });
        }
        const user = await getUserById(userId);
        if (!user || user.role !== "citizen") throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found." });
        if (user.accountStatus !== "APPROVED") throw new TRPCError({ code: "FORBIDDEN", message: "This citizen account has not been approved." });
        return issueLocalSession(ctx, user);
      }),
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string().min(1),
          role: z
            .enum(["admin", "staff", "responder", "citizen", "user"])
            .default("citizen"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        enforceRateLimit(ctx.req, `login:${input.email}`, 10, 60 * 1000);
        const user = await verifyLocalCredentials(input.email, input.password);
        if (!user)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        if (!isRoleSelectionAllowed(input.role, user.role))
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `This account is registered as ${user.role}. Choose that role to continue.`,
          });
        if (user.accountStatus === "PENDING")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Your account is waiting for Administrator approval.",
          });
        if (user.accountStatus === "REJECTED")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Your registration was not approved. Contact an Administrator.",
          });
        if (requiresTwoFactor(user.role, user.twoFactorEnabled)) {
          clearRateLimit(ctx.req, `login:${input.email}`);
          const challengeToken = await new SignJWT({
            type: "2fa",
            role: user.role,
            email: user.email,
          })
            .setProtectedHeader({ alg: "HS256" })
            .setSubject(String(user.id))
            .setIssuedAt()
            .setExpirationTime("5m")
            .sign(sessionKey());
          return {
            user: publicUser(user),
            requiresTwoFactor: true as const,
            challengeToken,
          };
        }
        clearRateLimit(ctx.req, `login:${input.email}`);
        return issueLocalSession(ctx, user);
      }),
    demoLogin: publicProcedure
      .input(z.object({ role: z.enum(["admin", "staff", "responder", "citizen"]) }))
      .mutation(async ({ ctx, input }) => {
        enforceRateLimit(ctx.req, "demo-login", 10, 60 * 60 * 1000);
        if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO_LOGIN !== "true") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Demo access is disabled in production." });
        }
        const created = await provisionDemoAccount(
          { name: `${input.role[0].toUpperCase()}${input.role.slice(1)} demo`, role: input.role, expiresInDays: 1 },
          0
        );
        const user = await getUserById(created.userId);
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Demo account could not be loaded." });
        return issueLocalSession(ctx, user);
      }),
    verifyTwoFactor: publicProcedure
      .input(
        z.object({
          challengeToken: z.string().min(20),
          code: z.string().regex(/^\d{6}$/),
        })
      )
      .mutation(async ({ ctx, input }) => {
        enforceRateLimit(ctx.req, "2fa", 10, 60 * 1000);
        let userId = 0;
        try {
          const { payload } = await jwtVerify(
            input.challengeToken,
            sessionKey()
          );
          if (payload.type !== "2fa" || typeof payload.sub !== "string")
            throw new Error("Invalid challenge");
          userId = Number(payload.sub);
        } catch {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "The security challenge has expired. Sign in again.",
          });
        }
        const user = await getUserById(userId);
        if (!user || !(await verifyUserTotp(userId, input.code)))
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "That verification code is not valid.",
          });
        return issueLocalSession(ctx, user);
      }),
    forgotPassword: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        enforceRateLimit(ctx.req, `reset-request:${input.email}`, 5, 60 * 60 * 1000);
        const token = await issuePasswordReset(input.email);
        const user = await getUserByEmail(input.email);
        const baseUrl = process.env.PUBLIC_URL ?? "http://localhost:5173";
        const resetUrl = `${baseUrl}/recover?email=${encodeURIComponent(input.email)}&token=${encodeURIComponent(token)}`;
        try {
          await sendPasswordResetEmail({
            email: input.email,
            name: user?.name ?? input.email,
            resetUrl,
          });
        } catch (error) {
          console.warn("[PasswordReset] Recovery email failed; token remains valid:", error);
        }
        return {
          accepted: true as const,
          devToken: process.env.NODE_ENV === "production" ? undefined : token,
          resetUrl: process.env.NODE_ENV === "production" ? undefined : resetUrl,
        };
      }),
    resetPassword: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          token: z.string().min(10),
          newPassword: z.string().min(10),
        })
      )
      .mutation(({ ctx, input }) => {
        enforceRateLimit(ctx.req, `reset:${input.email}`, 10, 60 * 60 * 1000);
        return resetLocalPassword(input.email, input.token, input.newPassword);
      }),
    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(10),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.currentPassword === input.newPassword) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Your new password must be different from your current password.",
          });
        }

        // Bound attempts per user AND per IP. Without this, anyone holding a
        // stolen session could grind the current password offline-rate-limit
        // free, or simply lock the real owner out of their own account.
        enforceRateLimit(
          ctx.req,
          `change-password:${ctx.user.id}`,
          5,
          60 * 60 * 1000
        );
        try {
          return await changeLocalPassword(
            ctx.user.id,
            input.currentPassword,
            input.newPassword
          );
        } catch (error) {
          // A wrong current password is a failed authentication, not an
          // internal fault. Surfacing it as INTERNAL_SERVER_ERROR would also
          // expose whether the account exists to a caller probing the route.
          if (
            error instanceof Error &&
            error.message === "Current password is incorrect"
          ) {
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Current password is incorrect.",
            });
          }
          throw error;
        }
      }),
    acceptInvitation: publicProcedure
      .input(
        z.object({ token: z.string().min(20), password: z.string().min(10) })
      )
      .mutation(({ input }) => acceptInvitation(input.token, input.password)),
  }),
  operations: router({
    summary: protectedProcedure.query(() => getOperationsSummary()),
    centers: publicProcedure.query(({ ctx }) => ctx.user?.role === "staff" ? listCentersForUser(ctx.user.id) : listCenters()),
    evacuees: roleProcedure(["admin", "staff"])
      .input(z.object({ centerId: z.number().int().positive().optional() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role === "admin") return listEvacuees(input.centerId);
        const centerIds = await listAssignedCenterIds(ctx.user.id);
        if (input.centerId && !centerIds.includes(input.centerId)) return [];
        return input.centerId ? listEvacuees(input.centerId) : listEvacueesForCenters(centerIds);
      }),
    resources: roleProcedure(["admin", "staff", "responder", "citizen"])
      .input(z.object({ centerId: z.number().int().positive().optional() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role === "admin") return listResources(input.centerId);
        if (ctx.user.role !== "staff") return input.centerId ? listResources(input.centerId) : [];
        const centerIds = await listAssignedCenterIds(ctx.user.id);
        if (input.centerId && !centerIds.includes(input.centerId)) return [];
        return input.centerId ? listResources(input.centerId) : listResourcesForCenters(centerIds);
      }),
    resourceTransactions: roleProcedure(["admin", "staff"])
      .input(z.object({ resourceId: z.number().int().positive().optional() }))
      .query(({ input }) => listResourceTransactions(input.resourceId)),
    registerEvacuee: roleProcedure(["admin", "staff"])
      .input(evacueeInput)
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "staff" && !(await listAssignedCenterIds(ctx.user.id)).includes(input.centerId))
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage your assigned evacuation center." });
        const result = await registerEvacuee({ ...input, status: "ACTIVE" });
        broadcastEvacuee({ evacueeId: result.id, centerId: input.centerId, action: "REGISTERED" });
        await logActivity({
          actorId: ctx.user.id,
          action: "CREATE",
          entityType: "evacuee",
          entityId: result.id,
        });
        return result;
      }),
    transferEvacuee: roleProcedure(["admin", "staff"])
      .input(
        z.object({
          evacueeId: z.number().int().positive(),
          targetCenterId: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "staff") {
          const centerIds = await listAssignedCenterIds(ctx.user.id);
          const evacuee = await getEvacueeById(input.evacueeId);
          if (!evacuee || !centerIds.includes(evacuee.centerId) || !centerIds.includes(input.targetCenterId))
            throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage evacuees in your assigned center." });
        }
        const result = await transferEvacuee(
          input.evacueeId,
          input.targetCenterId
        );
        broadcastEvacuee({ evacueeId: input.evacueeId, centerId: input.targetCenterId, action: "TRANSFERRED" });
        await logActivity({
          actorId: ctx.user.id,
          action: "TRANSFER",
          entityType: "evacuee",
          entityId: input.evacueeId,
        });
        return result;
      }),
    releaseEvacuee: roleProcedure(["admin", "staff"])
      .input(z.object({ evacueeId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "staff") {
          const centerIds = await listAssignedCenterIds(ctx.user.id);
          const evacuee = await getEvacueeById(input.evacueeId);
          if (!evacuee || !centerIds.includes(evacuee.centerId))
            throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage evacuees in your assigned center." });
        }
        const result = await releaseEvacuee(input.evacueeId);
        broadcastEvacuee({ evacueeId: input.evacueeId, centerId: null, action: "RELEASED" });
        await logActivity({
          actorId: ctx.user.id,
          action: "RELEASE",
          entityType: "evacuee",
          entityId: input.evacueeId,
        });
        return result;
      }),
    transactResource: roleProcedure(["admin", "staff"])
      .input(
        z.object({
          resourceId: z.number().int().positive(),
          type: z.enum([
            "STOCK_IN",
            "STOCK_OUT",
            "TRANSFER",
            "BORROW",
            "RETURN",
          ]),
          quantity: z.number().int().positive(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "staff") {
          const resource = await getResourceById(input.resourceId);
          if (!resource || !(await listAssignedCenterIds(ctx.user.id)).includes(resource.centerId))
            throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage resources in your assigned center." });
        }
        const result = await transactResource(
          input.resourceId,
          ctx.user.id,
          input.type,
          input.quantity,
          input.notes
        );
        await logActivity({
          actorId: ctx.user.id,
          action: input.type,
          entityType: "resource",
          entityId: input.resourceId,
        });
        return result;
      }),
    reports: roleProcedure(allowedRoles).query(({ ctx }) => ctx.user.role === "admin" || ctx.user.role === "staff" || ctx.user.role === "responder" ? listRiskReports() : listRiskReportsForUser(ctx.user.id, ctx.user.role)),
    createRiskReport: roleProcedure([
      "admin",
      "staff",
      "responder",
      "citizen",
      "user",
    ])
      .input(reportInput)
      .mutation(async ({ ctx, input }) => {
        const created = await createRiskReport({
          ...input,
          reporterId: ctx.user.id,
          latitude: input.latitude?.toString(),
          longitude: input.longitude?.toString(),
        });
        const report = await getRiskReportById(created.id);
        if (!report) throw new Error("Created incident could not be loaded");
        await logActivity({
          actorId: ctx.user.id,
          action: "CREATE",
          entityType: "risk_report",
          entityId: report.id,
        });
        if (ctx.user.role === "citizen" || ctx.user.role === "user") {
          broadcastIncident(toCitizenEmergencyNotification(report));
          const coordinates = input.latitude != null && input.longitude != null
            ? ` Pin: https://www.google.com/maps/search/?api=1&query=${input.latitude},${input.longitude}`
            : "";
          try {
            const responderAlert = await createAlert({
              title: `${input.priority} citizen emergency`,
              message: `${input.reportType} reported at ${input.location}: ${input.description}.${coordinates}`,
              alertType: "CITIZEN_EMERGENCY",
              priority: input.priority,
              targetAudience: "RESPONDERS",
              reportId: report.id,
              createdBy: ctx.user.id,
            });
            const alert = await getAlertById(responderAlert.id);
            if (alert) broadcastAlert(alert, alert.targetAudience);
          } catch (error) {
            console.warn("[Operations] Citizen emergency notification failed:", error);
          }
        }
        return created;
      }),
    updateRiskReport: roleProcedure(["admin", "responder"])
      .input(
        z.object({
          reportId: z.number().int().positive(),
          status: z
            .enum([
              "PENDING",
              "VERIFIED",
              "IN_PROGRESS",
              "RESOLVED",
              "REJECTED",
            ])
            .optional(),
          assignedResponderId: z.number().int().positive().optional(),
          resolution: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { reportId, ...changes } = input;
        const report = await getRiskReportById(reportId);
        if (!report)
          throw new TRPCError({ code: "NOT_FOUND", message: "Incident not found." });
        if (ctx.user.role === "responder" && report.assignedResponderId !== ctx.user.id)
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only update incidents assigned to you." });
        if (
          changes.status &&
          !canTransitionReport(report.status as ReportStatus, changes.status as ReportStatus)
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `An incident cannot move from ${report.status} to ${changes.status}.`,
          });
        const result = await updateRiskReport(reportId, changes);
        // Closing an incident ends the alert that was raised with it. The
        // broadcast carries `isActive: false`, so every open dashboard drops
        // the alert the moment the report is done (client fix, backlog §25).
        if (changes.status === "RESOLVED" || changes.status === "REJECTED") {
          const endedAlerts = await endAlertsForReport(reportId);
          for (const endedAlert of endedAlerts) {
            broadcastAlertEnded(endedAlert);
          }
        }
        await logActivity({
          actorId: ctx.user.id,
          action: changes.status
            ? "INCIDENT_STATUS_CHANGED"
            : changes.assignedResponderId
              ? "RESPONDER_ASSIGNED"
              : changes.resolution
                ? "INCIDENT_RESOLUTION_ADDED"
                : "INCIDENT_UPDATED",
          entityType: "risk_report",
          entityId: reportId,
        });
        return result;
      }),
    incidentTimeline: roleProcedure(["admin", "responder"])
      .input(z.object({ reportId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const report = await getRiskReportById(input.reportId);
        if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Incident not found." });
        if (ctx.user.role === "responder" && report.assignedResponderId !== ctx.user.id)
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only view incidents assigned to you." });
        return { report, actions: await listResponderActions(input.reportId) };
      }),
    addResponderAction: roleProcedure(["admin", "responder"])
      .input(
        z.object({
          reportId: z.number().int().positive(),
          action: z.string().min(3),
          resourcesUsed: z.string().optional(),
          arrivalAt: z.date().optional(),
          completedAt: z.date().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "responder" && (await getRiskReportById(input.reportId))?.assignedResponderId !== ctx.user.id)
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only update incidents assigned to you." });
        const result = await createResponderAction({ ...input, responderId: ctx.user.id });
        await logActivity({
          actorId: ctx.user.id,
          action: "RESPONDER_ACTION_LOGGED",
          entityType: "risk_report",
          entityId: input.reportId,
        });
        return result;
      }),
    listResponders: roleProcedure(["admin", "staff"]).query(() => listResponders()),
    assignResponder: roleProcedure(["admin", "staff"])
      .input(
        z.object({
          reportId: z.number().int().positive(),
          responderId: z.number().int().positive().nullable(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const report = await getRiskReportById(input.reportId);
        if (!report)
          throw new TRPCError({ code: "NOT_FOUND", message: "Incident not found." });
        if (report.status === "RESOLVED" || report.status === "REJECTED")
          throw new TRPCError({ code: "BAD_REQUEST", message: "Closed incidents cannot be reassigned." });
        if (input.responderId !== null) {
          const responder = await getUserById(input.responderId);
          if (!responder || responder.role !== "responder")
            throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a responder account." });
        }
        await updateRiskReport(input.reportId, { assignedResponderId: input.responderId });
        await logActivity({
          actorId: ctx.user.id,
          action: input.responderId === null ? "RESPONDER_UNASSIGNED" : "RESPONDER_ASSIGNED",
          entityType: "risk_report",
          entityId: input.reportId,
        });
        broadcastAssignment({ reportId: input.reportId, assignedResponderId: input.responderId });
        return { reportId: input.reportId, assignedResponderId: input.responderId };
      }),
    claimIncident: roleProcedure(["responder"])
      .input(z.object({ reportId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const report = await getRiskReportById(input.reportId);
        if (!report)
          throw new TRPCError({ code: "NOT_FOUND", message: "Incident not found." });
        if (report.status === "RESOLVED" || report.status === "REJECTED")
          throw new TRPCError({ code: "BAD_REQUEST", message: "Closed incidents cannot be claimed." });
        if (report.assignedResponderId && report.assignedResponderId !== ctx.user.id)
          throw new TRPCError({ code: "FORBIDDEN", message: "This incident is already assigned to another responder." });
        await updateRiskReport(input.reportId, { assignedResponderId: ctx.user.id });
        await logActivity({
          actorId: ctx.user.id,
          action: "RESPONDER_ASSIGNED",
          entityType: "risk_report",
          entityId: input.reportId,
        });
        broadcastAssignment({ reportId: input.reportId, assignedResponderId: ctx.user.id });
        return { reportId: input.reportId, assignedResponderId: ctx.user.id };
      }),
    alerts: roleProcedure(allowedRoles).query(() => listAlerts()),
    notifyResponders: roleProcedure(["admin", "staff"]).input(z.object({ incidentId: z.string().min(1), incidentType: z.string().min(2), location: z.string().min(2), priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]) })).mutation(async ({ ctx, input }) => {
      const result = await createAlert({ title: `${input.priority} incident: ${input.incidentType}`, message: `${input.incidentId} requires responder attention at ${input.location}.`, alertType: "INCIDENT_ASSIGNMENT", priority: input.priority, targetAudience: "RESPONDERS", createdBy: ctx.user.id });
      await logActivity({ actorId: ctx.user.id, action: "NOTIFY_RESPONDERS", entityType: "risk_report", metadata: JSON.stringify({ incidentId: input.incidentId, alertId: result.id }) });
      const notifyAlert = await getAlertById(result.id);
      if (notifyAlert) broadcastAlert(notifyAlert, notifyAlert.targetAudience);
      return result;
    }),
    weather: roleProcedure(allowedRoles).query(() => getWeatherSnapshot()),
    emergencySms: publicProcedure.query(() => getPublicSmsSettings()),
    /**
     * US-5, part 1: the resident's photograph reaches storage.
     *
     * Note what is NOT in the input: a mime type. The client no longer gets to
     * assert what a file is. `uploadEvidence` reads the type from the bytes and
     * refuses anything it does not recognise, which is the only form of the
     * "re-validate true mime type" rule that cannot be talked around — see
     * `server/file-signature.ts` for why this matters more than it looks.
     */
    uploadEvidence: protectedProcedure
      .input(
        z.object({
          reportId: z.number().int().positive(),
          fileName: z.string().min(1).max(255),
          dataBase64: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const report = await getRiskReportById(input.reportId);
        if (!report)
          throw new TRPCError({ code: "NOT_FOUND", message: "That report no longer exists." });
        if (!canAccessReport(ctx.user, report))
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this report." });
        try {
          return await uploadEvidence({ ...input, userId: ctx.user.id });
        } catch (error) {
          /**
           * US-7 AC 4. If nothing is written here, a failed upload is
           * indistinguishable from one never attempted — a report that looks
           * un-evidenced when the resident did take a photo and it did not
           * arrive. `recordEvidenceUploadFailure` leaves a row the responder's
           * gallery renders as failed, and the resident's own screen is already
           * telling them why. Both writes are best-effort: the original error
           * is the one the caller sees, whatever happens to the record.
           */
          try {
            await recordEvidenceUploadFailure({
              reportId: input.reportId,
              fileName: input.fileName,
            });
            await logActivity({
              actorId: ctx.user.id,
              action: "EVIDENCE_UPLOAD_FAILED",
              entityType: "risk_report",
              entityId: input.reportId,
              metadata: JSON.stringify({
                fileName: input.fileName,
                error: error instanceof Error ? error.message : String(error),
              }),
            });
          } catch {
            // Failure recording must not mask the original failure.
          }
          throw error;
        }
      }),

    /**
     * US-7, part 1: the read path that did not exist before this change.
     *
     * Until now `evidenceFiles` had exactly one statement against it anywhere in
     * the codebase and it was an insert. Files went in and nothing in the
     * product — no query, no screen, no export — could ever bring one back out.
     * An upload with no way to view it records an incident without preserving
     * any of its evidence, which is worse than not having the feature, because
     * it looks like it works.
     *
     * Returns `url` pointing at the authenticated serving route rather than the
     * `fileUrl` column. That column holds an unsigned `/api/upload/...` path
     * which returns 403 for every request; handing it to a client would be
     * handing over a link that cannot be fetched.
     *
     * Center staff are excluded by `canAccessReport`, per US-7 as written and
     * the decision in section 12.3. The consequence — staff see a report with
     * no attachments under it — is documented on that function rather than
     * rediscovered here.
     */
    listEvidence: protectedProcedure
      .input(z.object({ reportId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const report = await getRiskReportById(input.reportId);
        if (!report)
          throw new TRPCError({ code: "NOT_FOUND", message: "That report no longer exists." });
        if (!canAccessReport(ctx.user, report)) {
          await logActivity({
            actorId: ctx.user.id,
            action: "EVIDENCE_ACCESS_DENIED",
            entityType: "risk_report",
            entityId: input.reportId,
            metadata: JSON.stringify({
              reason: accessDenialReason(ctx.user),
              requesterRole: ctx.user.role,
            }),
          });
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this report." });
        }
        const rows = await listEvidenceForReport(input.reportId);
        return rows.map((row) => ({
          id: row.id,
          reportId: row.reportId,
          fileName: row.fileName,
          status: row.status === "FAILED" ? ("FAILED" as const) : ("STORED" as const),
          mimeType: row.mimeType || null,
          sizeBytes: row.sizeBytes,
          createdAt: row.createdAt,
          url: row.status === "STORED" ? `/api/files/evidence/${row.id}` : null,
        }));
      }),
  }),
  advice: router({
    /**
     * Public safety guidance. Deliberately ungated: residents sheltering in
     * Pateros, and visitors evacuating through it, must be able to read
     * evacuation instructions without an approved account. Only PUBLISHED
     * rows are ever returned.
     */
    list: publicProcedure.query(() => listPublishedAdviceWithSteps()),
    detail: publicProcedure
      .input(z.object({ slug: z.string().min(1).max(120) }))
      .query(async ({ input }) => {
        const advice = await getSafetyAdviceBySlug(input.slug);
        if (!advice) throw new TRPCError({ code: "NOT_FOUND", message: "Safety advice not found" });
        return { ...advice, steps: await listAdviceSteps(advice.id) };
      }),

    adminList: adminProcedure.query(async () => {
      const advice = await listSafetyAdvice({ includeUnpublished: true });
      return Promise.all(advice.map(async item => ({ ...item, steps: await listAdviceSteps(item.id) })));
    }),
    create: adminProcedure
      .input(z.object({ ...adviceContentShape, steps: z.array(adviceStepShape).max(30).default([]) }))
      .mutation(async ({ ctx, input }) => {
        const created = await createSafetyAdvice(input, input.steps, ctx.user.id);
        await logActivity({
          actorId: ctx.user.id,
          action: "CREATE",
          entityType: "safety_advice",
          entityId: created.id,
        });
        return getSafetyAdviceById(created.id);
      }),
    update: adminProcedure
      .input(z.object({ id: z.number().int().positive(), ...adviceContentShape, steps: z.array(adviceStepShape).max(30).default([]) }))
      .mutation(async ({ ctx, input }) => {
        const updated = await updateSafetyAdvice(input.id, input, input.steps);
        await logActivity({
          actorId: ctx.user.id,
          action: "UPDATE",
          entityType: "safety_advice",
          entityId: input.id,
        });
        return updated;
      }),
    setStatus: adminProcedure
      .input(z.object({ id: z.number().int().positive(), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }))
      .mutation(async ({ ctx, input }) => {
        const existing = await getSafetyAdviceById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Safety advice not found" });
        if (!canTransitionAdviceStatus(existing.status, input.status))
          throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot move guidance from ${existing.status} to ${input.status}` });
        if (input.status === "PUBLISHED") {
          const steps = await listAdviceSteps(input.id);
          if (!isAdviceDraftPublishable({ ...existing, steps })) {
            const errors = validateAdviceDraft({ ...existing, steps });
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `This guidance is not ready to publish: ${Object.values(errors).filter(Boolean).join(" ")}`,
            });
          }
        }
        const updated = await setSafetyAdviceStatus(input.id, input.status);
        await logActivity({
          actorId: ctx.user.id,
          action: input.status,
          entityType: "safety_advice",
          entityId: input.id,
        });
        return updated;
      }),
    remove: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const existing = await getSafetyAdviceById(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Safety advice not found" });
        await deleteSafetyAdvice(input.id);
        await logActivity({
          actorId: ctx.user.id,
          action: "DELETE",
          entityType: "safety_advice",
          entityId: input.id,
          metadata: existing.title,
        });
        return { id: input.id };
      }),
    uploadStepImage: adminProcedure
      .input(
        z.object({
          fileName: z.string().min(1).max(255),
          mimeType: z.string().min(3).max(120),
          dataBase64: z.string().min(1),
        }),
      )
      .mutation(({ input }) => uploadAdviceStepImage(input)),
  }),
  security: router({
    twoFactorStatus: roleProcedure(["responder"]).query(({ ctx }) =>
      getTwoFactorStatus(ctx.user.id)
    ),
    beginTwoFactorSetup: roleProcedure(["responder"]).mutation(
      ({ ctx }) => beginTwoFactorSetup(ctx.user.id)
    ),
    confirmTwoFactorSetup: roleProcedure(["responder"])
      .input(z.object({ code: z.string().regex(/^\d{6}$/) }))
      .mutation(({ ctx, input }) =>
        confirmTwoFactorSetup(ctx.user.id, input.code)
      ),
    disableTwoFactor: roleProcedure(["responder"]).mutation(
      ({ ctx }) => disableTwoFactor(ctx.user.id)
    ),
  }),
  admin: router({
    health: adminProcedure.query(() => ({ ok: true, scope: "admin" as const })),
    provisionDemoAccount: adminProcedure
      .input(
        z.object({
          name: z.string().min(2).max(120),
          role: z.enum(["admin", "staff", "responder", "citizen"]),
          expiresInDays: z.number().int().min(1).max(30).default(7),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await provisionDemoAccount(input, ctx.user.id);
        await logActivity({
          actorId: ctx.user.id,
          action: "DEMO_PROVISIONED",
          entityType: "user",
          entityId: result.userId,
          metadata: JSON.stringify({
            role: result.role,
            expiresAt: result.expiresAt,
          }),
        });
        return result;
      }),
    demoAccounts: adminProcedure.query(() => listDemoAccounts()),
    provisionDemoAccounts: adminProcedure
      .input(
        z.object({ expiresInDays: z.number().int().min(1).max(30).default(7) })
      )
      .mutation(({ ctx, input }) =>
        provisionDemoAccounts(input.expiresInDays, ctx.user.id)
      ),
    revokeDemoAccount: adminProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const result = await revokeDemoAccount(input.userId, ctx.user.id);
        await logActivity({
          actorId: ctx.user.id,
          action: "DEMO_REVOKED",
          entityType: "user",
          entityId: input.userId,
        });
        return result;
      }),
    users: adminProcedure.query(() => listUsers()),
    invitations: adminProcedure.query(() => listInvitations()),
    createInvitation: adminProcedure
      .input(
        z.object({
          email: z.string().email(),
          name: z.string().min(2).max(120),
          role: z.enum(["staff", "responder"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await createInvitation(input, ctx.user.id);
        const baseUrl = process.env.PUBLIC_URL ?? "http://localhost:5173";
        const inviteUrl = `${baseUrl}/accept-invitation?token=${result.inviteToken}`;

        const emailResult = await sendInvitationEmail({
          email: result.email,
          name: input.name,
          role: input.role,
          inviteUrl,
        });

        if (!emailResult.sent) {
          console.warn(
            `[Invite] Email failed for ${result.email}: ${emailResult.error ?? "unknown error"}`
          );
        }

        await logActivity({
          actorId: ctx.user.id,
          action: "INVITE",
          entityType: "user",
          entityId: result.id,
          metadata: JSON.stringify({ email: result.email, role: result.role, emailSent: emailResult.sent }),
        });
        return { ...result, emailSent: emailResult.sent, emailError: emailResult.error, inviteUrl };
      }),
    roleHistory: adminProcedure
      .input(z.object({ entityType: z.string().optional() }))
      .query(({ input }) => listActivityLogs(input.entityType)),
    requestRoleChange: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          role: z.enum(["admin", "staff", "responder", "citizen", "user"]),
          password: z.string().min(1).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        enforceRateLimit(ctx.req, `role-change:${ctx.user.id}`, 10, 60 * 1000);
        const target = await getUserById(input.userId);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
        if (target.role === input.role)
          throw new TRPCError({ code: "BAD_REQUEST", message: "This user already has the selected role." });
        if (ctx.user.id === input.userId)
          throw new TRPCError({ code: "FORBIDDEN", message: "You cannot change your own role. Ask another administrator to do it." });
        if (!input.password)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Re-enter your password to authorize this role change." });
        const verified = await verifyLocalCredentials(ctx.user.email ?? "", input.password);
        if (!verified || verified.id !== ctx.user.id)
          throw new TRPCError({ code: "FORBIDDEN", message: "That password does not match your account. No changes were made." });
        const privileged = input.role === "admin" || target.role === "admin";
        if (privileged) {
          const adminCount = await countActiveAdmins();
          if (target.role === "admin" && adminCount <= 1)
            throw new TRPCError({ code: "FORBIDDEN", message: "You cannot demote the last active administrator." });
          if (adminCount >= 2) {
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const request = await createRoleChangeRequest({
              requesterId: ctx.user.id,
              userId: target.id,
              fromRole: target.role,
              toRole: input.role,
              expiresAt,
            });
            await logActivity({
              actorId: ctx.user.id,
              action: "ROLE_CHANGE_REQUESTED",
              entityType: "user",
              entityId: target.id,
              metadata: JSON.stringify({ role: input.role, requestId: request.id }),
            });
            return { outcome: "approval" as const, requestId: request.id, expiresAt, role: input.role };
          }
        }
        await updateUserRole(target.id, input.role);
        await logActivity({
          actorId: ctx.user.id,
          action: "ROLE_CHANGED",
          entityType: "user",
          entityId: target.id,
          metadata: JSON.stringify({ role: input.role, confirmedBy: "password" }),
        });
        return { outcome: "applied" as const, userId: target.id, role: input.role };
      }),
    approveRoleChange: adminProcedure
      .input(z.object({ requestId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const request = await getRoleChangeRequest(input.requestId);
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Role change request not found." });
        if (request.status !== "PENDING")
          throw new TRPCError({ code: "BAD_REQUEST", message: `This request was already ${request.status.toLowerCase()}.` });
        if (request.requesterId === ctx.user.id)
          throw new TRPCError({ code: "FORBIDDEN", message: "A different administrator must approve this request." });
        if (request.expiresAt.getTime() <= Date.now()) {
          await setRoleChangeRequestStatus(request.id, "EXPIRED");
          throw new TRPCError({ code: "BAD_REQUEST", message: "This request expired before it could be approved." });
        }
        const target = await getUserById(request.userId);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "The affected user no longer exists." });
        if (target.role !== request.fromRole) {
          await setRoleChangeRequestStatus(request.id, "REJECTED", ctx.user.id);
          throw new TRPCError({ code: "CONFLICT", message: "This user's role changed since the request was made." });
        }
        if (request.fromRole === "admin" && (await countActiveAdmins()) <= 1)
          throw new TRPCError({ code: "FORBIDDEN", message: "This change would demote the last active administrator." });
        await updateUserRole(target.id, request.toRole);
        await setRoleChangeRequestStatus(request.id, "APPROVED", ctx.user.id);
        await logActivity({
          actorId: ctx.user.id,
          action: "ROLE_CHANGED",
          entityType: "user",
          entityId: target.id,
          metadata: JSON.stringify({ role: request.toRole, requestId: request.id, requestedBy: request.requesterId }),
        });
        return { requestId: request.id, userId: target.id, role: request.toRole };
      }),
    rejectRoleChange: adminProcedure
      .input(z.object({ requestId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const request = await getRoleChangeRequest(input.requestId);
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Role change request not found." });
        if (request.status !== "PENDING")
          throw new TRPCError({ code: "BAD_REQUEST", message: `This request was already ${request.status.toLowerCase()}.` });
        await setRoleChangeRequestStatus(request.id, "REJECTED", ctx.user.id);
        await logActivity({
          actorId: ctx.user.id,
          action: "ROLE_CHANGE_REJECTED",
          entityType: "user",
          entityId: request.userId,
          metadata: JSON.stringify({ requestId: request.id, role: request.toRole }),
        });
        return { requestId: request.id, status: "REJECTED" as const };
      }),
    roleChangeRequests: adminProcedure.query(async () => {
      const requests = await listRoleChangeRequests();
      const usersById = new Map((await listUsers()).map(user => [user.id, user]));
      const now = Date.now();
      return requests.map(request => {
        const requester = usersById.get(request.requesterId);
        const subject = usersById.get(request.userId);
        return {
          ...request,
          status:
            request.status === "PENDING" && request.expiresAt.getTime() <= now
              ? ("EXPIRED" as const)
              : request.status,
          requesterName: requester?.name ?? `user #${request.requesterId}`,
          requesterEmail: requester?.email ?? null,
          userName: subject?.name ?? `user #${request.userId}`,
          userEmail: subject?.email ?? null,
        };
      });
    }),
    updateUserApproval: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), accountStatus: z.enum(["APPROVED", "REJECTED"]) }))
      .mutation(async ({ ctx, input }) => {
        const result = await updateUserApproval(input.userId, input.accountStatus);
        await logActivity({ actorId: ctx.user.id, action: `ACCOUNT_${input.accountStatus}`, entityType: "user", entityId: input.userId });
        return result;
      }),
    archiveCenter: roleProcedure(["admin", "staff"])
      .input(z.object({ centerId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "staff" && !(await listAssignedCenterIds(ctx.user.id)).includes(input.centerId))
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage your assigned evacuation center." });
        const result = await archiveCenter(input.centerId);
        await logActivity({
          actorId: ctx.user.id,
          action: "ARCHIVE",
          entityType: "evacuation_center",
          entityId: input.centerId,
        });
        return result;
      }),
    assignCenterStaff: adminProcedure
      .input(
        z.object({
          centerId: z.number().int().positive(),
          userId: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await assignCenterStaff(input.centerId, input.userId);
        await logActivity({
          actorId: ctx.user.id,
          action: "ASSIGN",
          entityType: "center_staff",
          entityId: result.id,
        });
        return result;
      }),
    createCenter: roleProcedure(["admin", "staff"])
      .input(centerInput)
      .mutation(async ({ ctx, input }) => {
        const result = await upsertCenter(input);
        if (ctx.user.role === "staff") await assignCenterStaff(result.id, ctx.user.id);
        await logActivity({ actorId: ctx.user.id, action: "CREATE", entityType: "evacuation_center", entityId: result.id });
        return result;
      }),
    createResource: roleProcedure(["admin", "staff"])
      .input(z.object({
        name: z.string().min(2).max(120),
        category: z.string().min(2).max(80),
        quantity: z.number().int().min(0),
        unit: z.string().min(1).max(30),
        minimumStock: z.number().int().min(0),
        centerId: z.number().int().positive(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "staff" && !(await listAssignedCenterIds(ctx.user.id)).includes(input.centerId))
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage resources in your assigned center." });
        const result = await createResource({
          ...input,
          status: getResourceStatus(input.quantity, input.minimumStock),
        });
        await logActivity({ actorId: ctx.user.id, action: "CREATE", entityType: "resource", entityId: result.id });
        return result;
      }),
    updateResource: roleProcedure(["admin", "staff"])
      .input(z.object({ resourceId: z.number().int().positive(), data: z.object({ quantity: z.number().int().min(0), minimumStock: z.number().int().min(0) }) }))
      .mutation(async ({ ctx, input }) => {
        const resource = await getResourceById(input.resourceId);
        if (!resource || (ctx.user.role === "staff" && !(await listAssignedCenterIds(ctx.user.id)).includes(resource.centerId)))
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage resources in your assigned center." });
        const result = await updateResource(input.resourceId, { ...input.data, status: getResourceStatus(input.data.quantity, input.data.minimumStock, resource.expirationDate) });
        await logActivity({ actorId: ctx.user.id, action: "UPDATE", entityType: "resource", entityId: input.resourceId });
        return result;
      }),
    removeResource: roleProcedure(["admin", "staff"])
      .input(z.object({ resourceId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const resource = await getResourceById(input.resourceId);
        if (!resource || (ctx.user.role === "staff" && !(await listAssignedCenterIds(ctx.user.id)).includes(resource.centerId)))
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage resources in your assigned center." });
        const result = await removeResource(input.resourceId);
        await logActivity({ actorId: ctx.user.id, action: "REMOVE", entityType: "resource", entityId: input.resourceId });
        return result;
      }),
    updateCenter: roleProcedure(["admin", "staff"])
      .input(
        z.object({
          id: z.number().int().positive(),
          data: centerInput.partial(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role === "staff" && !(await listAssignedCenterIds(ctx.user.id)).includes(input.id))
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage your assigned evacuation center." });
        const result = await upsertCenter(input.data as typeof import("../drizzle/schema").evacuationCenters.$inferInsert, input.id);
        await logActivity({ actorId: ctx.user.id, action: "UPDATE", entityType: "evacuation_center", entityId: input.id });
        return result;
      }),
    createAlert: adminProcedure
      .input(
        z.object({
          title: z.string().min(3),
          titleFilipino: z.string().max(180).optional(),
          message: z.string().min(5),
          messageFilipino: z.string().optional(),
          alertType: z.string().min(2),
          priority: z
            .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
            .default("MEDIUM"),
          targetAudience: z
            .enum(["ALL_USERS", "CITIZENS", "STAFF", "RESPONDERS", "ADMIN"])
            .default("ALL_USERS"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await createAlert({ ...input, createdBy: ctx.user.id });
        await logActivity({
          actorId: ctx.user.id,
          action: "CREATE",
          entityType: "alert",
          entityId: result.id,
        });
        const createdAlert = await getAlertById(result.id);
        if (createdAlert) broadcastAlert(createdAlert, createdAlert.targetAudience);
        return result;
      }),
    endAlert: adminProcedure
      .input(z.object({ alertId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const ended = await endAlert(input.alertId);
        if (!ended)
          throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found." });
        await logActivity({
          actorId: ctx.user.id,
          action: "END",
          entityType: "alert",
          entityId: input.alertId,
        });
        broadcastAlertEnded(ended);
        return ended;
      }),
    updateSetting: adminProcedure
      .input(
        z.object({ settingKey: z.string().min(2), settingValue: z.string() })
      )
      .mutation(({ ctx, input }) =>
        updateSetting(input.settingKey, input.settingValue, ctx.user.id)
      ),
    smsSettings: adminProcedure.query(() =>
      getSettings(["sms_official_number", "sms_provider"])
    ),
    saveSmsSettings: adminProcedure
      .input(
        z.object({
          officialNumber: z.string().regex(/^\+?[0-9 ()-]{7,20}$/),
          provider: z.enum(["NONE", "TWILIO", "VONAGE", "CUSTOM"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const storedNumber = input.officialNumber.replace(/[ ()-]/g, "");
        await updateSetting("sms_official_number", storedNumber, ctx.user.id);
        await updateSetting("sms_provider", input.provider, ctx.user.id);
        await logActivity({
          actorId: ctx.user.id,
          action: "UPDATE",
          entityType: "sms_settings",
          metadata: JSON.stringify({
            officialNumber: storedNumber,
            provider: input.provider,
          }),
        });
        return { officialNumber: storedNumber, provider: input.provider };
      }),
    queueReportExport: adminProcedure
      .input(z.object({ reportType: z.string().min(2) }))
      .mutation(({ ctx, input }) =>
        queueReportExport(ctx.user.id, input.reportType)
      ),
  }),
});
export type AppRouter = typeof appRouter;
