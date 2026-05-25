import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <LoginForm />
        <p className="text-sm text-zinc-500">
          New here?{" "}
          <Link href="/signup" className="underline">
            Create an account
          </Link>
        </p>
        <p className="text-sm text-zinc-500">
          <Link href="/forgot-password" className="underline">
            Forgot password?
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
