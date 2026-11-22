#!/usr/bin/env node
// Run this repo's frontend against the shared Mula backend over HTTPS: no backend, database, SSH key
// or model on this computer. Plain Node.js with no packages, so it works the same on macOS, Linux
// and Windows. Start it with any of:
//
//   ./run-remote.sh              (macOS, Linux, WSL, Git Bash)
//   run-remote.cmd               (Windows: double-click, or type it in PowerShell or cmd)
//   npm run remote               (anywhere)
//
// Options: --no-open (don't open the browser). MULA_REMOTE_URL=https://<host> picks another Mula
// backend. Creating an account needs an invite code from whoever runs the backend. Ctrl+C stops the
// frontend. The log goes to .runtime/logs/client.log.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The shared backend (docker-compose.vps.yml, profile "public"). Only /api/* and /health answer there.
export const DEFAULT_REMOTE_URL = "https://43-173-36-209.sslip.io";
export const APP_URL = "http://127.0.0.1:3000";
const MIN_NODE_MAJOR = 20;
const READY_SECONDS = 120;

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const logDir = join(projectDir, ".runtime", "logs");
const nextBin = join(projectDir, "node_modules", "next", "dist", "bin", "next");

/** The options this launcher takes; throws on anything else. */
export function parseArgs(args) {
  const options = { open: true, help: false };
  for (const arg of args) {
    if (arg === "--no-open") options.open = false;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else throw new Error(`unknown option ${arg} (see --help)`);
  }
  return options;
}

/** The backend address without a trailing slash. The proxy sends sign-in cookies there, so it must
 * be HTTPS; plain HTTP only for this computer. */
export function checkRemoteUrl(value) {
  const url = value.trim().replace(/\/+$/, "");
  const https = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?$/.test(url);
  const local = /^http:\/\/(127\.0\.0\.1|localhost)(:[0-9]+)?$/.test(url);
  if (!https && !local) throw new Error(`MULA_REMOTE_URL must be https://<host> (got '${value}').`);
  return url;
}

/** Status code of a GET, or 0 when nothing answers in time. */
async function statusOf(url, seconds = 10) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(seconds * 1000), redirect: "manual" });
    await response.body?.cancel();
    return response.status;
  } catch {
    return 0;
  }
}

// npm is a .cmd file on Windows, which Node only starts through a shell. The arguments are fixed
// strings, so the shell never sees anything from outside.
function installFrontend() {
  return new Promise((resolve, reject) => {
    const windows = process.platform === "win32";
    let command = "npm";
    if (windows) command = "npm.cmd";
    const child = spawn(command, ["ci", "--no-audit", "--no-fund"], { cwd: projectDir, stdio: "inherit", shell: windows });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ci failed (exit ${code}). Fix the error above, then run this again.`));
    });
  });
}

function openBrowser(url) {
  let command = "xdg-open";
  let args = [url];
  if (process.platform === "darwin") command = "open";
  if (process.platform === "win32") {
    // `start` is a cmd built-in; its first quoted argument is a window title, hence the "".
    command = "cmd";
    args = ["/c", "start", "", url];
  }
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // No browser launcher (a server without a desktop): the address is printed anyway.
  }
}

async function frontendReady() {
  // Ready when the page loads and the proxy reaches the backend: a signed-out /api/auth/me is the
  // backend's 401 (502/503 would mean the backend isn't reachable).
  return (await statusOf(`${APP_URL}/`, 30)) === 200 && (await statusOf(`${APP_URL}/api/auth/me`, 30)) === 401;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Run the frontend against the shared Mula backend. Options: --no-open. Env: MULA_REMOTE_URL.");
    return 0;
  }
  const remoteUrl = checkRemoteUrl(process.env.MULA_REMOTE_URL || DEFAULT_REMOTE_URL);
  const major = Number(process.versions.node.split(".")[0]);
  if (major < MIN_NODE_MAJOR) throw new Error(`Node.js ${process.versions.node} is too old; install Node.js ${MIN_NODE_MAJOR} or newer from https://nodejs.org`);

  console.log(`Checking the Mula backend at ${remoteUrl}…`);
  const health = await statusOf(`${remoteUrl}/health`);
  if (health !== 200) throw new Error(`the backend didn't answer (status ${health}). Check your internet connection, or ask whoever runs it whether it's up.`);

  if (!existsSync(nextBin)) {
    console.log("Installing the frontend (first run only; this takes a minute)…");
    await installFrontend();
  }
  if ((await statusOf(`${APP_URL}/`, 2)) !== 0) throw new Error(`something already serves ${APP_URL} (another launcher?). Stop it first.`);

  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, "client.log");
  const log = createWriteStream(logPath);
  console.log("Starting the frontend…");
  // LARAS_BACKEND_URL is where the frontend's proxy sends /api calls (common/services/server-proxy.ts).
  // Set only for this process, so no file in the repo changes.
  const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", "3000"], {
    cwd: projectDir, env: { ...process.env, LARAS_BACKEND_URL: remoteUrl }, stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  let exited = false;
  child.on("exit", () => { exited = true; });
  const stop = () => {
    if (!exited) child.kill();
    console.log("\nMula stopped.");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  let ready = false;
  for (let second = 0; second < READY_SECONDS && !exited; second += 1) {
    if (await frontendReady()) { ready = true; break; }
    await sleep(1000);
  }
  if (!ready) {
    if (!exited) child.kill();
    throw new Error(`the frontend didn't start. See ${logPath}`);
  }

  console.log(`\nMula is ready: ${APP_URL} (backend: ${remoteUrl})`);
  console.log("New here? Choose Create account; you'll need an invite code from whoever runs this Mula.");
  console.log("Press Ctrl+C to stop.");
  if (options.open) openBrowser(APP_URL);

  if (!exited) await new Promise((resolve) => child.on("exit", resolve));
  throw new Error(`the frontend stopped. See ${logPath}`);
}

// Run only when started directly, so tests can import the helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code ?? 0)).catch((error) => {
    console.error(`run-remote: ${error.message}`);
    process.exit(1);
  });
}
