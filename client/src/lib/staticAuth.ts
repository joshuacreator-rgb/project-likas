const accountStorageKey = "likas-static-account";
const sessionStorageKey = "likas-static-user";

export const staticRoleCredentials = {
  admin: { email: "admin@likas.local", password: "Admin@12345" },
  staff: { email: "staff@likas.local", password: "Staff@12345" },
  responder: { email: "responder@likas.local", password: "Responder@12345" },
  citizen: { email: "citizen@likas.local", password: "Citizen@12345" },
} as const;

type StaticRole = keyof typeof staticRoleCredentials;

export type StaticAccount = {
  id: number;
  openId: string;
  name: string;
  email: string;
  password: string;
  role: StaticRole;
};

export type StaticUser = Omit<StaticAccount, "password"> & {
  loginMethod: "static-local";
  phone: null;
  isDemo: false;
  demoExpiresAt: null;
  twoFactorEnabled: false;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

export function isDatabaseUnavailable(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("database unavailable");
}

export function saveStaticAccount(input: { name: string; email: string; password: string }) {
  const account: StaticAccount = {
    id: 0,
    openId: `static-local:${crypto.randomUUID()}`,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    password: input.password,
    role: "citizen",
  };
  localStorage.setItem(accountStorageKey, JSON.stringify(account));
  setStaticSession(account);
  return toStaticUser(account);
}

export function authenticateStaticAccount(email: string, password: string) {
  const account = readStaticAccount();
  const normalizedEmail = email.trim().toLowerCase();
  const defaultRole = (Object.keys(staticRoleCredentials) as StaticRole[]).find(
    role => staticRoleCredentials[role].email === normalizedEmail && staticRoleCredentials[role].password === password,
  );
  if (defaultRole) {
    const defaultAccount: StaticAccount = {
      id: 0,
      openId: `static-demo:${defaultRole}`,
      name: defaultRole === "admin" ? "Administrator" : defaultRole === "staff" ? "Evacuation Center Staff" : defaultRole === "responder" ? "Disaster Responder" : "Citizen",
      email: normalizedEmail,
      password,
      role: defaultRole,
    };
    setStaticSession(defaultAccount);
    return toStaticUser(defaultAccount);
  }
  if (!account || account.email !== normalizedEmail || account.password !== password) return null;
  setStaticSession(account);
  return toStaticUser(account);
}

export function getStaticSession() {
  try {
    const raw = sessionStorage.getItem(sessionStorageKey);
    return raw ? JSON.parse(raw) as StaticUser : null;
  } catch {
    return null;
  }
}

export function clearStaticSession() {
  sessionStorage.removeItem(sessionStorageKey);
}

export function clearStaticDemoRole() {
  sessionStorage.removeItem("likas-static-demo-role");
}

/**
 * Drop every locally-stored preview/static role so a stale key can never
 * shadow a real backend session on the next refresh. A real login must win.
 */
export function clearStaticOverrides() {
  clearStaticDemoRole();
  clearStaticSession();
}

function readStaticAccount() {
  try {
    const raw = localStorage.getItem(accountStorageKey);
    return raw ? JSON.parse(raw) as StaticAccount : null;
  } catch {
    return null;
  }
}

function setStaticSession(account: StaticAccount) {
  sessionStorage.setItem(sessionStorageKey, JSON.stringify(toStaticUser(account)));
}

function toStaticUser(account: StaticAccount): StaticUser {
  const now = new Date();
  return {
    id: account.id,
    openId: account.openId,
    name: account.name,
    email: account.email,
    role: account.role,
    loginMethod: "static-local",
    phone: null,
    isDemo: false,
    demoExpiresAt: null,
    twoFactorEnabled: false,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}
