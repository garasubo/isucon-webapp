import type { MetaFunction } from "@remix-run/node";
import { Table } from "react-bootstrap";
import { useLoaderData } from "@remix-run/react";

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

export default function Index() {
  const data = useLoaderData<typeof clientLoader>();
  const tasks = data.tasks.sort((a, b) => b.id - a.id);
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
