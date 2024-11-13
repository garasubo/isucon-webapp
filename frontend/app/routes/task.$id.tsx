import type { MetaFunction } from "@remix-run/node";
import { Button, Form, Table } from "react-bootstrap";
import {ClientLoaderFunctionArgs, useLoaderData, useRevalidator} from "@remix-run/react";
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
    created_at: string;
    updated_at: string;
}

interface ClientData {
    task: Task;
}

export const clientLoader = async ({ params }: ClientLoaderFunctionArgs): Promise<ClientData> => {
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
        <div style={{fontFamily: "system-ui, sans-serif", lineHeight: "1.8"}}>
            <div>{task.id}</div>
            <div>{task.status}</div>
            <div>{task.branch}</div>
            <div>{task.created_at}</div>
            <div>{task.updated_at}</div>
        </div>
    );
}
