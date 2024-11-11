import type { MetaFunction } from "@remix-run/node";
import { Button, Form, Table } from "react-bootstrap";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import React from "react";
import { useInterval } from "usehooks-ts";

export const meta: MetaFunction = () => {
  return [
    { title: "ISUCON14 Deploy Server" },
    { name: "description", content: "ISUCON14 Deploy Server" },
  ];
};

interface Task {
  id: number;
  status: string;
  branch: string;
}

interface ClientData {
  tasks: Task[];
}

export const clientLoader = async (): Promise<ClientData> => {
  const response = await fetch(`/api/tasks`);

  const json = await response.json();
  console.log(json);
  return {
    tasks: json,
  };
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
  const response = await fetch(`/api/tasks/${id}?status=cancelled`, {
    method: "PATCH",
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
  return task.status === "deploying" || task.status === "deployed" || task.status === "pending";
}

export default function Index() {
  const data = useLoaderData<typeof clientLoader>();
  const tasks = data.tasks.sort((a, b) => b.id - a.id);
  const runningTask = getRunningTask(tasks);
  const [branch, setBranch] = React.useState<string>("");
  const revalidator = useRevalidator();
  const _interval = useInterval(() => {
    revalidator.revalidate();
  }, 10000);

  const cancelTaskThenRevalidate = async (id: number) => {
    let resp = await cancelTask(id);
    console.log(resp);
    revalidator.revalidate();
  }

  return (
      <div style={{fontFamily: "system-ui, sans-serif", lineHeight: "1.8"}}>
        {runningTask && (
            <div>
              <h1>Running Task</h1>
              <p>Task ID: {runningTask.id}</p>
              <p>Branch: {runningTask.branch}</p>
              <p>Status: {runningTask.status}</p>
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
                  revalidator.revalidate();
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
            <th>Action</th>
          </tr>
          </thead>
          <tbody>
          {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.id}</td>
                <td>{task.branch}</td>
                <td>{task.status}</td>
                <td>{isTaskCancelable(task) && <Button variant="warning" onClick={() => {
                  cancelTaskThenRevalidate(task.id).catch((e) => {
                    console.error(e);
                  });
                }}>Cancel</Button> }</td>
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
