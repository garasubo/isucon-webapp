import { Button, Form, Table } from "react-bootstrap";
import { Link } from "wouter";
import React from "react";
import { usePolling } from "~/hooks/usePolling";

interface Task {
  id: number;
  status: string;
  branch: string;
  score: number;
  created_at: string;
  updated_at: string;
}

const fetchTasks = async (): Promise<Task[]> => {
  const response = await fetch(`/api/tasks`);
  if (!response.ok) {
    throw new Error(`Failed to fetch tasks: ${await response.text()}`);
  }
  return response.json();
};

const submitTask = async (branch: string) => {
  const response = await fetch(`/api/tasks?branch=${branch}`, {
    method: "POST",
  });
  if (!response.ok) {
    console.error(`Failed to submit task`);
    return Promise.reject(`Failed to submit task: ${await response.text()}`);
  }
  return response.json();
};

const cancelTask = async (id: number) => {
  const response = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "canceled" }),
  });
  if (!response.ok) {
    console.error(`Failed to cancel task`);
    return Promise.reject(`Failed to cancel task: ${await response.text()}`);
  }
  return response.json();
};

const reportScore = async (
  id: number,
  score: number,
  files: FileList | null
) => {
  if (files) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append(files[i].name, files[i]);
    }
    const response = await fetch(`/api/tasks/${id}/files`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      console.error(`Failed to upload access logs`);
      return Promise.reject(
        `Failed to upload access logs: ${await response.text()}`
      );
    }
  }
  const response = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "done", score }),
  });
  if (!response.ok) {
    console.error(`Failed to cancel task`);
    return Promise.reject(`Failed to cancel task: ${await response.text()}`);
  }
  return response.json();
};

const getRunningTask = (tasks: Task[]): Task | undefined => {
  return tasks.find(
    (task) => task.status === "deploying" || task.status === "deployed"
  );
};

const isTaskCancelable = (task: Task): boolean => {
  return (
    task.status === "deploying" ||
    task.status === "deployed" ||
    task.status === "pending"
  );
};

export default function Index() {
  const { data, refresh } = usePolling(fetchTasks, 1000);
  const tasks = [...(data ?? [])].sort((a, b) => b.id - a.id);
  const runningTask = getRunningTask(tasks);
  const [branch, setBranch] = React.useState<string>("");
  const [score, setScore] = React.useState<number>(0);
  const [files, setFiles] = React.useState<FileList | null>(null);

  React.useEffect(() => {
    document.title = "ISUCON14 Deploy Server";
  }, []);

  const cancelTaskThenRevalidate = async (id: number) => {
    const resp = await cancelTask(id);
    console.log(resp);
    refresh();
  };

  if (!data) {
    return <p>Loading...</p>;
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      {runningTask && (
        <div className="running-task">
          <h1>Running Task</h1>
          <p>
            <Link href={`/task/${runningTask.id}`}>
              Task ID: {runningTask.id}
            </Link>
          </p>
          <p>Branch: {runningTask.branch}</p>
          <p>Status: {runningTask.status}</p>
          {runningTask.status === "deployed" && (
            <div>
              <Form.Label htmlFor="inputScore">Score</Form.Label>
              <Form.Control
                id="inputScore"
                type="number"
                placeholder="score"
                value={score}
                onChange={(e) => {
                  setScore(parseInt(e.target.value));
                }}
              />
              <input
                type="file"
                placeholder="Upload access.log"
                onChange={(e) => {
                  setFiles(e.target.files);
                }}
                multiple={true}
              />
              <Button
                variant="primary"
                onClick={() => {
                  reportScore(runningTask.id, score, files)
                    .then((resp) => {
                      console.log(resp);
                      setScore(0);
                      refresh();
                    })
                    .catch((e) => {
                      console.error(e);
                    });
                }}
              >
                Report
              </Button>
            </div>
          )}
          <Button
            variant="warning"
            onClick={() => {
              cancelTaskThenRevalidate(runningTask.id).catch((e) => {
                console.error(e);
              });
            }}
          >
            Cancel
          </Button>
        </div>
      )}
      <div>
        <Form.Label htmlFor="inputBranch">DeployするBranch</Form.Label>
        <Form.Control
          id="inputBranch"
          type="text"
          placeholder="branch"
          value={branch}
          onChange={(e) => {
            setBranch(e.target.value);
          }}
        />
        <Button
          variant="primary"
          onClick={() => {
            submitTask(branch).then((resp) => {
              console.log(resp);
              setBranch("");
              refresh();
            });
          }}
        >
          Deploy
        </Button>
      </div>
      <h1>Tasks</h1>
      <Table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Branch</th>
            <th>Status</th>
            <th>Score</th>
            <th>Created At</th>
            <th>Updated At</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <Link href={`/task/${task.id}`}>{task.id}</Link>
              </td>
              <td>{task.branch}</td>
              <td>{task.status}</td>
              <td>{task.score}</td>
              <td>{task.created_at}</td>
              <td>{task.updated_at}</td>
              <td>
                {isTaskCancelable(task) && (
                  <Button
                    variant="warning"
                    onClick={() => {
                      cancelTaskThenRevalidate(task.id).catch((e) => {
                        console.error(e);
                      });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <ul>
        <li>
          <a target="_blank" href="https://portal.isucon.net/" rel="noreferrer">
            ISUCON Portal
          </a>
        </li>
        <li>
          <a
            target="_blank"
            href="https://githum.com/garasubo/isucon14"
            rel="noreferrer"
          >
            Our GitHub Repo
          </a>
        </li>
      </ul>
    </div>
  );
}
