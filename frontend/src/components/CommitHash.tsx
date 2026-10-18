import { shortHash } from "~/lib/format";

/** The task's commit as a short hash, with the full hash on hover. */
export default function CommitHash({
  hash,
  className = "text-muted",
}: {
  hash: string | null;
  className?: string;
}) {
  if (hash == null) return null;
  return (
    <span title={hash} className={`font-mono ${className}`}>
      {shortHash(hash)}
    </span>
  );
}
