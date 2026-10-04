const STATUS: Record<string, { label: string; className: string }> = {
  pending: {
    label: "待機中",
    className: "border-[#C9CED6] bg-white text-[#4B5563]",
  },
  deploying: {
    label: "デプロイ中",
    className: "border-amber-300 bg-amber-100 text-amber-800",
  },
  deployed: {
    label: "デプロイ済み",
    className: "border-indigo-300 bg-indigo-100 text-blue-900",
  },
  done: {
    label: "完了",
    className: "border-green-300 bg-green-100 text-green-800",
  },
  deploy_failed: {
    label: "デプロイ失敗",
    className: "border-red-300 bg-red-100 text-red-800",
  },
  canceled: {
    label: "キャンセル済み",
    className: "border-[#D5D9DF] bg-[#EEF0F3] text-[#4B5563]",
  },
};

export default function StatusBadge({ status }: { status: string }) {
  const { label, className } = STATUS[status] ?? {
    label: status,
    className: STATUS.canceled.className,
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}
