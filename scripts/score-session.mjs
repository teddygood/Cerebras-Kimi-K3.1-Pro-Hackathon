#!/usr/bin/env node
/**
 * Scores sessions in OpenClaw's SQLite transcript store using the official
 * openclaw-speed-patch calculation (ui/src/pages/chat/chat-generation-speed.ts).
 *
 * Usage:
 *   node --experimental-transform-types scripts/score-session.mjs \
 *     <path-to-openclaw-agent.sqlite> <path-to-chat-generation-speed.ts> [session-id-prefix]
 */
import { DatabaseSync } from "node:sqlite";
import { zstdDecompressSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const [dbPath, speedModPath, prefix = ""] = process.argv.slice(2);
if (!dbPath || !speedModPath) {
  console.error("Usage: node --experimental-transform-types scripts/score-session.mjs <sqlite> <chat-generation-speed.ts> [sessionIdPrefix]");
  process.exit(1);
}

const { generationSpeed, formatTokensPerSecond } = await import(pathToFileURL(speedModPath).href);
const db = new DatabaseSync(dbPath, { readOnly: true });
const sids = db
  .prepare("select session_id, min(rowid) as first_row from transcript_events group by session_id order by first_row")
  .all();

for (const { session_id } of sids) {
  if (prefix && !session_id.startsWith(prefix)) continue;
  const rows = db
    .prepare("select event_json, event_zstd from transcript_events where session_id=? order by seq")
    .all(session_id);
  const msgs = rows
    .map((r) => JSON.parse(r.event_json ?? zstdDecompressSync(r.event_zstd).toString()))
    .filter((e) => e.message)
    .map((e) => e.message);
  const st = generationSpeed(msgs);
  if (!st) continue;
  console.log(`\n=== ${session_id} ===`);
  console.log(
    `OFFICIAL_UI: ${formatTokensPerSecond(st.meanTokensPerSecond)} tok/s mean · ${formatTokensPerSecond(st.p90TokensPerSecond)} p90 (server) | exact_mean=${st.meanTokensPerSecond.toFixed(2)} | calls=${st.calls} | out=${st.outputTokens} | ms=${st.generationMs.toFixed(1)}`,
  );
  let idx = 0;
  for (const m of msgs) {
    if (m.role === "assistant") {
      idx++;
      const sg = m.serverGeneration;
      const tps = sg ? (sg.outputTokens / (sg.completionMs / 1000)).toFixed(1) : "n/a";
      console.log(
        `  call#${idx}: TPS=${tps} | out=${sg?.outputTokens} | reas=${m.usage?.reasoningTokens} | in=${m.usage?.contextUsage?.promptTokens} | compMs=${sg?.completionMs?.toFixed(1)}`,
      );
    }
  }
}
