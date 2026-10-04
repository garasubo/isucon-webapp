export interface Task {
  id: number;
  status: string;
  branch: string;
  score: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaskDetail extends Task {
  stdout: string | null;
  stderr: string | null;
  alp_log: string | null;
  slow_log: string | null;
}

const ensureOk = async (response: Response, message: string) => {
  if (!response.ok) {
    throw new Error(`${message}: ${await response.text()}`);
  }
  return response;
};

export const fetchTasks = async (): Promise<Task[]> => {
  const response = await fetch(`/api/tasks`);
  await ensureOk(response, "Failed to fetch tasks");
  return response.json();
};

export const fetchTask = async (id: string): Promise<TaskDetail> => {
  const response = await fetch(`/api/tasks/${id}`);
  await ensureOk(response, "Failed to fetch task");
  return response.json();
};

export const submitTask = async (branch: string) => {
  const response = await fetch(
    `/api/tasks?branch=${encodeURIComponent(branch)}`,
    { method: "POST" }
  );
  await ensureOk(response, "Failed to submit task");
  return response.json();
};

const patchTask = async (
  id: number,
  body: { status: string; score?: number },
  message: string
) => {
  const response = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await ensureOk(response, message);
  return response.json();
};

export const cancelTask = (id: number) =>
  patchTask(id, { status: "canceled" }, "Failed to cancel task");

export const reportScore = async (id: number, score: number, files: File[]) => {
  if (files.length > 0) {
    // The backend picks the log type from each part's name (access.log etc.).
    const formData = new FormData();
    for (const file of files) {
      formData.append(file.name, file);
    }
    const response = await fetch(`/api/tasks/${id}/files`, {
      method: "POST",
      body: formData,
    });
    await ensureOk(response, "Failed to upload logs");
  }
  return patchTask(id, { status: "done", score }, "Failed to report score");
};

export const isRunning = (task: Task) =>
  task.status === "deploying" || task.status === "deployed";

export const isCancelable = (task: Task) =>
  isRunning(task) || task.status === "pending";

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
