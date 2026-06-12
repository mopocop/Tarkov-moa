// In-app feedback — two clicks from anywhere: spine icon → type → Send.
// One free-text field; the category chip is optional. Useful non-PII context
// (version, OS, locale, anonymous squad clientId, current map, squad state) is
// attached silently — never names, accounts, or positions.

import { useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { Modal, Button, Chip, TextArea } from "../ui";
import { FEEDBACK_URL } from "../squad/config";
import { loadIdentity } from "../squad/identity";

const TEXT_MAX = 4000;
const CATEGORIES = [
  { id: "bug", label: "Bug" },
  { id: "idea", label: "Idea" },
  { id: "praise", label: "Praise" },
] as const;

export interface FeedbackModalProps {
  onClose: () => void;
  appVersion: string | null;
  activeMapId: string | null;
  squadActive: boolean;
}

function detectOs(): string {
  const ua = navigator.userAgent;
  if (/Windows NT ([\d.]+)/.test(ua)) return `windows ${RegExp.$1}`;
  if (/Mac OS X ([\d_]+)/.test(ua)) return `macos ${RegExp.$1.replace(/_/g, ".")}`;
  if (/Linux/.test(ua)) return "linux";
  return "unknown";
}

export default function FeedbackModal({
  onClose,
  appVersion,
  activeMapId,
  squadActive,
}: FeedbackModalProps) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(FEEDBACK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          ...(category ? { category } : {}),
          meta: {
            appVersion: appVersion ?? "dev",
            os: detectOs(),
            locale: navigator.language,
            clientId: loadIdentity().clientId,
            ...(activeMapId ? { mapId: activeMapId } : {}),
            squadActive,
          },
        }),
      });
      if (res.status === 429) {
        setError("Easy there — you're sending feedback faster than we can read it. Try again in a minute.");
        setSending(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSent(true);
      setTimeout(onClose, 1600);
    } catch {
      setError("Couldn't reach the server. Your text is still here — try again in a moment.");
      setSending(false);
    }
  };

  if (sent) {
    return (
      <Modal size="sm" onClose={onClose}>
        <div className="fb-sent">
          <CheckCircle weight="fill" />
          <p>Received. Thanks, operator.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Feedback"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <span className="fb-count">
            {text.length > TEXT_MAX - 500 ? `${text.length}/${TEXT_MAX}` : ""}
          </span>
          <Button variant="primary" onClick={send} loading={sending} disabled={!text.trim()}>
            Send
          </Button>
        </>
      }
    >
      <div className="fb-body">
        <TextArea
          autoFocus
          rows={5}
          maxLength={TEXT_MAX}
          placeholder="What's broken, missing, or great? Anything helps."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
          }}
        />
        <div className="fb-chips">
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              selected={category === c.id}
              onClick={() => setCategory((cur) => (cur === c.id ? null : c.id))}
            >
              {c.label}
            </Chip>
          ))}
        </div>
        {error && <p className="fb-error">{error}</p>}
        <p className="fb-privacy">
          Sent anonymously with app version, OS and current map — no names, no positions.
        </p>
      </div>
    </Modal>
  );
}
