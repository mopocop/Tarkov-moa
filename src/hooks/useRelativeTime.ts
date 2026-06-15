import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function useRelativeTime(timestamp: number | null): string | null {
  const { t } = useTranslation();

  // Hold "now" in state instead of reading Date.now() during render (which is
  // impure). The interval advances it every 30s, re-rendering the label.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timestamp === null) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [timestamp]);

  if (timestamp === null) return null;

  // i18next drives plural selection off the `count` option, and useTranslation
  // re-renders this on language change, so the label stays localized live.
  const seconds = Math.floor((now - timestamp) / 1000);
  if (seconds < 60) return t("time.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("time.daysAgo", { count: days });
}
