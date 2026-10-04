import React from "react";
import { Link } from "wouter";
import {
  type Task,
  cancelTask,
  errorMessage,
  fetchTasks,
  isCancelable,
  isRunning,
  reportScore,
  submitTask,
} from "~/api";
import StatusBadge from "~/components/StatusBadge";
import LoadError from "~/components/LoadError";
import { PlusIcon, UploadIcon } from "~/components/icons";
import {
  cancelButtonClass,
  cardClass,
  inputClass,
  labelClass,
  pageClass,
  primaryButtonClass,
  sectionLabelClass,
} from "~/components/ui";
import { usePolling } from "~/hooks/usePolling";
import {
  formatRelative,
  formatScore,
  formatTime,
} from "~/lib/format";

const LOG_FILE_NAMES = ["access.log", "mysql-slow.log", "stdout", "stderr"];

const STEPS = ["待機", "デプロイ", "ベンチマーク待ち", "完了"];

const ErrorText = ({ message }: { message?: string }) =>
  message ? (
    <p role="alert" className="m-0 text-[13px] text-danger">
      {message}
    </p>
  ) : null;

const TaskIdLink = ({ id }: { id: number }) => (
  <Link
    href={`/task/${id}`}
    className="font-mono font-semibold text-accent no-underline hover:text-accent-hover"
  >
    #{id}
  </Link>
);

function ReportForm({
  taskId,
  onReported,
}: {
  taskId: number;
  onReported: () => void;
}) {
  const [score, setScore] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    reportScore(taskId, Number(score), files)
      .then(onReported)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setSubmitting(false));
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 border-t border-line-soft bg-[#FAFBFC] px-6 pb-6 pt-5"
    >
      <div>
        <h3 className="m-0 text-base font-semibold">ベンチマーク結果を報告</h3>
        <p className="mb-0 mt-1 text-[13px] text-muted">
          ポータルでベンチマークを実行したあと、スコアとログを登録するとタスクが完了します。
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-[1_1_180px] flex-col gap-1.5">
          <label htmlFor="score" className={labelClass}>
            スコア
          </label>
          <input
            id="score"
            type="number"
            inputMode="numeric"
            required
            placeholder="0"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className={`${inputClass} h-14 text-2xl font-semibold`}
          />
        </div>
        <div className="flex flex-[3_1_320px] flex-col gap-1.5">
          <span id="logs-label" className={labelClass}>
            ログファイル{" "}
            <span className="font-normal text-muted">任意、複数選択可</span>
          </span>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              setFiles(Array.from(e.dataTransfer.files));
            }}
            className={`relative box-border flex min-h-14 cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-accent/25 ${
              dragging
                ? "border-accent bg-accent/5"
                : "border-[#AEB5C0] bg-white"
            }`}
          >
            <input
              type="file"
              multiple
              aria-labelledby="logs-label"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="absolute h-px w-px overflow-hidden opacity-0"
            />
            <span className="text-muted">
              <UploadIcon />
            </span>
            <span className="text-sm">
              ここにドラッグ&ドロップするか、
              <span className="font-semibold text-accent">ファイルを選択</span>
            </span>
            <span className="flex flex-wrap gap-1.5 font-mono text-xs">
              {files.length > 0
                ? files.map((file) => (
                    <span
                      key={file.name}
                      className="rounded bg-indigo-100 px-1.5 py-px text-blue-900"
                    >
                      {file.name}
                    </span>
                  ))
                : LOG_FILE_NAMES.map((name) => (
                    <span
                      key={name}
                      className="rounded bg-[#EEF0F3] px-1.5 py-px text-[#3B414B]"
                    >
                      {name}
                    </span>
                  ))}
            </span>
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <ErrorText message={error} />
        <button
          type="submit"
          disabled={submitting || score === ""}
          className={primaryButtonClass}
        >
          完了
        </button>
      </div>
    </form>
  );
}

