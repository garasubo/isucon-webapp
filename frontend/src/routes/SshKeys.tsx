import React from "react";
import { type SshKey, errorMessage, fetchSshKeys } from "~/api";
import LoadError from "~/components/LoadError";
import { CopyIcon } from "~/components/icons";
import {
  cardClass,
  pageClass,
  secondaryButtonClass,
  sectionLabelClass,
} from "~/components/ui";

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = React.useState(false);

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
    <button type="button" onClick={copy} className={secondaryButtonClass}>
      <CopyIcon />
      {copied ? "コピーしました" : "コピー"}
    </button>
  );
};

const CodeBlock = ({ label, text }: { label: string; text: string }) => (
  <div className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className={sectionLabelClass}>{label}</h3>
      <CopyButton text={text} />
    </div>
    <pre className="m-0 whitespace-pre-wrap break-all rounded-lg bg-ground px-4 py-3 font-mono text-[13px] text-ink">
      {text}
    </pre>
  </div>
);

const KeyCard = ({ sshKey }: { sshKey: SshKey }) => (
  <section
    aria-label={sshKey.name}
    className={`${cardClass} flex flex-col gap-4 px-6 py-5`}
  >
    <h2 className="m-0 font-mono text-base font-semibold">{sshKey.name}</h2>
    <CodeBlock label="公開鍵" text={sshKey.key} />
    <CodeBlock
      label="コンテストサーバーで実行"
      text={`echo '${sshKey.key}' >> ~/.ssh/authorized_keys`}
    />
  </section>
);

const NoKeys = () => (
  <section className={`${cardClass} flex flex-col gap-1.5 px-6 py-5`}>
    <p className="m-0 text-[15px]">SSH 公開鍵が見つかりません。</p>
    <p className="m-0 text-[13px] text-muted">
      ansible の playbook を実行するか、このサーバーで{" "}
      <code className="font-mono">ssh-keygen -t ed25519</code>{" "}
      を実行して鍵を作成してください。
    </p>
  </section>
);

export default function SshKeys() {
  const [keys, setKeys] = React.useState<SshKey[]>();
  const [error, setError] = React.useState<string>();

  React.useEffect(() => {
    document.title = "SSH公開鍵 | ISUCON14 Deploy Server";
    fetchSshKeys()
      .then(setKeys)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <main className={pageClass}>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-xl font-semibold">SSH公開鍵</h1>
        <p className="m-0 text-sm text-muted">
          デプロイ時、このサーバーはこの鍵でコンテストサーバーに ssh
          接続します。コンテストサーバーの{" "}
          <code className="font-mono">~/.ssh/authorized_keys</code>{" "}
          に登録してください。
        </p>
      </div>
      {error ? (
        <LoadError message={error} />
      ) : !keys ? (
        <p className="m-0 text-muted">読み込み中…</p>
      ) : keys.length === 0 ? (
        <NoKeys />
      ) : (
        keys.map((sshKey) => <KeyCard key={sshKey.name} sshKey={sshKey} />)
      )}
    </main>
  );
}
