"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";
import { DecorativeFloaters } from "@/components/DecorativeFloaters";
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
    <div className="relative flex min-h-screen flex-col bg-white font-sans text-neutral-900">
      {/* Top Header Logo */}
      <header className="flex items-center gap-2.5 px-10 py-8">
        <div className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-black">
          <div className="h-2.5 w-2.5 rounded-[2px] border-2 border-white" />
        </div>
        <span className="text-xl font-bold tracking-tight text-black">ForenSweep</span>
      </header>

      {/* Main Container */}
      <main className="relative flex flex-1 items-center px-20 pb-16">
        <DecorativeFloaters />

        <div className="z-10 w-full max-w-[340px] pl-2">
          <p className="text-sm text-neutral-500">
            Create an operator account for the forensic operations workspace.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-600">
                Username
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={50}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-md border border-neutral-200 px-3.5 py-2.5 text-sm text-neutral-800 placeholder-neutral-400 outline-none transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
                autoComplete="username"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-600">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border border-neutral-200 px-3.5 py-2.5 text-sm text-neutral-800 placeholder-neutral-400 outline-none transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-600">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-neutral-200 px-3.5 py-2.5 text-sm text-neutral-800 outline-none transition focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
                autoComplete="new-password"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <Button
              type="submit"
              variant="dark"
              disabled={loading}
              className="mt-1 w-full rounded-md py-2.5 text-sm font-medium transition"
            >
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="mt-6 border-t border-neutral-100 pt-5 text-center text-xs text-neutral-500">
            Already registered?{" "}
            <Link href="/login" className="font-medium text-sky-500 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}