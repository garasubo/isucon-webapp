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

interface ClientData {
  tasks: {
    id: number;
    status: string;
    branch: string;
  }[];
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

export default function Index() {
  const data = useLoaderData<typeof clientLoader>();
  const tasks = data.tasks.sort((a, b) => b.id - a.id);
  const [branch, setBranch] = React.useState<string>("");
  const revalidator = useRevalidator();
  const _interval = useInterval(() => {
    revalidator.revalidate();
  }, 10000);
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
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
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>{task.id}</td>
              <td>{task.branch}</td>
              <td>{task.status}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
