import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

/**
 * Guards the resident-facing half of the approval fix: the router must tell the
 * client the truth about whether approval is outstanding, because the client
 * uses that flag to decide whether to show a resident a waiting screen.
 *
 * Every call here uses a fresh email address on purpose. Registration is rate
 * limited to 5 per hour per `register:${email}` key (routers.ts), so reusing one
 * address across this file trips the limiter and fails for the wrong reason.
 * Varying the address keeps the real limiter in play instead of mocking it.
 */

const mockedDb = vi.hoisted(() => ({
  registerLocalUser: vi.fn(),
  createCitizenIdDocument: vi.fn(),
  logActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./db", () => mockedDb);

// `attachCitizenIdDocument` in routers.ts is a wrapper: it validates the upload,
// writes it through storage, then records the row. Mocking the two boundaries it
// calls keeps these tests about the approval rule rather than about storage.
const mockedStorage = vi.hoisted(() => ({
  storagePut: vi.fn(),
  storageDelete: vi.fn(),
  storageGetSignedUrl: vi.fn(),
}));
vi.mock("./storage", () => mockedStorage);

let appRouter: typeof import("./routers").appRouter;
let caller: ReturnType<typeof appRouter.createCaller>;

function context(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as unknown as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

let sequence = 0;
/** A valid registration, unique per call so the rate limiter never interferes. */
function base() {
  sequence += 1;
  return {
    email: `resident${sequence}@gmail.com`,
    password: "a-long-enough-password",
    firstName: "Ana",
    lastName: "Resident",
    address: "123 Test Street, Pateros",
    age: 30,
    phone: "09171234567",
    role: "citizen" as const,
  };
}

/** A 1x1 PNG, the smallest thing that passes the server's upload shape. */
const TINY_PNG = {
  fileName: "id.png",
  mimeType: "image/png",
  dataBase64:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  sizeBytes: 68,
};

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret-for-registration-approval";
  ({ appRouter } = await import("./routers"));
  caller = appRouter.createCaller(context());
});

beforeEach(() => {
  vi.resetAllMocks();
  mockedDb.registerLocalUser.mockImplementation(async (input: { email: string }) => ({
    userId: 77,
    openId: "local:test",
    email: input.email,
    name: "Ana Resident",
    role: "citizen",
  }));
  mockedDb.createCitizenIdDocument.mockResolvedValue(501);
  mockedDb.logActivity.mockResolvedValue(undefined);
  mockedStorage.storagePut.mockResolvedValue({ key: "citizen-ids/77/id.png" });
  mockedStorage.storageDelete.mockResolvedValue(undefined);
});

describe("registration approval", () => {
  it("reports no approval outstanding when the resident attached no ID", async () => {
    const result = await caller.localAuth.register(base());

    expect(result.approvalRequired).toBe(false);
    expect(result.idDocumentId).toBeNull();
  });

  it("passes hasValidId false through to the db layer", async () => {
    await caller.localAuth.register(base());

    expect(mockedDb.registerLocalUser).toHaveBeenCalledWith(
      expect.objectContaining({ hasValidId: false }),
    );
  });

  it("reports approval outstanding when an ID document is attached", async () => {
    const result = await caller.localAuth.register({ ...base(), validId: TINY_PNG });

    expect(result.approvalRequired).toBe(true);
    expect(result.idDocumentId).toBe(501);
  });

  it("passes hasValidId true through to the db layer", async () => {
    await caller.localAuth.register({ ...base(), validId: TINY_PNG });

    expect(mockedDb.registerLocalUser).toHaveBeenCalledWith(
      expect.objectContaining({ hasValidId: true }),
    );
  });

  it("issues an approval token in both cases, so the session can be completed", async () => {
    const withoutId = await caller.localAuth.register(base());
    const withId = await caller.localAuth.register({ ...base(), validId: TINY_PNG });

    expect(withoutId.approvalToken).toBeTruthy();
    expect(withId.approvalToken).toBeTruthy();
  });

  it("keeps a failed ID upload recoverable rather than silently dropping the document", async () => {
    mockedDb.createCitizenIdDocument.mockRejectedValue(new Error("storage unavailable"));

    const result = await caller.localAuth.register({ ...base(), validId: TINY_PNG });

    expect(result.idUploadFailed).toBe(true);
    // The account was created PENDING before the upload was attempted, so it
    // stays PENDING and the resident still waits. That is recoverable, but only
    // inside this session: the waiting screen offers an "Upload my ID" retry,
    // and a resident who closes the tab has no way back in, because no staff
    // screen lists PENDING accounts to release. Recorded as a residual risk in
    // the backlog rather than half-fixed here; promoting the account after a
    // failed upload also needs a route to attach an ID once signed in.
    expect(result.approvalRequired).toBe(true);
  });
});