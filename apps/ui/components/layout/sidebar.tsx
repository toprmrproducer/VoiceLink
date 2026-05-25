import Link from "next/link";

import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  superadminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agents", label: "Agents" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/calls", label: "Calls" },
  { href: "/voices", label: "Voices" },
  { href: "/credits", label: "Credits" },
  { href: "/settings", label: "Settings" },
  { href: "/admin/tenants", label: "Tenants", superadminOnly: true },
];

interface Props {
  isSuperadmin: boolean;
  className?: string;
}

export function Sidebar({ isSuperadmin, className }: Props) {
  return (
    <nav
      className={cn(
        "w-56 shrink-0 border-r bg-zinc-50 dark:bg-zinc-950 px-3 py-4",
        className,
      )}
    >
      <div className="px-2 py-1 text-sm font-semibold tracking-tight">
        voice-platform
      </div>
      <ul className="mt-4 space-y-1">
        {NAV.filter((item) => !item.superadminOnly || isSuperadmin).map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block rounded px-2 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
