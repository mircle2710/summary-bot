"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "홈" },
  { href: "/channels", label: "채널" },
  { href: "/summarize", label: "요약" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="site-nav">
      <Link href="/" className="brand">
        <span className="brand-mark" aria-hidden />
        <span className="brand-text">요약봇</span>
      </Link>
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
    </header>
  );
}
