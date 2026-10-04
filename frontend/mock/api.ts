/// <reference types="node" />
/**
 * In-memory mock of the backend API (backend/src/main.rs) for running the
 * frontend without the Rust server / MySQL. Enabled by `npm run dev:mock`.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

interface MockTask {
  id: number;
  branch: string;
  status: string;
  score: number | null;
  created_at: string;
  updated_at: string;
  stdout: string | null;
  stderr: string | null;
  alp_log: string | null;
  slow_log: string | null;
}

// Seconds a task stays in "deploying" before becoming "deployed".
const DEPLOY_SECONDS = 3;

// Uploaded file name -> TaskDetail field, same as get_task_handler.
const FILE_FIELDS: Record<string, keyof MockTask> = {
  stdout: "stdout",
  stderr: "stderr",
  "access.log": "alp_log",
  "mysql-slow.log": "slow_log",
};

// RFC 3339 with local offset, like chrono::DateTime<Local>.
const timestamp = (date = new Date()): string => {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${offset >= 0 ? "+" : "-"}${pad(offset / 60)}:${pad(offset % 60)}`
  );
};

const minutesAgo = (minutes: number) =>
  timestamp(new Date(Date.now() - minutes * 60 * 1000));

const newTask = (id: number, branch: string, fields: Partial<MockTask> = {}) => {
  const now = timestamp();
  return {
    id,
    branch,
    status: "pending",
    score: null,
    created_at: now,
    updated_at: now,
    stdout: null,
    stderr: null,
    alp_log: null,
    slow_log: null,
    ...fields,
  };
};

const tasks: MockTask[] = [
  newTask(1, "main", {
    status: "done",
    score: 1234,
    created_at: minutesAgo(60),
    updated_at: minutesAgo(55),
    stdout: "Deploying main...\nRestarting services...\nDone.\n",
    alp_log: [
      "+-------+-----+------+--------+----------------------+",
      "| COUNT | 2XX | 5XX  | METHOD | URI                  |",
      "+-------+-----+------+--------+----------------------+",
      "|  1520 | 1500|   20 | GET    | /api/app/rides       |",
      "|   830 |  830|    0 | POST   | /api/app/payment     |",
      "+-------+-----+------+--------+----------------------+",
    ].join("\n"),
    slow_log: "# Query 1: 12.34 QPS, 0.56x concurrency\nSELECT * FROM rides WHERE ...\n",
  }),
  newTask(2, "feature/broken", {
    status: "deploy_failed",
    created_at: minutesAgo(40),
    updated_at: minutesAgo(39),
    stderr: "error: pathspec 'origin/feature/broken' did not match any file(s) known to git\n",
  }),
  newTask(3, "feature/index", {
    status: "canceled",
    created_at: minutesAgo(30),
    updated_at: minutesAgo(28),
  }),
  newTask(4, "feature/cache", {
    status: "done",
    score: 5678,
    created_at: minutesAgo(20),
    updated_at: minutesAgo(10),
    stdout: "Deploying feature/cache...\nDone.\n",
  }),
];
let nextId = tasks.length + 1;
const deployStartedAt = new Map<number, number>();

// Mimics task_runner: run one pending task at a time.
const tick = () => {
  const now = Date.now();
  for (const task of tasks) {
    const startedAt = deployStartedAt.get(task.id);
    if (task.status !== "deploying" || startedAt === undefined) continue;
    if (now - startedAt < DEPLOY_SECONDS * 1000) continue;
    deployStartedAt.delete(task.id);
    const failed = task.branch.includes("fail");
    task.status = failed ? "deploy_failed" : "deployed";
    task.stdout = `Deploying ${task.branch}...\n${failed ? "" : "Done.\n"}`;
    if (failed) task.stderr = `deploy command failed for ${task.branch}\n`;
    task.updated_at = timestamp();
  }
  if (tasks.some((t) => t.status === "deploying" || t.status === "deployed")) {
    return;
  }
  const pending = tasks
    .filter((t) => t.status === "pending")
    .sort((a, b) => a.id - b.id)[0];
  if (pending) {
    pending.status = "deploying";
    pending.updated_at = timestamp();
    deployStartedAt.set(pending.id, now);
  }
};

const toTask = ({ id, branch, status, score, created_at, updated_at }: MockTask) => ({
  id,
  branch,
  status,
  score,
  created_at,
  updated_at,
});

const readBody = async (req: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};

const sendJson = (res: ServerResponse, body: unknown) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

const sendError = (res: ServerResponse, status: number, message: string) => {
  res.statusCode = status;
  res.end(message);
};

const handle = async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname.replace(/\/$/, "");
  const method = req.method ?? "GET";
  const idMatch = path.match(/^\/api\/tasks\/(\d+)(\/files)?$/);
  const task = idMatch ? tasks.find((t) => t.id === Number(idMatch[1])) : undefined;

  if (path === "/api/tasks" && method === "GET") {
    return sendJson(res, tasks.map(toTask));
  }
  if (path === "/api/tasks" && method === "POST") {
    const branch = url.searchParams.get("branch");
    if (branch === null) return sendError(res, 400, "branch");
    const created = newTask(nextId++, branch);
    tasks.push(created);
    tick();
    return sendJson(res, created.id);
  }
  if (path === "/api/tasks/running" && method === "GET") {
    const running = tasks.find(
      (t) => t.status === "deploying" || t.status === "deployed"
    );
    return running ? sendJson(res, running) : sendError(res, 404, "Not Found");
  }
  if (idMatch && !idMatch[2] && method === "GET") {
    return task ? sendJson(res, task) : sendError(res, 404, "Not Found");
  }
  if (idMatch && !idMatch[2] && method === "PATCH") {
    const { status, score } = JSON.parse((await readBody(req)).toString() || "{}");
    if (status == null && score == null) {
      return sendError(res, 400, "status or score");
    }
    // The backend returns the id even when the task does not exist.
    if (task) {
      if (score != null) task.score = score;
      if (status != null) {
        task.status = status;
        deployStartedAt.delete(task.id);
      }
      task.updated_at = timestamp();
      tick();
    }
    return sendJson(res, Number(idMatch[1]));
  }
  if (idMatch && idMatch[2] && method === "POST") {
    const form = await new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": req.headers["content-type"] ?? "" },
      body: new Uint8Array(await readBody(req)),
    }).formData();
    if (task) {
      for (const [name, value] of form.entries()) {
        const field = FILE_FIELDS[name];
        if (!field) continue;
        const text = typeof value === "string" ? value : await value.text();
        Object.assign(task, { [field]: text });
      }
    }
    return sendJson(res, Number(idMatch[1]));
  }
  return sendError(res, 404, "Not Found");
};

export function mockApi(): Plugin {
  return {
    name: "mock-api",
    configureServer(server) {
      const timer = setInterval(tick, 1000);
      server.httpServer?.on("close", () => clearInterval(timer));
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api")) return next();
        handle(req, res).catch((e) => {
          console.error(e);
          sendError(res, 500, String(e));
        });
      });
    },
  };
}
