// Shared Tailwind class lists for elements repeated across pages.

export const pageClass =
  "mx-auto flex max-w-[1200px] flex-col gap-6 px-gutter pb-16 pt-8";

export const cardClass = "rounded-xl border border-line bg-white";

export const primaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-[15px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

export const cancelButtonClass =
  "min-h-10 rounded-lg border border-danger-line bg-white px-3 text-[13px] font-semibold text-danger hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-field bg-white px-3 text-[13px] font-semibold text-[#2B3038] hover:bg-ground";

export const inputClass =
  "box-border w-full rounded-lg border border-field bg-white px-3 font-mono text-ink placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";

export const labelClass = "text-[13px] font-semibold";

export const sectionLabelClass =
  "m-0 text-[13px] font-semibold tracking-[0.04em] text-muted";
