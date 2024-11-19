import type { MetaFunction } from "@remix-run/node";
import { Button, Form, Table } from "react-bootstrap";
import {
  ClientLoaderFunctionArgs,
  useLoaderData,
  useRevalidator,
} from "@remix-run/react";
import React from "react";
import { useInterval } from "usehooks-ts";

export const meta: MetaFunction = () => {
  return [
    { title: "Task Detail | ISUCON14 Deploy Server" },
    { name: "description", content: "ISUCON14 Deploy Server" },
  ];
};

interface Task {
  id: number;
  status: string;
  branch: string;
  score?: number;
  stdout?: string;
  stderr?: string;
  created_at: string;
  updated_at: string;
}

interface ClientData {
  task: Task;
}

export const clientLoader = async ({
  params,
}: ClientLoaderFunctionArgs): Promise<ClientData> => {
  const response = await fetch(`/api/tasks/${params.id}`);

  const json = await response.json();
  console.log(json);
  return {
    task: json,
  };
};

export default function Task() {
  const data = useLoaderData<typeof clientLoader>();
  const task = data.task;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <div>ID: {task.id}</div>
      <div>Status: {task.status}</div>
      <div>Branch: {task.branch}</div>
      <div>Score: {task.score}</div>
      <div>Created At: {task.created_at}</div>
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
