// Where the app's outbound HTTP actually happens.
//
// A desktop app should not be hostage to a security model built for websites.
// This app already got burned by exactly that: json.tarkov.dev serves
// Access-Control-Allow-Origin on /regular/maps, on /regular/traders and on every
// locale file, but not on /regular/tasks — silently, and only on that one path.
// Quests moved to the committed snapshot because of it (see getTasks), but
// /regular/maps is still fetched live, and nothing stops the same thing
// happening to it tomorrow.
//
// So requests go out through Tauri's HTTP plugin, which performs them in Rust.
// CORS is enforced by the webview, and Rust is not the webview, so that class of
// failure cannot reach the remaining live endpoint.
//
// Outside Tauri — `vite dev` in a browser, and the jsdom test environment —
// there is no plugin, so this falls back to the platform fetch.

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// undefined = not looked up yet, null = looked up and unavailable.
let pluginFetch: FetchLike | null | undefined;

function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function appFetch(input: string, init?: RequestInit): Promise<Response> {
  // Resolved at call time, never captured at module load: the tests replace
  // globalThis.fetch per case, and a captured reference would miss the stub.
  if (!inTauri()) return globalThis.fetch(input, init);

  if (pluginFetch === undefined) {
    try {
      const mod = await import('@tauri-apps/plugin-http');
      pluginFetch = mod.fetch as unknown as FetchLike;
    } catch {
      pluginFetch = null;
    }
  }

  return (pluginFetch ?? globalThis.fetch)(input, init);
}
