# Development Environment Troubleshooting & Runbook

This runbook documents diagnostics, failure signatures, and safe recovery procedures for the Team Calendar monorepo running under Windows 11 ARM64 with Ubuntu under WSL 2.

---

## 1. Fast Health Check

Run the automated diagnostic suite before taking any action:

```bash
./scripts/dev-doctor.sh
```

This read-only script inspects:
- Architecture, kernel, and WSL 2 environment
- Bun, Node.js, and Git versions
- Available memory, swap usage, and Memory Pressure Stall Index (PSI)
- Filesystem capacity
- Monorepo workspace symlink integrity (checks for cyclic/orphan `@repo/*` symlinks)
- Tailwind CSS `@source` boundary rules in `@repo/design-system`
- Occupied development ports (`3000`, `3001`, `3002`, `3003`, `8288`)
- Inngest email transport configuration

To continuously profile memory and compiler processes in real time:

```bash
./scripts/dev-profile.sh 2 100
```

---

## 2. Common Failure Signatures & Root Causes

### A. Memory Exhaustion / WSL Unresponsiveness

**Symptoms:**
- Next.js development server freezes during route compilation (`○ Compiling /...`).
- Linux memory pressure (`/proc/pressure/memory`) exceeds 60-80%.
- Available memory drops below 500 MiB; swap usage approaches 4 GiB.
- The Linux kernel triggers an OOM kill (`dmesg -T | grep -i oom`).
- Windows terminal displays `Wsl/Service/0x8007274c`, `Wsl/Service/E_UNEXPECTED`, or exit codes `0xffffffff`.

**Root Causes & Prevention:**
1. **Unbounded `@source` glob in Tailwind CSS v4:**
   - In Tailwind v4, `@source "../**/*.{ts,tsx}"` in `packages/design-system/styles/globals.css` causes the Oxide scanner to walk the entire directory tree, including `node_modules`.
   - **Resolution:** Explicitly scope `@source` to source folders:
     ```css
     @source "../components/**/*.{ts,tsx}";
     @source "../hooks/**/*.{ts,tsx}";
     @source "../lib/**/*.{ts,tsx}";
     @source "../providers/**/*.{ts,tsx}";
     @source "../index.tsx";
     ```
2. **Cyclic or Orphan Workspace Symlinks:**
   - If a package dependency is removed from `package.json` (such as removing `@repo/auth` from `packages/design-system`), package managers can leave stale physical symlinks inside `node_modules/@repo/`.
   - A bidirectional reference between two packages creates an infinite filesystem loop (`packages/auth/node_modules/@repo/design-system -> packages/design-system/node_modules/@repo/auth -> ...`).
   - Compilers and directory walkers following symlinks allocate millions of paths until memory is exhausted.
   - **Resolution:** Run `./scripts/dev-doctor.sh` to detect any unregistered symlinks. Remove stale symlinks with `rm node_modules/@repo/<package>`.
3. **Turbopack Runtime Strategy Override:**
   - Never set `turbopackPluginRuntimeStrategy: "forceWorkerThreads"`. This bypasses protections against a known Node.js worker-thread teardown defect.
   - Use `turbopackPluginRuntimeStrategy: "childProcesses"` in `packages/next-config/index.ts`.

---

### B. Webpack Compilation Failure: `RangeError: Invalid array length`

**Symptoms:**
- Compiling routes produces:
  ```text
  RangeError: Invalid array length
      at Array.push (<anonymous>)
  ```

**Root Causes:**
- Caused by recursive module traversal or file scanning attempting to push items into an array exceeding the V8 maximum array length ($2^{32} - 1$, or fast array bounds around $2^{30}$).
- Confirmed cause: Directory loops in `node_modules` traversed during build or CSS scanning. Removing cyclic symlinks and scoping Tailwind `@source` resolves this completely.

---

### C. Inngest: `Notification email transport is not configured`

**Symptoms:**
- Terminal repeatedly logs every 2 minutes:
  ```text
  Inngest step error
  Error: Notification email transport is not configured.
  ```

**Root Causes:**
- The Inngest cron job `send-notification-emails` runs every 2 minutes. If any row exists in `notificationEmailQueue` with `status: "queued"`, it delegates to `sendQueuedNotificationEmails()`.
- `hasConfiguredEmailTransport()` checks both `RESEND_TOKEN` (starts with `re_`) and `RESEND_FROM` (valid email format).
- If `apps/api/.env.local` contains `RESEND_TOKEN` but lacks `RESEND_FROM`, the transport check fails closed and rejects the step.
- **Resolution:** Ensure `apps/api/.env.local` and `.env.local` include `RESEND_FROM="notifications@teamcalendar.online"`.

---

### D. Module Resolution: `Can't resolve './adapters/....js'`

**Symptoms:**
- Turbopack or Webpack reports:
  ```text
  Module not found: Can't resolve './adapters/better-auth.js'
  ```

**Root Causes:**
- Dynamic imports in TypeScript files targeting local `.ts` files should not include `.js` extensions unless using NodeNext module resolution with built outputs.
- In Next.js with Turbopack, dynamic imports such as `await import("./adapters/better-auth")` resolve `.ts` files directly.

---

## 3. Safe Recovery Procedure (Step-by-Step)

If the development environment hangs or becomes unresponsive, follow this procedure **before** resorting to restarting WSL:

### Step 1: Capture Evidence First
Do not restart WSL blindly. Check what process is stalled:
```bash
# Check memory and swap
free -h

# Check if Linux kernel fired OOM
dmesg -T | grep -i -E "oom|killed process" | tail -n 20

# Identify top memory-consuming processes
ps -eo pid,ppid,cmd,%mem,rss --sort=-rss | head -n 15
```

### Step 2: Gracefully Terminate Development Processes
Stop runaway dev servers without killing WSL or Windows processes:
```bash
# Kill dev servers on standard ports
kill $(ss -tulpn "sport = :3000 or sport = :3001 or sport = :3002 or sport = :3003 or sport = :8288" | grep -o 'pid=[0-9]*' | cut -d= -f2) 2>/dev/null || true

# Kill any orphaned next-server or inngest processes
pkill -f "next-server" || true
pkill -f "inngest dev" || true
```

### Step 3: Run Diagnostics
Verify the working tree is clean and memory has recovered:
```bash
./scripts/dev-doctor.sh
```

### Step 4: Run Isolated Bounded Tests
If testing a suspected compilation defect, do not start all monorepo apps at once. Run the single app with bounded cgroup limits:
```bash
cd apps/app
systemd-run --user --scope -p MemoryMax=4G bunx next dev -p 3000
```
This guarantees that even if a compiler process experiences unbounded allocation, it will be capped at 4 GiB and cannot starve the host system or freeze WSL.

---

## 4. Mandatory Safety Invariants

- **Never run `git clean -fdx` without backing up local `.env.local` files.**
- **Never delete or recreate the Ubuntu virtual disk (`.vhdx`).**
- **Do not modify `.wslconfig` without explicit approval.**
- **Always preserve unrelated uncommitted Git changes.**
