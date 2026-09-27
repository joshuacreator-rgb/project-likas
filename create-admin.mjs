// One-time script to create the FIRST administrator account.
// After this, use that admin account's "Invite" feature in the UI to add
// more staff/responder/admin accounts normally — you should not need to
// run this script again.
//
// Usage:
//   $env:DATABASE_URL="mysql://...."; node create-admin.mjs you@gmail.com "YourStrongPassword123!" "Your Name"

import mysql from "mysql2/promise";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";

const [, , email, password, name = "Administrator"] = process.argv;

if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL first, e.g.:");
  console.error('  $env:DATABASE_URL="mysql://user:pass@host:port/db"; node create-admin.mjs ...');
  process.exit(1);
}

if (!email || !password) {
  console.error('Usage: node create-admin.mjs you@gmail.com "YourStrongPassword123!" "Your Name"');
  process.exit(1);
}

const normalizedEmail = email.trim().toLowerCase();
const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const [existing] = await conn.execute(
    "SELECT id FROM auth_credentials WHERE email = ? LIMIT 1",
    [normalizedEmail]
  );
  if (existing.length > 0) {
    console.error(`An account with ${normalizedEmail} already exists.`);
    process.exit(1);
  }

  const openId = `local:${randomUUID()}`;
  const passwordHash = await hash(password, 12);

  const [userResult] = await conn.execute(
    `INSERT INTO users (openId, email, name, role, loginMethod, accountStatus)
     VALUES (?, ?, ?, 'admin', 'password', 'APPROVED')`,
    [openId, normalizedEmail, name.trim()]
  );
  const userId = userResult.insertId;

  await conn.execute(
    `INSERT INTO auth_credentials (userId, email, passwordHash) VALUES (?, ?, ?)`,
    [userId, normalizedEmail, passwordHash]
  );

  console.log(`✅ Administrator account created for ${normalizedEmail} (user id ${userId}).`);
  console.log("You can now log in through the Administrator role on the login screen.");
} finally {
  await conn.end();
}
