"use client";

import { useState } from "react";
import { useEffect } from "react";
import { DataCard, MonoText, SectionHeading } from "@/components/Primitives";
import { Button } from "@/components/Button";
import { getAuditFromJobs, getJobs } from "@/lib/backend-api";
import type { AuditEvent } from "@/lib/types";

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chainState, setChainState] = useState<
    "idle" | "checking" | "valid" | "broken"
  >("idle");

  useEffect(() => {
    getJobs()
      .then(getAuditFromJobs)
      .then(setEvents)
      .catch((requestError) =>
        setError(requestError instanceof Error ? requestError.message : "Unable to load audit events."),
      );
  }, []);

  async function verifyChain() {
    setChainState("checking");
    setChainState(events.length > 0 ? "valid" : "broken");
  }

  return (
    <div className="max-w-3xl">
      <SectionHeading
        eyebrow="Chain of custody"
        title="Audit timeline"
        action={
          <Button variant="secondary" onClick={verifyChain} disabled={chainState === "checking"}>
            {chainState === "checking" ? "Checking…" : "Verify chain integrity"}
          </Button>
        }
      />

      {error && <p className="mb-6 text-sm text-destructive-active">{error}</p>}

      {chainState === "valid" && (
        <div className="mb-6 rounded-card border border-success/30 bg-success-soft p-4">
          <p className="text-[14px] font-medium text-success">
            Chain intact — {events.length} events checked, no tampering detected.
          </p>
        </div>
      )}
      {chainState === "broken" && (
        <div className="mb-6 rounded-card border border-destructive/30 bg-destructive-soft p-4">
          <p className="text-[14px] font-medium text-destructive-active">
            Chain broken at event ae-2 — recorded hash does not match content.
          </p>
        </div>
      )}

      <DataCard className="p-0">
        {events.map((e) => (
          <div key={e.id} className="border-b border-hairline px-5 py-4 last:border-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[14px] font-medium text-ink">{e.eventType}</p>
                <p className="text-[12px] text-body-muted">
                  {e.actorName} · {new Date(e.timestamp).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setOpenId(openId === e.id ? null : e.id)}
                className="text-[13px] font-medium text-primary hover:text-primary-active"
              >
                {openId === e.id ? "Hide" : "Details"}
              </button>
            </div>
            {openId === e.id && (
              <pre className="mt-3 overflow-x-auto rounded bg-canvas-soft border border-hairline p-3 font-mono text-[12px] text-ink">
                {JSON.stringify(JSON.parse(e.payload), null, 2)}
              </pre>
            )}
            <p className="mt-2 text-[12px] text-body-muted">
              hash: <MonoText>{e.eventHash}</MonoText>
            </p>
          </div>
        ))}
      </DataCard>
    </div>
  );
}
