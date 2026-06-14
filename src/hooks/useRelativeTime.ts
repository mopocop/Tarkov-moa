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
  // Hold "now" in state instead of reading Date.now() during render (which is
  // impure). The interval advances it every 30s, re-rendering the label.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timestamp === null) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [timestamp]);

  if (timestamp === null) return null;
  return format(now - timestamp);
}
