// Serves run files (audio) from ./runs locally, or redirects to the public Blob copy in production.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BLOB_BASE } from "@/lib/data";

const TYPES: Record<string, string> = { ".mp3": "audio/mpeg", ".json": "application/json" };

export async function GET(_: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const rel = (await ctx.params).path.join("/");
  if (rel.includes("..")) return new Response("bad path", { status: 400 });
  if (BLOB_BASE) return Response.redirect(`${BLOB_BASE}/runs/${rel}`, 307);
  try {
    const body = await readFile(path.join(process.cwd(), "runs", rel));
    return new Response(body, { headers: { "content-type": TYPES[path.extname(rel)] ?? "application/octet-stream" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
