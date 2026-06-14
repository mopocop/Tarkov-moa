import { WebSocket } from "ws";
import { startServer } from "../src/index.ts";

function fail(reason: string): never {
  console.error(`FAIL: ${reason}`);
  process.exit(1);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function healthPoll(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(200);
  }
  fail("server did not become healthy within timeout");
}

function connectWs(url: string): Promise<WebSocket> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    ws.on("open", () => res(ws));
    ws.on("error", rej);
  });
}

// Smoke-test envelopes carry arbitrary payload shapes; loose typing keeps the
// assertion chain below terse without modelling every message variant.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function waitMessage(ws: WebSocket, timeoutMs = 2000): Promise<any> {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("timeout waiting for message")), timeoutMs);
    ws.once("message", (data) => {
      clearTimeout(timer);
      res(JSON.parse(String(data)));
    });
  });
}

function sendEnvelope(ws: WebSocket, kind: string, payload: unknown) {
  ws.send(
    JSON.stringify({
      v: 1,
      kind,
      from: kind === "join" || kind === "heartbeat" ? "" : "",
      ts: Date.now(),
      payload,
    }),
  );
}

async function main() {
  const server = await startServer(8799);

  await healthPoll("http://localhost:8799/health", 8000);
  console.log("server healthy");

  // Client A: create new squad
  const wsA = await connectWs("ws://localhost:8799");
  sendEnvelope(wsA, "join", { code: null, name: "A", clientId: "test-a" });
  const joinedA = await waitMessage(wsA);
  if (joinedA.kind !== "joined") fail(`A expected "joined", got "${joinedA.kind}"`);
  const squadCode: string = joinedA.payload.code;
  const aId: string = joinedA.payload.selfId;
  console.log(`A joined squad ${squadCode} as ${aId}`);

  // Client B: join same squad
  const wsB = await connectWs("ws://localhost:8799");
  sendEnvelope(wsB, "join", { code: squadCode, name: "B", clientId: "test-b" });
  const joinedB = await waitMessage(wsB);
  if (joinedB.kind !== "joined") fail(`B expected "joined", got "${joinedB.kind}"`);
  const bId: string = joinedB.payload.selfId;
  console.log(`B joined squad ${squadCode} as ${bId}`);

  // A should receive peer-join for B
  const peerJoinA = await waitMessage(wsA);
  if (peerJoinA.kind !== "peer-join") fail(`A expected "peer-join", got "${peerJoinA.kind}"`);
  if (peerJoinA.payload.member.id !== bId) fail(`peer-join member id mismatch`);
  console.log("A received peer-join for B");

  // A sends position
  sendEnvelope(wsA, "position", { mapId: "x", x: 1, y: 2, z: 3, rotation: 0 });

  // B should receive position
  const posB = await waitMessage(wsB);
  if (posB.kind !== "position") fail(`B expected "position", got "${posB.kind}"`);
  if (posB.from !== aId) fail(`position from mismatch: expected ${aId}, got ${posB.from}`);
  if (posB.payload.x !== 1) fail(`position payload mismatch`);
  console.log("B received position from A");

  // A should NOT receive its own position
  let echo = false;
  wsA.once("message", () => {
    echo = true;
  });
  await sleep(500);
  if (echo) fail("A received its own position — self-echo bug");

  // Client C: join with bad code
  const wsC = await connectWs("ws://localhost:8799");
  sendEnvelope(wsC, "join", { code: "ZZZZZZZZ", name: "C", clientId: "test-c" });
  const errC = await waitMessage(wsC);
  if (errC.kind !== "error") fail(`C expected "error", got "${errC.kind}"`);
  if (errC.payload.code !== "bad_code") fail(`C expected bad_code, got "${errC.payload.code}"`);
  console.log("C got bad_code error");

  // Cleanup
  wsA.close();
  wsB.close();
  wsC.close();
  await server.close();

  console.log("SMOKE_OK");
  process.exit(0);
}

main().catch((err) => {
  console.error(`SMOKE FAIL: ${err.message}`);
  process.exit(1);
});