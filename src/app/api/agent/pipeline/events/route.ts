import { getPipelineSnapshot, subscribePipeline } from "@/lib/pipeline/state";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events — pushes full pipeline snapshot on each webhook-driven update.
 * Connect from the Pipeline page for live agent flow + terminal.
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const data = JSON.stringify(getPipelineSnapshot());
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      send();
      const unsubscribe = subscribePipeline(send);

      const ping = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 20000);

      request.signal.addEventListener("abort", () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
