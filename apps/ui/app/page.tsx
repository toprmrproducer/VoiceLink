import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Superadmins land on the admin panel; tenant users land on their dashboard.
  redirect(user.isSuperadmin ? "/admin/tenants" : "/dashboard");
}
