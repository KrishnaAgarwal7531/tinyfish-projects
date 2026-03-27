import { NextRequest } from "next/server";

const TINYFISH_SSE_URL = "https://agent.tinyfish.ai/v1/automation/run-sse";

export async function POST(req: NextRequest) {
  const { sources } = await req.json();

  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    return new Response(JSON.stringify({ error: "sources array is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("started", { total: sources.length, registries: sources.map((s: any) => s.name) });

      // Fire all 7 TinyFish agents in parallel
      const promises = sources.map(async (source: any, index: number) => {
        const name = source.name || `Registry ${index + 1}`;
        const icon = source.icon || "🔍";

        send("agent_start", { index, name, icon, url: source.url, region: source.region });

        try {
          const tfRes = await fetch(TINYFISH_SSE_URL, {
            method: "POST",
            headers: {
              "X-API-Key": process.env.TINYFISH_API_KEY || "",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: source.url,
              goal: source.goal,
              browser_profile: "stealth",
            }),
          });

          if (!tfRes.ok) {
            const errText = await tfRes.text();
            send("agent_error", { index, name, error: errText });
            return { source_name: name, source_id: source.id, icon, success: false, error: errText, result: null };
          }

          // Parse TinyFish SSE stream
          const reader = tfRes.body?.getReader();
          if (!reader) {
            send("agent_error", { index, name, error: "No body" });
            return { source_name: name, source_id: source.id, icon, success: false, error: "No body", result: null };
          }

          const decoder = new TextDecoder();
          let buffer = "";
          let finalResult: any = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === "PROGRESS") {
                  send("agent_progress", { index, name, purpose: event.purpose || "Searching..." });
                }
                if (event.type === "COMPLETE") {
                  finalResult = event.result;
                }
                if (event.type === "ERROR") {
                  send("agent_error", { index, name, error: event.error || "Agent error" });
                }
              } catch { /* skip malformed */ }
            }
          }

          send("agent_done", { index, name, hasData: !!finalResult, result: finalResult });
          return { source_name: name, source_id: source.id, icon, success: !!finalResult, error: null, result: finalResult };
        } catch (e: any) {
          send("agent_error", { index, name, error: e.message });
          return { source_name: name, source_id: source.id, icon, success: false, error: e.message, result: null };
        }
      });

      const results = await Promise.allSettled(promises);
      const allResults = results.map((r) =>
        r.status === "fulfilled" ? r.value : { success: false, error: "Promise rejected", result: null }
      );

      send("all_done", { results: allResults });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
