import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { authenticateRequest, createContext } from "./context";
import { verifyDatabaseConnection } from "../db";
import { serveStatic, setupVite } from "./vite";
import { subscribeRealtime } from "./realtime";
import type { RealtimeStreamPayload } from "../../shared/citizen";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function assertProductionConfig() {
  if (process.env.NODE_ENV !== "production") return;
  const missing = [
    ["JWT_SECRET", process.env.JWT_SECRET],
    ["DATABASE_URL", process.env.DATABASE_URL],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(", ")}`
    );
  }
}

async function startServer() {
  assertProductionConfig();
  if (process.env.NODE_ENV === "production") {
    const dbConnected = await verifyDatabaseConnection();
    if (!dbConnected) {
      console.error(
        "[Server] Cannot reach DATABASE_URL. Set it and apply migrations (pnpm db:push), then restart."
      );
      process.exit(1);
    }
  }
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // SSE endpoint for real-time push to connected clients
  app.get("/api/stream", async (req, res) => {
    const user = await authenticateRequest(req);
    if (!user || (user.role !== "citizen" && user.role !== "user")) {
      res.status(user ? 403 : 401).end();
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
    const handler = (payload: RealtimeStreamPayload) => {
      try {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        return;
      }
    };
    const heartbeat = setInterval(() => {
      try {
        if (!res.writableEnded) res.write(": keep-alive\n\n");
      } catch {
        return;
      }
    }, 25000);
    const unsubscribe = subscribeRealtime(handler);
    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
