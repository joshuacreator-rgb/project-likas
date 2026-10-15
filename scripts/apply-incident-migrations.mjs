import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[incident-migrations] DATABASE_URL is not set; skipping");
  process.exit(0);
}

async function hasColumn(connection, columnName) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'risk_reports' AND COLUMN_NAME = ?`,
    [columnName]
  );
  return Number(rows?.[0]?.c) > 0;
}

async function run() {
  const connection = await mysql.createConnection(databaseUrl);
  try {
    if (!(await hasColumn(connection, "reportedAt"))) {
      console.log("[incident-migrations] adding reportedAt/respondedAt/resolvedAt/rejectedAt");
      await connection.query("ALTER TABLE `risk_reports` ADD `reportedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP");
      await connection.query("ALTER TABLE `risk_reports` ADD `respondedAt` timestamp NULL");
      await connection.query("ALTER TABLE `risk_reports` ADD `resolvedAt` timestamp NULL");
      await connection.query("ALTER TABLE `risk_reports` ADD `rejectedAt` timestamp NULL");
      await connection.query("UPDATE `risk_reports` SET `reportedAt` = COALESCE(`reportedAt`, `createdAt`) WHERE `reportedAt` IS NULL");
    }

    if (!(await hasColumn(connection, "complainantName"))) {
      console.log("[incident-migrations] adding complainantName");
      await connection.query("ALTER TABLE `risk_reports` ADD `complainantName` varchar(180) NULL");
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