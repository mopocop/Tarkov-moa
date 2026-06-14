// The squad context object and its accessor hook, split out of SquadContext.tsx
// so that file stays a clean fast-refresh boundary (it only exports the
// <SquadProvider> component). SquadProvider imports SquadCtx from here.
import { createContext, useContext } from "react";
import type { SquadApi } from "./SquadContext";

export const SquadCtx = createContext<SquadApi | null>(null);

export function useSquad(): SquadApi {
  const ctx = useContext(SquadCtx);
  if (!ctx) throw new Error("useSquad must be used within <SquadProvider>");
  return ctx;
}
