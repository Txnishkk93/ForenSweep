
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";
import { signup } from "@/lib/api";
import { setSession } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setLoading(true);

    try {
      const session = await signup(username, email, password);

      setSession(session.accessToken, session.user);
      router.push("/dashboard");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to create your account.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <div className="w-full max-w-sm rounded-card border border-hairline bg-surface-card p-8">
        {/* Brand */}
        <p className="text-[22px] font-medium tracking-tighter text-ink">
          ForenSweep
        </p>

        <p className="mt-1 mb-6 text-sm text-body-muted">
          Create an operator account for the forensic operations workspace.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Username */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink">
              Username
            </span>

            <input
              type="text"
              required
              minLength={3}
              maxLength={50}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="rounded border border-hairline-strong bg-surface-card px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              autoComplete="username"
            />
          </label>

          {/* Email */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink">
              Email
            </span>

            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded border border-hairline-strong bg-surface-card px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              autoComplete="email"
            />
          </label>

          {/* Password */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink">
              Password
            </span>

            <input
              type="password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded border border-hairline-strong bg-surface-card px-3 py-2 text-sm text-ink outline-none focus:border-primary"
              autoComplete="new-password"
            />
          </label>

          {/* Error */}
          {error && (
            <p className="text-[13px] text-destructive-active">
              {error}
            </p>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={loading}
            className="mt-2 w-full"
          >
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        {/* Login link */}
        <p className="mt-6 border-t border-hairline pt-5 text-center text-[13px] text-body-muted">
          Already registered?{" "}
          <Link
            href="/login"
            className="font-medium text-primary hover:text-primary-active"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}