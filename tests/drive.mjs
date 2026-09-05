// Minimal CDP driver: opens a URL in headless Chrome, optionally evaluates
// expressions over time, and captures screenshots.
// Usage: node drive.mjs <url> <seconds> <shot.png> [pollExpr] [actionJs@seconds]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const [url, seconds, shotPath, pollExpr, ...actions] = process.argv.slice(2);
const port = 9333 + Math.floor(Math.random() * 200);
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new", "--disable-gpu-sandbox", "--enable-unsafe-webgpu",
    `--remote-debugging-port=${port}`, "--user-data-dir=/tmp/cdp-" + port,
    "--window-size=1280,800", "about:blank",
  ],
  { stdio: "ignore" }
);
const done = (code) => { chrome.kill(); process.exit(code); };
process.on("SIGINT", () => done(1));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50; i++) {
  await wait(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === "page");
    if (target) break;
  } catch {}
}
if (!target) { console.error("no chrome target"); done(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
    console.log(`[console.${msg.params.type}]`, text.slice(0, 500));
  }
  if (msg.method === "Runtime.exceptionThrown") {
    console.log("[exception]", JSON.stringify(msg.params.exceptionDetails).slice(0, 800));
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });

const totalMs = Number(seconds) * 1000;
const start = Date.now();
const timedActions = actions.map((a) => {
  const at = a.lastIndexOf("@");
  return { js: a.slice(0, at), t: Number(a.slice(at + 1)) * 1000, fired: false };
});
while (Date.now() - start < totalMs) {
  await wait(500);
  for (const action of timedActions) {
    if (!action.fired && Date.now() - start >= action.t) {
      action.fired = true;
      await send("Runtime.evaluate", { expression: action.js, awaitPromise: false });
      console.log("[action]", action.js.slice(0, 120));
    }
  }
  if (pollExpr) {
    const res = await send("Runtime.evaluate", { expression: pollExpr, returnByValue: true });
    const value = res.result?.result?.value;
    if (value && String(value).includes("__DONE__")) { console.log(value.replace("__DONE__", "")); break; }
  }
}
if (pollExpr) {
  const res = await send("Runtime.evaluate", { expression: pollExpr, returnByValue: true });
  console.log("[final]", String(res.result?.result?.value ?? "").replace("__DONE__", ""));
}
const shot = await send("Page.captureScreenshot", { format: "png" });
if (shot.result?.data) writeFileSync(shotPath, Buffer.from(shot.result.data, "base64"));
console.log("[shot]", shotPath);
done(0);
