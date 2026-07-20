"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SettingsModal } from "./SettingsModal";

const links = [
  { href: "/", label: "홈" },
  { href: "/channels", label: "채널" },
  { href: "/summarize", label: "요약" },
  { href: "/expert", label: "전문 답변" },
];

export function Nav() {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <header className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-text">요약봇</span>
        </Link>
        <div className="nav-right">
          <nav className="nav-links">
            {links.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={active ? "nav-link active" : "nav-link"}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            className="btn btn-secondary nav-settings"
            onClick={() => setSettingsOpen(true)}
          >
            설정
          </button>
        </div>
      </header>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
