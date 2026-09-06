"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { login } from "@/lib/api";
import { setSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const session = await login(identifier, password);
      setSession(session.accessToken, session.user);
      router.push("/dashboard");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to sign in.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <div className="w-full max-w-sm rounded-card border border-hairline bg-surface-card p-8">
        <p className="text-[22px] font-medium tracking-tighter text-ink">
          ForenSweep
        </p>
        <p className="mt-1 mb-6 text-sm text-body-muted">
          Sign in to access erasure, recovery, and audit tools.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink">
              Username or email
            </span>
            <input
              type="text"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="rounded border border-hairline-strong bg-surface-card px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              autoComplete="username"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-hairline-strong bg-surface-card px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              autoComplete="current-password"
            />
          </label>

          {error && <p className="text-[13px] text-destructive-active">{error}</p>}

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 border-t border-hairline pt-5 text-center text-[13px] text-body-muted">
          Need an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-primary hover:text-primary-active"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
