"use client";
import { useEffect, useRef, useState } from "react";

type Driver = { num: number; name: string; color: string };
type Point = { x: number; y: number };

type TrackMapProps = {
  drivers: Driver[];
  sessionKey: number;
  lapNumber: number;
};

export default function TrackMap({ drivers, sessionKey, lapNumber }: TrackMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [telemetry, setTelemetry] = useState<(Point[] | null)[]>([]);

  useEffect(() => {
    if (drivers.length === 0) return;

    const controller = new AbortController();
    Promise.all(
      drivers.map(async (driver) => {
        const response = await fetch(
          `http://127.0.0.1:8000/telemetry/${sessionKey}/${driver.num}/${lapNumber}`,
          { signal: controller.signal },
        );
        if (!response.ok) return null;
        const result = await response.json();
        return result.samples as Point[];
      }),
    )
      .then(setTelemetry)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Track telemetry error:", error);
        }
      });

    return () => controller.abort();
  }, [drivers, lapNumber, sessionKey]);

  useEffect(() => {
    const referenceLap = telemetry.find((lap) => lap && lap.length > 0);
    if (!referenceLap || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const xs = referenceLap.map((point) => point.x);
    const ys = referenceLap.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const padding = 42;
    const scale = Math.min(
      (canvas.width - padding * 2) / (maxX - minX),
      (canvas.height - padding * 2) / (maxY - minY)
    );

    const getCoords = (x: number, y: number) => ({
      cx: (x - minX) * scale + (canvas.width - (maxX - minX) * scale) / 2,
      cy: canvas.height - ((y - minY) * scale + (canvas.height - (maxY - minY) * scale) / 2),
    });

    let frame = 0;
    let animationId: number;
    const maxFrames = Math.max(...telemetry.map((lap) => lap?.length ?? 0));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.strokeStyle = "#58615e";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      referenceLap.forEach((point, i) => {
        const { cx, cy } = getCoords(point.x, point.y);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();

      const labelBoxes: { left: number; right: number; top: number; bottom: number }[] = [];
      drivers.forEach((driver, index) => {
        const driverLap = telemetry[index];
        if (!driverLap?.length) return;
        const point = driverLap[Math.min(frame, driverLap.length - 1)];
        const { cx, cy } = getCoords(point.x, point.y);
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = driver.color;
        ctx.fill();

        ctx.font = "bold 11px 'Cascadia Code', monospace";
        const labelWidth = ctx.measureText(driver.name).width;
        const offsets = [0, -13, 13, -26, 26, -39, 39, -52, 52, -65, 65, -78, 78, -91, 91, -104, 104];
        const labelX = cx + labelWidth + 14 < canvas.width ? cx + 9 : cx - labelWidth - 9;
        const labelOffset = offsets.find((offset) => {
          const top = cy + offset - 7;
          const candidate = {
            left: labelX - 3,
            right: labelX + labelWidth + 3,
            top: top - 2,
            bottom: top + 12,
          };
          const overlaps = labelBoxes.some((box) =>
            candidate.left < box.right
            && candidate.right > box.left
            && candidate.top < box.bottom
            && candidate.bottom > box.top
          );
          if (!overlaps) labelBoxes.push(candidate);
          return !overlaps;
        }) ?? 0;
        const labelY = cy + labelOffset;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#171f20";
        ctx.strokeText(driver.name, labelX, labelY + 4);
        ctx.fillStyle = "#f3f5f1";
        ctx.fillText(driver.name, labelX, labelY + 4);
      });

      frame = frame < maxFrames - 1 ? frame + 1 : 0;
      animationId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animationId);
  }, [telemetry, drivers]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Track replay</h2>
        <span className="text-xs tabular-nums text-[#a8b1ac]">
          Lap {lapNumber} · {telemetry.length ? telemetry.filter((lap) => lap?.length).length : drivers.length} cars
        </span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {telemetry.length === 0 ? (
          <p className="text-sm text-[#a8b1ac]">Loading race data...</p>
        ) : (
          <canvas
            ref={canvasRef}
            width={900}
            height={620}
            className="h-full max-h-155 w-full object-contain"
            aria-label={`Baku track replay, lap ${lapNumber}`}
          />
        )}
      </div>
    </div>
  );
}