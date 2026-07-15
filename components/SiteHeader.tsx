"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/plan", label: "Plan my night" },
  { href: "/relive", label: "Relive the game" },
  { href: "/how-it-works", label: "How it works" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-steel bg-bowl/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-display text-2xl font-bold uppercase tracking-wide text-ice"
        >
          <span aria-hidden="true" className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-line-red/60">
            <span className="h-1 w-1 rounded-full bg-line-red" />
          </span>
          GameLoop
        </Link>
        <nav aria-label="Primary">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-well px-3 py-1.5 text-sm font-medium motion-safe:transition-colors ${
                      active ? "bg-glass text-ice" : "text-frost hover:text-ice"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
