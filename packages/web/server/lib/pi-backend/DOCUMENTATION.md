# pi backend

## Purpose

`packages/web/server/lib/pi-backend` runs Pichamber against the `pi` coding
agent CLI instead of OpenCode. The shared UI talks to one backend contract: the
OpenCode 2.x HTTP API on `/api/*`. pi has no HTTP server, so this module serves
that contract on a loopback port and drives `pi --mode rpc` behind it. The
existing proxy, event hub, readiness gate and credential reader keep working
because they only ever see HTTP.

Pichamber runs pi as its only agent. The adapter is started on every boot;
there is no OpenCode fallback.

## Modules

- `server.js` — starts the adapter on `127.0.0.1:0` and returns the port the
  lifecycle uses as `openCodePort`.
- `api-app.js` — the Express app: the `/api/*` subset the UI calls, plus the
  `/api/event` SSE stream the global event hub reads.
- `runtime.js` — one `pi --mode rpc` process per session, started on the first
  prompt and closed after ten idle minutes.
- `rpc-process.js` — one child: LF-only JSONL framing, command/response
  correlation, bounded stderr tail, orderly shutdown.
- `schemas.js` — zod schemas at every boundary (RPC records, session lines,
  agent-directory files) and the decoders that turn them into tagged values.
- `event-translator.js` — pi session events to OpenCode wire events, in the
  order the browser reducer requires.
- `projection.js` — pi session/message records to OpenCode `SessionInfo` and
  `SessionMessageInfo`.
- `session-store.js` — reading pi's session JSONL files: listing, the active
  branch, and finding a session by id.
- `thinking.js` — the thinking levels a model accepts, projected as the UI's
  model variants.
- `generate.js` — one `pi --print` run: the transport behind Pichamber's
  small-model routes.
- `config.js` — pi's `settings.json`, `models.json`, `models-store.json`,
  `auth.json`, `mcp.json`, prompt templates, skills and extensions.
- `routes.js` — Pichamber's own `/api/pi/*` routes for the Settings pages.

## Invariants

- **The wire shapes are OpenCode's.** `projection.js`, `event-translator.js` and
  `api-app.js` are the only places that know pi's vocabulary. Response
  envelopes matter: `/api/config` is a bare array, `/api/session` is
  `{ data, cursor }`, the catalog routes are `{ location, data }`.
- **Message ids survive a reload.** A pi message carries no id, so the
  projection derives one from the message timestamp, which both the live RPC
  stream and the persisted entry carry. The prompt route remembers the id the
  browser minted and a history read maps it back onto the same turn, so the
  user's optimistic message is not duplicated. Part ordinals count per kind
  (text, reasoning) in content order.
- **Tool results fold into the tool part.** pi stores them as their own
  messages; `projection.js` matches by `toolCallId`, and the translator keeps
  `toolCallId → assistant message` because `tool_execution_*` arrives after the
  assistant `message_end`.
- **A session is one file.** Sessions live under
  `<agent-dir>/sessions/--<encoded cwd>--/`; listing reads the files, never a
  process. A new session's header is written by the adapter so the id exists
  before the first prompt.
- **Unsupported is empty, not faked.** pi has one agent, no permission prompts,
  no forms and no inbox; those routes return well-formed empty results.
- **Thinking levels travel as model variants.** The composer's effort picker
  reads `variants` from `/api/model`, so `thinking.js` lists the levels pi would
  accept for each model; a model without `reasoning` lists none. A session's
  `POST /api/session/:id/model` with a `variant` sends `set_thinking_level`
  after `set_model`, and without one leaves pi's own level choice alone.
- **Background generation runs pi once.** `/api/experimental/generate` answers
  Pichamber's small-model routes with a `pi --print` child: no session file, no
  tools, no `AGENTS.md`, the prompt on stdin and the assistant text on stdout.
  Code that needs an answer signed by a model without touching a transcript
  goes there. `/api/session/:id/generate` runs against a temporary copy of the
  session file, preserving its active branch and model without changing the
  original transcript; the copy is removed after the child exits.
- **The directory header is read the way OpenCode reads it.** The SDK sends
  `x-opencode-directory` URI-encoded with no marker, so a percent escape means
  encoded; `spaces/dispatcher.js` follows the same rule.
- **Credentials never leave `config.js`.** Only provider ids and credential
  type are returned; `GET /api/credential` projects `auth.json` into the shape
  quota, voice and routing read.

## Where the server wires it in

- `packages/web/server/index.js` — `bootstrapOpenCodeAtStartup` starts the
  adapter, sets `openCodeBaseUrl` and `openCodePort`, and marks the runtime
  external so the lifecycle does not try to kill or restart a port it does not
  own. `closePiBackend` runs from the graceful shutdown path.
- `packages/web/server/lib/opencode/shutdown-runtime.js` — `closeAgentBackend`.
- `packages/web/server/lib/opencode/feature-routes-runtime.js` — mounts
  `registerPiRoutes`.
