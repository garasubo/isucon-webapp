import React from "react";
import { Link, useParams } from "wouter";
import { type TaskDetail, fetchTask } from "~/api";
import LoadError from "~/components/LoadError";
import StatusBadge from "~/components/StatusBadge";
import { ArrowLeftIcon, CopyIcon, DownloadIcon } from "~/components/icons";
import { cardClass, pageClass, secondaryButtonClass } from "~/components/ui";
import { usePolling } from "~/hooks/usePolling";
import { formatDateTime, formatDuration, formatScore } from "~/lib/format";

const LOGS = [
  { key: "alp_log", label: "alp", file: "access.log" },
  { key: "slow_log", label: "slow log", file: "mysql-slow.log" },
  { key: "stdout", label: "stdout", file: "stdout" },
  { key: "stderr", label: "stderr", file: "stderr" },
] as const;

type LogKey = (typeof LOGS)[number]["key"];

const FINISHED = ["done", "deploy_failed", "canceled"];

const downloadText = (text: string, fileName: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

const MetaItem = ({
  label,
  mono = true,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) => (
  <div className="bg-white px-5 py-3.5">
    <dt className="text-xs font-semibold text-muted">{label}</dt>
    <dd className={`m-0 text-[15px] ${mono ? "font-mono" : ""}`}>{children}</dd>
  </div>
);

function LogViewer({ task }: { task: TaskDetail }) {
  const available = LOGS.filter((log) => task[log.key] != null);
  const [selected, setSelected] = React.useState<LogKey>();
  const [copied, setCopied] = React.useState(false);
  // Fall back to the first registered log until the user picks a tab.
  const current =
    available.find((log) => log.key === selected) ?? available[0];
  const text = current ? task[current.key] ?? "" : "";

  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((e) => console.error(e));
  };

  return (
    <section
      aria-labelledby="logs-title"
      className={`${cardClass} overflow-hidden`}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line-soft pl-6 pr-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
          <h2 id="logs-title" className="m-0 py-3.5 text-base font-semibold">
            ログ
          </h2>
          <div role="tablist" aria-label="ログの種類" className="flex flex-wrap gap-1">
            {LOGS.map((log) => {
              const value = task[log.key];
              const isSelected = log.key === current?.key;
              return (
                <button
                  key={log.key}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  disabled={value == null}
                  onClick={() => setSelected(log.key)}
                  className={`-mb-px inline-flex min-h-12 items-center gap-2 border-0 border-b-2 bg-transparent px-3.5 font-mono text-sm font-semibold disabled:cursor-default ${
                    isSelected
                      ? "border-accent text-ink"
                      : "border-transparent text-muted disabled:text-[#9AA1AB]"
                  }`}
                >
                  {log.label}
                  <span className="font-sans text-xs font-medium text-subtle">
                    {value == null
                      ? "未登録"
                      : `${value.replace(/\n$/, "").split("\n").length}行`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {current && (
          <div className="flex items-center gap-2 py-1.5">
            <button type="button" onClick={copy} className={secondaryButtonClass}>
              <CopyIcon />
              {copied ? "コピーしました" : "コピー"}
            </button>
            <button
              type="button"
              onClick={() => downloadText(text, current.file)}
              className={secondaryButtonClass}
            >
              <DownloadIcon />
              ダウンロード
            </button>
          </div>
        )}
      </div>
      <div className="bg-[#0F1218] text-[#E3E6EB]">
        {current ? (
          <>
            <div className="border-b border-[#262B34] px-6 py-2.5 font-mono text-xs text-[#9AA3B0]">
              {current.file}
            </div>
            <pre className="m-0 box-border max-h-[560px] min-h-[360px] overflow-auto whitespace-pre px-6 pb-7 pt-5 font-mono text-[13px] leading-[1.65]">
              {text}
            </pre>
          </>
        ) : (
          <p className="m-0 px-6 py-10 text-sm text-[#9AA3B0]">
            ログはまだ登録されていません。
          </p>
        )}
      </div>
    </section>
  );
}

export default function Task() {
  const { id } = useParams<{ id: string }>();
  const { data: task, error } = usePolling(() => fetchTask(id), 1000);

  React.useEffect(() => {
    document.title = `タスク#${id} | ISUCON14 Deploy Server`;
  }, [id]);

  if (!task) {
    return error ? (
      <main className={pageClass}>
        <LoadError message={error} />
      </main>
    ) : (
      <p className="px-gutter py-8 text-muted">読み込み中…</p>
    );
  }

  const registered = LOGS.filter((log) => task[log.key] != null).length;

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-gutter pb-16 pt-4">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-accent no-underline hover:text-accent-hover"
      >
        <ArrowLeftIcon />
        タスク一覧に戻る
      </Link>

      {error && <LoadError message={error} />}

      <section
        className={`${cardClass} flex flex-wrap items-end justify-between gap-x-8 gap-y-5 p-6`}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm text-muted">タスク#{task.id}</span>
            <StatusBadge status={task.status} />
          </div>
          <h1 className="m-0 break-all font-mono text-[30px] font-semibold leading-[1.25]">
            {task.branch}
          </h1>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[13px] font-semibold tracking-[0.04em] text-muted">
            スコア
          </span>
          <span className="font-mono text-[44px] font-bold leading-[1.1] tracking-[-0.01em]">
            {formatScore(task.score)}
          </span>
        </div>
      </section>

      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-px overflow-hidden rounded-xl border border-line bg-line">
        <MetaItem label="作成日時">{formatDateTime(task.created_at)}</MetaItem>
        <MetaItem label="更新日時">{formatDateTime(task.updated_at)}</MetaItem>
        <MetaItem label="所要時間">
          {FINISHED.includes(task.status)
            ? formatDuration(task.created_at, task.updated_at)
            : "—"}
        </MetaItem>
        <MetaItem label="登録済みのログ" mono={false}>
          {LOGS.length}種類中{registered}件
        </MetaItem>
      </dl>

      <LogViewer task={task} />
    </main>
  );
}
