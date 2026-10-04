// Shown when polling the backend fails, e.g. 503 because backend/.env is missing.
export default function LoadError({ message }: { message: string }) {
  return (
    <section
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-danger-line bg-red-50 px-6 py-5"
    >
      <h2 className="m-0 text-base font-semibold text-danger">
        サーバーからデータを取得できません
      </h2>
      <pre className="m-0 whitespace-pre-wrap break-all font-mono text-[13px] text-ink">
        {message}
      </pre>
      <p className="m-0 text-[13px] text-muted">
        backend の .env やサーバーログを確認してください。
      </p>
    </section>
  );
}
