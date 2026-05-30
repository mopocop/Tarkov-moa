import { useEffect, useState } from "react";

function format(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function useRelativeTime(timestamp: number | null): string | null {
  const [, tick] = useState(0);

  useEffect(() => {
    if (timestamp === null) return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [timestamp]);

  if (timestamp === null) return null;
  return format(Date.now() - timestamp);
}
