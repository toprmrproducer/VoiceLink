import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";

import { getCurrentUser } from "@/lib/session";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <Link href="/" className="mb-8 text-xl font-semibold tracking-tight">
        voice-platform
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
