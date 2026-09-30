import { z } from "zod";
import { jwtVerify, SignJWT } from "jose";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
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
  createAlert,
  createInvitation,
  createResponderAction,
  createResource,
  createRiskReport,
  disableTwoFactor,
  getOperationsSummary,
  getPublicSmsSettings,
  getEvacueeById,
  getAlertById,
  getResourceById,
  getRiskReportById,
  getSettings,
  getTwoFactorStatus,
  getUserById,
  getWeatherSnapshot,
  issuePasswordReset,
  listActivityLogs,
  listAlerts,
  listAssignedCenterIds,
  listCenters,
  listCentersForUser,
  listDemoAccounts,
  listEvacuees,
  listEvacueesForCenters,
  listInvitations,
  listResources,
  listResourcesForCenters,
  listResourceTransactions,
  listResponderActions,
  listRiskReports,
  listRiskReportsForUser,
  listResponders,
  listUsers,
  logActivity,
  provisionDemoAccount,
  provisionDemoAccounts,
  queueReportExport,
  registerEvacuee,
  registerLocalUser,
  updateUserApproval,
  releaseEvacuee,
  removeResource,
  resetLocalPassword,
  revokeDemoAccount,
  transactResource,
  transferEvacuee,
  updateResource,
  updateRiskReport,
  updateSetting,
  updateUserRole,
  uploadEvidence,
  upsertCenter,
  verifyLocalCredentials,
  getUserByEmail,
  verifyUserTotp,
} from "./db";
import { broadcastAlert, broadcastAssignment, broadcastIncident } from "./_core/realtime";
import { toCitizenEmergencyNotification } from "../shared/citizen";

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

export const appRouter = router({
  system: systemRouter,
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
          name: z.string().min(2).max(120),
          role: z
            .enum(["admin", "staff", "responder", "citizen"])
            .default("citizen"),
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
        const user = await registerLocalUser(input);
        const approvalToken = await new SignJWT({ type: "citizen-approval" })
          .setProtectedHeader({ alg: "HS256" })
          .setSubject(String(user.userId))
          .setIssuedAt()
          .setExpirationTime("1d")
          .sign(sessionKey());
        return { approvalRequired: true as const, email: user.email, approvalToken };
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
      .mutation(({ ctx, input }) =>
        changeLocalPassword(
          ctx.user.id,
          input.currentPassword,
          input.newPassword
        )
      ),
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
              message: `${input.reportType} reported at ${input.location}.${coordinates}`,
              alertType: "CITIZEN_EMERGENCY",
              priority: input.priority,
              targetAudience: "RESPONDERS",
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
    uploadEvidence: protectedProcedure
      .input(
        z.object({
          reportId: z.number().int().positive(),
          fileName: z.string().min(1).max(255),
          mimeType: z.string().min(3).max(120),
          dataBase64: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const report = await getRiskReportById(input.reportId);
        const canAccess = ctx.user.role === "admin" || report?.reporterId === ctx.user.id || report?.assignedResponderId === ctx.user.id;
        if (!canAccess) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this report." });
        return uploadEvidence({ ...input, userId: ctx.user.id });
      }),
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
    updateUserRole: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          role: z.enum(["admin", "staff", "responder", "citizen", "user"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await updateUserRole(input.userId, input.role);
        await logActivity({
          actorId: ctx.user.id,
          action: "ROLE_CHANGED",
          entityType: "user",
          entityId: input.userId,
          metadata: JSON.stringify({ role: input.role }),
        });
        return result;
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