function RunningTaskCard({
  task,
  onChange,
}: {
  task: Task;
  onChange: () => void;
}) {
  const [error, setError] = React.useState<string>();
  const deployed = task.status === "deployed";
  const currentStep = deployed ? 2 : 1;

  return (
    <section
      aria-labelledby="running-title"
      className={`${cardClass} min-w-0 flex-[999_1_560px] overflow-hidden`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-4 pt-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 id="running-title" className={sectionLabelClass}>
            実行中のタスク
          </h2>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[22px] font-semibold leading-[1.3]">
            <TaskIdLink id={task.id} />
            <span className="break-all">{task.branch}</span>
          </div>
          <div className="text-[13px] text-muted">
            {formatTime(task.created_at)}に追加、
            {deployed
              ? `${formatTime(task.updated_at)}にデプロイ完了`
              : "デプロイ中"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={task.status} />
          <button
            type="button"
            onClick={() => {
              cancelTask(task.id)
                .then(onChange)
                .catch((e) => setError(errorMessage(e)));
            }}
            className={`${cancelButtonClass} min-h-11 px-4 text-sm`}
          >
            キャンセル
          </button>
        </div>
      </div>
      <div className="px-6 pb-5">
        <ErrorText message={error} />
        <ol
          aria-label="進行状況"
          className="m-0 grid list-none grid-cols-4 gap-2 p-0"
        >
          {STEPS.map((step, i) => (
            <li
              key={step}
              aria-current={i === currentStep ? "step" : undefined}
              className="flex flex-col gap-2"
            >
              <span
                className={`h-1 rounded-sm ${
                  i <= currentStep ? "bg-accent" : "bg-[#E3E6EA]"
                }`}
              />
              <span
                className={`text-xs ${
                  i === currentStep ? "font-semibold text-ink" : "text-muted"
                }`}
              >
                {step}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {deployed ? (
        <ReportForm taskId={task.id} onReported={onChange} />
      ) : (
        <p className="m-0 border-t border-line-soft bg-[#FAFBFC] px-6 py-4 text-[13px] text-muted">
          デプロイが終わると、ここからベンチマーク結果を報告できます。
        </p>
      )}
    </section>
  );
}

const IdleCard = () => (
  <section
    aria-labelledby="running-title"
    className={`${cardClass} flex min-w-0 flex-[999_1_560px] flex-col gap-1.5 px-6 py-5`}
  >
    <h2 id="running-title" className={sectionLabelClass}>
      実行中のタスク
    </h2>
    <p className="m-0 text-[15px]">実行中のタスクはありません。</p>
    <p className="m-0 text-[13px] text-muted">
      ブランチをデプロイすると、ここに進行状況が表示されます。
    </p>
  </section>
);

function DeployCard({
  pendingTasks,
  onSubmitted,
}: {
  pendingTasks: Task[];
  onSubmitted: () => void;
}) {
  const [branch, setBranch] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    submitTask(branch.trim())
      .then(() => {
        setBranch("");
        setError(undefined);
        onSubmitted();
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setSubmitting(false));
  };

  const [nextTask] = pendingTasks;

  return (
    <section
      aria-labelledby="deploy-title"
      className={`${cardClass} px-6 py-5`}
    >
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <h2 id="deploy-title" className="m-0 text-base font-semibold">
          ブランチをデプロイ
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="branch" className={labelClass}>
            ブランチ
          </label>
          <input
            id="branch"
            type="text"
            autoComplete="off"
            placeholder="feature/..."
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className={`${inputClass} h-11 text-[15px]`}
          />
        </div>
        <button
          type="submit"
          disabled={submitting || branch.trim() === ""}
          className={primaryButtonClass}
        >
          <PlusIcon />
          デプロイする
        </button>
        <ErrorText message={error} />
        <p className="m-0 text-[13px] text-muted">
          実行中のタスクが終わると、待機中のタスクが古い順にデプロイされます。
          {pendingTasks.length === 0 && "いま待機中のタスクはありません。"}
          {pendingTasks.length === 1 && nextTask && (
            <>
              いま待機中のタスクは1件です（
              <TaskIdLink id={nextTask.id} /> {nextTask.branch}）。
            </>
          )}
          {pendingTasks.length > 1 &&
            `いま待機中のタスクは${pendingTasks.length}件です。`}
        </p>
      </form>
    </section>
  );
}

function BestScoreCard({ tasks }: { tasks: Task[] }) {
  const scored = tasks.filter(
    (t): t is Task & { score: number } =>
      t.status === "done" && t.score != null
  );
  const best = scored.reduce<(typeof scored)[number] | undefined>(
    (acc, t) => (acc === undefined || t.score > acc.score ? t : acc),
    undefined
  );

  return (
    <section
      aria-labelledby="best-title"
      className={`${cardClass} flex flex-col gap-1 px-6 py-5`}
    >
      <h2 id="best-title" className={sectionLabelClass}>
        ベストスコア
      </h2>
      <div className="font-mono text-[40px] font-bold leading-[1.15] tracking-[-0.01em]">
        {formatScore(best?.score)}
      </div>
      {best ? (
        <div className="text-[13px] text-muted">
          <TaskIdLink id={best.id} /> {best.branch}、
          {formatTime(best.updated_at)}に完了
        </div>
      ) : (
        <div className="text-[13px] text-muted">
          完了したタスクはまだありません。
        </div>
      )}
      {best && (
        <div className="mt-3.5 flex flex-col gap-3 border-t border-line-soft pt-3.5">
          <h3 className="m-0 text-[13px] font-semibold text-muted">
            完了したタスクのスコア
          </h3>
          {scored.map((t) => (
            <div key={t.id} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-3 font-mono text-[13px]">
                <span className="min-w-0 truncate">
                  <span className="text-muted">#{t.id}</span> {t.branch}
                </span>
                <span className="font-semibold">{formatScore(t.score)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-[#EEF0F3]">
                <div
                  className={`h-2 rounded ${
                    t.id === best.id ? "bg-accent" : "bg-[#AEB5C0]"
                  }`}
                  style={{
                    width: `${best.score > 0 ? Math.max(0, (t.score / best.score) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const FILTERS = [
  { id: "all", label: "すべて", match: () => true },
  { id: "active", label: "進行中", match: isCancelable },
  { id: "done", label: "完了", match: (t: Task) => t.status === "done" },
  {
    id: "failed",
    label: "失敗",
    match: (t: Task) => t.status === "deploy_failed",
  },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const HISTORY_COLUMNS =
  "grid grid-cols-[80px_minmax(200px,1.6fr)_140px_110px_150px_150px_120px] items-center px-6";

function TaskHistory({
  tasks,
  onChange,
}: {
  tasks: Task[];
  onChange: () => void;
}) {
  const [filterId, setFilterId] = React.useState<FilterId>("all");
  const [error, setError] = React.useState<string>();
  const filter = FILTERS.find((f) => f.id === filterId) ?? FILTERS[0];
  const rows = tasks.filter(filter.match);

  return (
    <section
      aria-labelledby="history-title"
      className={`${cardClass} overflow-hidden`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-6 py-3">
        <h2 id="history-title" className="m-0 text-base font-semibold">
          タスク履歴{" "}
          <span className="text-sm font-normal text-muted">
            {tasks.length}件
          </span>
        </h2>
        <div
          role="group"
          aria-label="ステータスで絞り込み"
          className="flex flex-wrap gap-1.5"
        >
          {FILTERS.map((f) => {
            const selected = f.id === filterId;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilterId(f.id)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold ${
                  selected
                    ? "border-ink bg-ink text-white"
                    : "border-field bg-white text-[#2B3038] hover:bg-ground"
                }`}
              >
                {f.label}
                <span className="font-mono font-medium opacity-80">
                  {tasks.filter(f.match).length}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {error && (
        <div className="border-b border-line-soft px-6 py-2">
          <ErrorText message={error} />
        </div>
      )}
      <div className="overflow-x-auto">
        <div role="table" aria-label="タスク履歴" className="min-w-[880px]">
          <div
            role="row"
            className={`${HISTORY_COLUMNS} bg-[#FAFBFC] text-xs font-semibold text-muted`}
          >
            <span role="columnheader" className="py-2.5">
              ID
            </span>
            <span role="columnheader" className="py-2.5">
              ブランチ
            </span>
            <span role="columnheader" className="py-2.5">
              ステータス
            </span>
            <span role="columnheader" className="py-2.5 text-right">
              スコア
            </span>
            <span role="columnheader" className="py-2.5 pl-6">
              作成日時
            </span>
            <span role="columnheader" className="py-2.5">
              更新日時
            </span>
            <span role="columnheader" className="py-2.5">
              <span className="sr-only">操作</span>
            </span>
          </div>
          {rows.length === 0 && (
            <p className="m-0 border-t border-[#EEF0F3] px-6 py-5 text-sm text-muted">
              該当するタスクはありません。
            </p>
          )}
          {rows.map((task) => (
            <div
              key={task.id}
              role="row"
              className={`${HISTORY_COLUMNS} min-h-[60px] border-t border-[#EEF0F3] text-sm`}
            >
              <span role="cell">
                <TaskIdLink id={task.id} />
              </span>
              <span role="cell" className="min-w-0 truncate pr-4 font-mono">
                {task.branch}
              </span>
              <span role="cell">
                <StatusBadge status={task.status} />
              </span>
              <span
                role="cell"
                className={`text-right font-mono font-semibold ${
                  task.score == null ? "text-subtle" : "text-ink"
                }`}
              >
                {formatScore(task.score)}
              </span>
              <span role="cell" className="flex flex-col pl-6 leading-[1.35]">
                <span className="font-mono">{formatTime(task.created_at)}</span>
                <span className="text-xs text-muted">
                  {formatRelative(task.created_at)}
                </span>
              </span>
              <span role="cell" className="flex flex-col leading-[1.35]">
                <span className="font-mono">{formatTime(task.updated_at)}</span>
                <span className="text-xs text-muted">
                  {formatRelative(task.updated_at)}
                </span>
              </span>
              <span role="cell" className="text-right">
                {isCancelable(task) && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelTask(task.id)
                        .then(() => {
                          setError(undefined);
                          onChange();
                        })
                        .catch((e) => setError(errorMessage(e)));
                    }}
                    className={cancelButtonClass}
                  >
                    キャンセル
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Index() {
  const { data, error, refresh } = usePolling(fetchTasks, 1000);

  React.useEffect(() => {
    document.title = "タスク一覧 | ISUCON14 Deploy Server";
  }, []);

  if (!data) {
    return error ? (
      <main className={pageClass}>
        <LoadError message={error} />
      </main>
    ) : (
      <p className="px-gutter py-8 text-muted">読み込み中…</p>
    );
  }

  const tasks = [...data].sort((a, b) => b.id - a.id);
  const runningTask = tasks.find(isRunning);
  const pendingTasks = tasks
    .filter((t) => t.status === "pending")
    .sort((a, b) => a.id - b.id);

  return (
    <main className={pageClass}>
      <h1 className="sr-only">タスク一覧</h1>
      {error && <LoadError message={error} />}
      <div className="flex flex-wrap items-start gap-6">
        {runningTask ? (
          // Remount per task so the report form starts empty.
          <RunningTaskCard
            key={runningTask.id}
            task={runningTask}
            onChange={refresh}
          />
        ) : (
          <IdleCard />
        )}
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
          <DeployCard pendingTasks={pendingTasks} onSubmitted={refresh} />
          <BestScoreCard tasks={tasks} />
        </div>
      </div>
      <TaskHistory tasks={tasks} onChange={refresh} />
    </main>
  );
}
