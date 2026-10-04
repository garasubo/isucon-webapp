import type { ReactNode } from "react";
import { Link } from "wouter";
import { ExternalIcon, LogoIcon } from "./icons";

const ExternalLink = ({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="inline-flex min-h-11 items-center gap-1 text-[#E3E7FF] no-underline hover:text-white"
  >
    {children}
    <ExternalIcon />
  </a>
);

export default function Header() {
  return (
    <header className="bg-ink text-white">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-gutter py-2">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2.5 text-base font-bold leading-none tracking-[0.01em] text-white no-underline"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
            <LogoIcon />
          </span>
          <span>
            ISUCON14{" "}
            <span className="font-medium text-[#AEB5C0]">Deploy Server</span>
          </span>
        </Link>
        <nav
          aria-label="外部リンク"
          className="flex flex-wrap items-center gap-x-5 text-sm"
        >
          <ExternalLink href="https://portal.isucon.net/">
            ISUCON Portal
          </ExternalLink>
          <ExternalLink href="https://github.com/garasubo/isucon14">
            GitHub
          </ExternalLink>
        </nav>
      </div>
    </header>
  );
}
