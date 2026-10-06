import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, index } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(), openId: varchar("openId", { length: 64 }).notNull().unique(), name: text("name"), email: varchar("email", { length: 320 }), loginMethod: varchar("loginMethod", { length: 64 }), accountStatus: mysqlEnum("accountStatus", ["PENDING", "APPROVED", "REJECTED"]).default("APPROVED").notNull(), firstName: varchar("firstName", { length: 80 }), middleName: varchar("middleName", { length: 80 }), lastName: varchar("lastName", { length: 80 }),
  role: mysqlEnum("role", ["user", "admin", "staff", "responder", "citizen"]).default("citizen").notNull(), phone: varchar("phone", { length: 40 }), address: text("address"), age: int("age"), emailVerifiedAt: timestamp("emailVerifiedAt"),
  /**
   * When the account stopped being active.
   *
   * Needed because OQ 3 keeps an approved resident's Valid ID for a year
   * *after deactivation*, not a year after approval. Without a column to hold
   * the deactivation date that rule can only be approximated, and the two ways
   * of approximating it are both wrong: dating from approval deletes the ID of
   * someone who is still an active resident, and never dating it means approved
   * IDs are retained forever. Nothing sets this yet — there is no deactivation
   * feature — so the retention job is written to handle it the day one lands.
   */
  deactivatedAt: timestamp("deactivatedAt"), isDemo: boolean("isDemo").default(false).notNull(), demoExpiresAt: timestamp("demoExpiresAt"), demoRevokedAt: timestamp("demoRevokedAt"), demoRevokedBy: int("demoRevokedBy"), twoFactorSecret: varchar("twoFactorSecret", { length: 64 }), twoFactorEnabled: boolean("twoFactorEnabled").default(false).notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(), lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export const authCredentials = mysqlTable("auth_credentials", { id: int("id").autoincrement().primaryKey(), userId: int("userId").notNull().references(() => users.id), email: varchar("email", { length: 320 }).notNull().unique(), passwordHash: varchar("passwordHash", { length: 255 }).notNull(), resetTokenHash: varchar("resetTokenHash", { length: 255 }), resetExpiresAt: timestamp("resetExpiresAt"), emailVerificationTokenHash: varchar("emailVerificationTokenHash", { length: 255 }), emailVerificationExpiresAt: timestamp("emailVerificationExpiresAt"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() });
export const invitations = mysqlTable("invitations", { id: int("id").autoincrement().primaryKey(), email: varchar("email", { length: 320 }).notNull(), name: varchar("name", { length: 120 }).notNull(), role: mysqlEnum("role", ["staff", "responder"]).notNull(), tokenHash: varchar("tokenHash", { length: 255 }).notNull().unique(), invitedBy: int("invitedBy").notNull().references(() => users.id), expiresAt: timestamp("expiresAt").notNull(), acceptedAt: timestamp("acceptedAt"), createdAt: timestamp("createdAt").defaultNow().notNull() });
export const evacuationCenters = mysqlTable("evacuation_centers", {
  id: int("id").autoincrement().primaryKey(), centerCode: varchar("centerCode", { length: 32 }).notNull().unique(), name: varchar("name", { length: 180 }).notNull(), nameFilipino: varchar("nameFilipino", { length: 180 }), address: text("address").notNull(), addressFilipino: text("addressFilipino"), barangay: varchar("barangay", { length: 100 }).notNull(), latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(), longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(), maximumCapacity: int("maximumCapacity").notNull(), currentOccupancy: int("currentOccupancy").default(0).notNull(), contactPerson: varchar("contactPerson", { length: 120 }), contactNumber: varchar("contactNumber", { length: 40 }), status: mysqlEnum("status", ["OPEN", "FULL", "CLOSED", "UNDER_MAINTENANCE", "EMERGENCY_ONLY"]).default("OPEN").notNull(), facilities: text("facilities"), description: text("description"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ barangayIdx: index("center_barangay_idx").on(table.barangay) }));
export const centerStaff = mysqlTable("center_staff", { id: int("id").autoincrement().primaryKey(), centerId: int("centerId").notNull().references(() => evacuationCenters.id), userId: int("userId").notNull().references(() => users.id), assignedAt: timestamp("assignedAt").defaultNow().notNull() });
export const evacuees = mysqlTable("evacuees", { id: int("id").autoincrement().primaryKey(), firstName: varchar("firstName", { length: 80 }).notNull(), middleName: varchar("middleName", { length: 80 }), lastName: varchar("lastName", { length: 80 }).notNull(), age: int("age").notNull(), sex: mysqlEnum("sex", ["FEMALE", "MALE", "OTHER", "UNSPECIFIED"]).default("UNSPECIFIED").notNull(), contactNumber: varchar("contactNumber", { length: 40 }), address: text("address"), barangay: varchar("barangay", { length: 100 }), emergencyContact: varchar("emergencyContact", { length: 140 }), medicalNotes: text("medicalNotes"), specialNeeds: text("specialNeeds"), centerId: int("centerId").notNull().references(() => evacuationCenters.id), registrationDate: timestamp("registrationDate").defaultNow().notNull(), status: mysqlEnum("status", ["ACTIVE", "TRANSFERRED", "RELEASED"]).default("ACTIVE").notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() });
export const resources = mysqlTable("resources", { id: int("id").autoincrement().primaryKey(), name: varchar("name", { length: 120 }).notNull(), category: varchar("category", { length: 80 }).notNull(), quantity: int("quantity").default(0).notNull(), unit: varchar("unit", { length: 30 }).notNull(), minimumStock: int("minimumStock").default(0).notNull(), centerId: int("centerId").notNull().references(() => evacuationCenters.id), expirationDate: timestamp("expirationDate"), status: mysqlEnum("status", ["AVAILABLE", "LOW_STOCK", "OUT_OF_STOCK", "EXPIRED"]).default("AVAILABLE").notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() });
export const resourceTransactions = mysqlTable("resource_transactions", { id: int("id").autoincrement().primaryKey(), resourceId: int("resourceId").notNull().references(() => resources.id), userId: int("userId").notNull().references(() => users.id), type: mysqlEnum("type", ["STOCK_IN", "STOCK_OUT", "TRANSFER", "BORROW", "RETURN"]).notNull(), quantity: int("quantity").notNull(), notes: text("notes"), createdAt: timestamp("createdAt").defaultNow().notNull() });
export const riskReports = mysqlTable("risk_reports", { id: int("id").autoincrement().primaryKey(), reportCode: varchar("reportCode", { length: 32 }).notNull().unique(), reporterId: int("reporterId").references(() => users.id), reportType: varchar("reportType", { length: 80 }).notNull(), description: text("description").notNull(), location: text("location").notNull(), latitude: decimal("latitude", { precision: 10, scale: 7 }), longitude: decimal("longitude", { precision: 10, scale: 7 }), priority: mysqlEnum("priority", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM").notNull(), status: mysqlEnum("status", ["PENDING", "VERIFIED", "IN_PROGRESS", "RESOLVED", "REJECTED"]).default("PENDING").notNull(), assignedResponderId: int("assignedResponderId").references(() => users.id), resolution: text("resolution"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() }, (table) => ({ statusIdx: index("report_status_idx").on(table.status), priorityIdx: index("report_priority_idx").on(table.priority) }));
export const evidenceFiles = mysqlTable("evidence_files", { id: int("id").autoincrement().primaryKey(), reportId: int("reportId").notNull().references(() => riskReports.id), fileKey: varchar("fileKey", { length: 500 }).notNull(), fileUrl: varchar("fileUrl", { length: 1000 }).notNull(), fileName: varchar("fileName", { length: 255 }).notNull(), mimeType: varchar("mimeType", { length: 120 }).notNull(), sizeBytes: int("sizeBytes"), status: varchar("status", { length: 16 }).notNull().default("STORED"), createdAt: timestamp("createdAt").defaultNow().notNull() });
export const alerts = mysqlTable("alerts", { id: int("id").autoincrement().primaryKey(), title: varchar("title", { length: 180 }).notNull(), titleFilipino: varchar("titleFilipino", { length: 180 }), message: text("message").notNull(), messageFilipino: text("messageFilipino"), alertType: varchar("alertType", { length: 80 }).notNull(), priority: mysqlEnum("priority", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM").notNull(), targetAudience: mysqlEnum("targetAudience", ["ALL_USERS", "CITIZENS", "STAFF", "RESPONDERS", "ADMIN"]).default("ALL_USERS").notNull(), expiresAt: timestamp("expiresAt"), isActive: boolean("isActive").default(true).notNull(), createdBy: int("createdBy").references(() => users.id), createdAt: timestamp("createdAt").defaultNow().notNull() });
export const responderActions = mysqlTable("responder_actions", { id: int("id").autoincrement().primaryKey(), reportId: int("reportId").notNull().references(() => riskReports.id), responderId: int("responderId").notNull().references(() => users.id), action: text("action").notNull(), resourcesUsed: text("resourcesUsed"), arrivalAt: timestamp("arrivalAt"), completedAt: timestamp("completedAt"), createdAt: timestamp("createdAt").defaultNow().notNull() });
export const weatherSnapshots = mysqlTable("weather_snapshots", { id: int("id").autoincrement().primaryKey(), location: varchar("location", { length: 120 }).notNull(), temperatureC: decimal("temperatureC", { precision: 5, scale: 2 }), condition: varchar("condition", { length: 100 }), warning: text("warning"), provider: varchar("provider", { length: 80 }), observedAt: timestamp("observedAt").defaultNow().notNull() });
export const systemSettings = mysqlTable("system_settings", { id: int("id").autoincrement().primaryKey(), settingKey: varchar("settingKey", { length: 120 }).notNull().unique(), settingValue: text("settingValue"), updatedBy: int("updatedBy").references(() => users.id), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() });
export const activityLogs = mysqlTable("activity_logs", { id: int("id").autoincrement().primaryKey(), actorId: int("actorId").references(() => users.id), action: varchar("action", { length: 120 }).notNull(), entityType: varchar("entityType", { length: 80 }).notNull(), entityId: int("entityId"), metadata: text("metadata"), createdAt: timestamp("createdAt").defaultNow().notNull() });
export const reportExports = mysqlTable("report_exports", { id: int("id").autoincrement().primaryKey(), requestedBy: int("requestedBy").references(() => users.id), reportType: varchar("reportType", { length: 80 }).notNull(), fileKey: varchar("fileKey", { length: 500 }), fileUrl: varchar("fileUrl", { length: 1000 }), status: mysqlEnum("status", ["QUEUED", "READY", "FAILED"]).default("QUEUED").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() });
export const safetyAdvice = mysqlTable("safety_advice", { id: int("id").autoincrement().primaryKey(), slug: varchar("slug", { length: 120 }).notNull().unique(), category: varchar("category", { length: 40 }).notNull(), title: varchar("title", { length: 180 }).notNull(), titleFilipino: varchar("titleFilipino", { length: 180 }), summary: text("summary").notNull(), summaryFilipino: text("summaryFilipino"), body: text("body").notNull(), bodyFilipino: text("bodyFilipino"), status: mysqlEnum("status", ["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT").notNull(), isEmergency: boolean("isEmergency").default(false).notNull(), sortOrder: int("sortOrder").default(0).notNull(), publishedAt: timestamp("publishedAt"), archivedAt: timestamp("archivedAt"), createdBy: int("createdBy").references(() => users.id), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() }, (table) => ({ statusIdx: index("advice_status_idx").on(table.status), categoryIdx: index("advice_category_idx").on(table.category) }));
export const adviceSteps = mysqlTable("advice_steps", { id: int("id").autoincrement().primaryKey(), adviceId: int("adviceId").notNull().references(() => safetyAdvice.id, { onDelete: "cascade" }), stepNo: int("stepNo").notNull(), title: varchar("title", { length: 180 }), titleFilipino: varchar("titleFilipino", { length: 180 }), instruction: text("instruction"), instructionFilipino: text("instructionFilipino"), imageUrl: varchar("imageUrl", { length: 1000 }), imageKey: varchar("imageKey", { length: 500 }), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() }, (table) => ({ orderIdx: index("advice_step_order_idx").on(table.adviceId, table.stepNo) }));
/**
 * Citizen ID documents (US-2 / US-3).
 *
 * The file itself is stored through `storagePut` and only `fileKey` is kept
 * here — never a public URL. `storagePut` returns an
 * `/api/upload/{key}?exp&sig` capability URL whose signature is an HMAC
 * derived from `JWT_SECRET`; without a valid signature it answers 403, and
 * never returns a bare `/manus-storage` path (that proxy no longer exists).
 * Serving a resident's government ID goes through the authenticated,
 * audited `idVerification.imageUrl` route — a 300-second signed URL with an
 * `ID_DOCUMENT_VIEWED` audit row — not any path that leaks the key.
 * Corrected 2026-10-06; the earlier comment described a `/manus-storage/{key}`
 * proxy path, see backlog section 12.2.
 *
 * `purgeAfter` is computed at write time so the retention job (OQ 3) is a
 * single indexed scan rather than a date calculation per row. `idNumberMasked`
 * holds only enough of the number to tell two applicants apart.
 *
 * `centerId` is denormalised from center_staff at upload time so the review
 * queue can scope a staff member to their own centre without a join on every
 * row, per the accepted recommendation for sub-decision 5.2(b).
 */
export const citizenIdDocuments = mysqlTable("citizen_id_documents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileName: varchar("fileName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: int("sizeBytes"),
  /** Staff-selected at review. Not an allowlist: OQ 2 accepts any valid ID. */
  idType: varchar("idType", { length: 40 }),
  /** Masked only. The full number is never stored. */
  idNumberMasked: varchar("idNumberMasked", { length: 40 }),
  /** The address read off the ID. Stored so an approval can be explained later. */
  addressOnId: text("addressOnId"),
  status: mysqlEnum("status", ["PENDING", "APPROVED", "REJECTED"]).default("PENDING").notNull(),
  reviewedBy: int("reviewedBy").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  rejectionReason: varchar("rejectionReason", { length: 60 }),
  rejectionNote: text("rejectionNote"),
  centerId: int("centerId").references(() => evacuationCenters.id),
  /** Retention deadline. Index drives the purge job. */
  purgeAfter: timestamp("purgeAfter"),
  /** Set once the image has actually been deleted, so the record stays auditable. */
  purgedAt: timestamp("purgedAt"),
  /** Supersedes an earlier document when a rejected applicant resubmits (US-4). */
  supersedesId: int("supersedesId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  statusIdx: index("id_document_status_idx").on(table.status),
  purgeIdx: index("id_document_purge_idx").on(table.purgeAfter),
  userIdx: index("id_document_user_idx").on(table.userId),
}));

export const roleChangeRequests = mysqlTable("role_change_requests", {
  id: int("id").autoincrement().primaryKey(),
  requesterId: int("requesterId").notNull().references(() => users.id),
  approverId: int("approverId").references(() => users.id),
  userId: int("userId").notNull().references(() => users.id),
  fromRole: mysqlEnum("fromRole", ["user", "admin", "staff", "responder", "citizen"]).notNull(),
  toRole: mysqlEnum("toRole", ["user", "admin", "staff", "responder", "citizen"]).notNull(),
  status: mysqlEnum("status", ["PENDING", "APPROVED", "REJECTED", "EXPIRED"]).default("PENDING").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  decidedAt: timestamp("decidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type EvacuationCenter = typeof evacuationCenters.$inferSelect;
export type Evacuee = typeof evacuees.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type RiskReport = typeof riskReports.$inferSelect;
export type ReportExport = typeof reportExports.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type RoleChangeRequest = typeof roleChangeRequests.$inferSelect;
export type SafetyAdvice = typeof safetyAdvice.$inferSelect;
export type AdviceStep = typeof adviceSteps.$inferSelect;
