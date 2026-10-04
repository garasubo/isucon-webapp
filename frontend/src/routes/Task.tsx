import React from "react";
import { useParams } from "wouter";
import { usePolling } from "~/hooks/usePolling";

interface Task {
  id: number;
  status: string;
  branch: string;
  score?: number;
  stdout?: string;
  stderr?: string;
  alp_log?: string;
  slow_log?: string;
  created_at: string;
  updated_at: string;
}

const fetchTask = async (id: string): Promise<Task> => {
  const response = await fetch(`/api/tasks/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch task: ${await response.text()}`);
  }
  return response.json();
};

export default function Task() {
  const { id } = useParams<{ id: string }>();
  const { data: task } = usePolling(() => fetchTask(id), 1000);

  React.useEffect(() => {
    document.title = "Task Detail | ISUCON14 Deploy Server";
  }, []);

  if (!task) {
    return <p>Loading...</p>;
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <div>ID: {task.id}</div>
      <div>Status: {task.status}</div>
      <div>Branch: {task.branch}</div>
      <div>Score: {task.score}</div>
      <div>Created At: {task.created_at}</div>
      {task.alp_log && (
        <div className="task-alp-log">
          <h2>alp log</h2>
          <pre>{task.alp_log}</pre>
        </div>
      )}
      {task.slow_log && (
        <div className="task-slow-log">
          <h2>slow log</h2>
          <pre>{task.slow_log}</pre>
        </div>
      )}
      {task.stdout && (
        <div className="task-stdout">
          <h2>stdout</h2>
          <pre>{task.stdout}</pre>
        </div>
      )}
      {task.stderr && (
        <div className="task-stderr">
          <h2>stderr</h2>
          <pre>{task.stderr}</pre>
        </div>
      )}
      <div>Last Update:{task.updated_at}</div>
    </div>
  );
}
