import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[incident-migrations] DATABASE_URL is not set; skipping");
  process.exit(0);
}

async function hasColumn(connection, tableName, columnName) {
  const [rows] = await connection.query(
    "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [tableName, columnName]
  );
  return Number(rows?.[0]?.c) > 0;
}

async function run() {
  const connection = await mysql.createConnection(databaseUrl);
  try {
    if (!(await hasColumn(connection, "risk_reports", "reportedAt"))) {
      console.log("[incident-migrations] adding incident timestamp triad");
      await connection.query("ALTER TABLE `risk_reports` ADD `reportedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP");
      await connection.query("ALTER TABLE `risk_reports` ADD `respondedAt` timestamp NULL");
      await connection.query("ALTER TABLE `risk_reports` ADD `resolvedAt` timestamp NULL");
      await connection.query("ALTER TABLE `risk_reports` ADD `rejectedAt` timestamp NULL");
      await connection.query("UPDATE `risk_reports` SET `reportedAt` = COALESCE(`reportedAt`, `createdAt`) WHERE `reportedAt` IS NULL");
    }

    if (!(await hasColumn(connection, "risk_reports", "complainantName"))) {
      console.log("[incident-migrations] adding complainantName");
      await connection.query("ALTER TABLE `risk_reports` ADD `complainantName` varchar(180) NULL");
    }

    if (!(await hasColumn(connection, "evacuees", "householdId"))) {
      console.log("[incident-migrations] adding householdId");
      await connection.query("ALTER TABLE `evacuees` ADD `householdId` int NULL");
    }

    try {
      await connection.query("ALTER TABLE `evacuees` MODIFY `centerId` int NULL");
    } catch (error) {
      // Already nullable or unsupported by this MySQL version.
    }

    if (!(await hasColumn(connection, "users", "activeSessionToken"))) {
      console.log("[incident-migrations] adding activeSessionToken");
      await connection.query("ALTER TABLE users ADD ctiveSessionToken varchar(128) NULL");
    }

    console.log("[incident-migrations] done");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error("[incident-migrations] failed:", error);
  process.exit(1);
});