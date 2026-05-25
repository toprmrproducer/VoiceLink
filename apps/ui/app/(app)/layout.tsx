import type { ReactNode } from "react";

import { requireUser } from "@/lib/session";
import { Sidebar } from "@/components/layout/sidebar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen flex">
      <Sidebar isSuperadmin={user.isSuperadmin} />
      <main className="flex-1 px-8 py-6">{children}</main>
    </div>
  );
}
