"use client";

import { useEffect, useState } from "react";

type LiveDriver = {
  driver_number: number;
  name?: string;
  color?: string;
  speed?: number;
  gear?: number;
  throttle?: number;
  position?: number;
  lap_number?: number;
};

type LiveSnapshot = {
  configured: boolean;
  connected: boolean;
  phase: string;
  session_key: number | null;
  session_name?: string | null;
  country_name?: string | null;
  location?: string | null;
  year?: number | null;
  last_message_at: string | null;
  message_count: number;
  error: string | null;
  drivers: LiveDriver[];
};

const API_BASE = "http://127.0.0.1:8000";

export default function LiveTimingPanel() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/live/snapshot`)
      .then((response) => response.json())
      .then((data: LiveSnapshot) => setSnapshot(data))
      .catch(() => undefined);
  }, []);

  const connected = snapshot?.connected ?? false;
  const drivers = snapshot?.drivers ?? [];
  const lastUpdated = snapshot?.last_message_at
    ? new Date(snapshot.last_message_at).toLocaleTimeString()
    : null;

  return (
    <section className="mb-4 rounded-md border border-white/10 bg-[#171f20] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-[#35d07f] shadow-[0_0_10px_#35d07f]" : "bg-[#ef5948]"}`} />
            <h2 className="text-sm font-semibold text-white">Live timing</h2>
            <span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${connected ? "text-[#35d07f]" : "text-[#ef8b7f]"}`}>
              {connected ? "On air" : snapshot?.phase === "free_archive_only" ? "Archive mode" : "Offline"}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#a8b1ac]">
            {connected
              ? `${snapshot?.session_name ?? "Session active"} · ${snapshot?.session_key ?? "detecting"} · updated ${lastUpdated ?? "waiting"}`
              : snapshot?.phase === "free_archive_only"
                ? "Free archive replay · Bahrain 2026 race data loaded · live timing is not included."
                : `Feed ${snapshot?.phase ?? "connecting"}${snapshot?.error ? ` · ${snapshot.error}` : ""}`}
          </p>
        </div>
        {connected && (
          <span className="font-mono text-xs tabular-nums text-[#a8b1ac]">
            {(snapshot?.message_count ?? 0).toLocaleString()} events
          </span>
        )}
      </div>

      {drivers.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
          {drivers.map((driver) => (
            <div
              key={driver.driver_number}
              className="flex min-w-0 items-center gap-2 border-l-2 bg-[#111819] px-2.5 py-2"
              style={{ borderColor: driver.color ?? "#59615d" }}
            >
              <span className="w-8 shrink-0 font-mono text-xs font-bold text-white">
                {driver.name ?? driver.driver_number}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-sm tabular-nums text-[#e6eae5]">
                {driver.speed == null ? "--" : `${Math.round(driver.speed)} km/h`}
              </span>
              {driver.position != null && (
                <span className="font-mono text-[10px] tabular-nums text-[#a8b1ac]">P{driver.position}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="py-2 text-xs text-[#87918b]">
          {connected ? "Waiting for car telemetry..." : "Live car readings are not part of free archive data."}
        </p>
      )}
    </section>
  );
}