import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import client from "prom-client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.APP_PORT || 3000);

client.collectDefaultMetrics();

const appRequestsTotal = new client.Counter({
  name: "app_requests_total",
  help: "Total number of HTTP requests handled by the application",
  labelNames: ["endpoint"],
});

const appErrorsTotal = new client.Counter({
  name: "app_errors_total",
  help: "Total number of HTTP 5xx responses",
});

function logRequest(method: string, requestPath: string, statusCode: number) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: statusCode >= 500 ? "error" : "info",
    method,
    path: requestPath,
    status_code: statusCode,
    message: statusCode >= 500 ? "request completed with error" : "request completed",
  };
  console.log(JSON.stringify(entry));
}

async function startServer() {
  const app = express();

  app.use(express.json());

  app.use((req, res, next) => {
    const start = Date.now();

    res.on("finish", () => {
      const routePath = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
      appRequestsTotal.inc({ endpoint: routePath || req.path });

      if (res.statusCode >= 500) {
        appErrorsTotal.inc();
      }

      logRequest(req.method, req.path, res.statusCode);

      if (process.env.LOG_SLOW_REQUESTS === "true" && Date.now() - start > 1000) {
        console.log(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: "warn",
            method: req.method,
            path: req.path,
            status_code: res.statusCode,
            message: `slow request (${Date.now() - start}ms)`,
          }),
        );
      }
    });

    next();
  });

  let projects = [
    { id: "1", name: "Cloud Migrator", status: "Active", description: "Automated AWS migration scripts." },
    { id: "2", name: "Security Audit", status: "Pending", description: "Compliance scanning for Kubernetes clusters." },
  ];

  app.get("/api/projects", (_req, res) => {
    res.json(projects);
  });

  app.get("/api/projects/:id", (req, res) => {
    const project = projects.find((p) => p.id === req.params.id);
    if (project) {
      res.json(project);
    } else {
      res.status(404).json({ error: "Project not found" });
    }
  });

  app.post("/api/projects", (req, res) => {
    const newProject = {
      id: Math.random().toString(36).slice(2, 11),
      ...req.body,
    };
    projects.push(newProject);
    res.status(201).json(newProject);
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.get("/api/simulate-error", (_req, res) => {
    res.status(500).json({ error: "Simulated server error for observability testing" });
  });

  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "info",
        method: "SYSTEM",
        path: "/startup",
        status_code: 200,
        message: `DevOps Final server running on port ${PORT}`,
      }),
    );
  });
}

startServer();
