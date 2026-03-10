import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { url, goal } = await req.json()

  const apiKey = process.env.TINYFISH_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing TINYFISH_API_KEY' }), { status: 500 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Correct endpoint and auth header from TinyFish docs
        const response = await fetch('https://agent.tinyfish.ai/v1/automation/run-sse', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify({
            url,
            goal,
            browser_profile: 'stealth',
          }),
        })

        if (!response.ok) {
          const errText = await response.text()
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: `TinyFish ${response.status}: ${errText}` })}\n\n`
          ))
          controller.close()
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: 'No response body from TinyFish' })}\n\n`
          ))
          controller.close()
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            // Forward every raw SSE line to the client
            controller.enqueue(encoder.encode(line + '\n'))

            // Parse to detect COMPLETE event
            const dataStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
            try {
              const parsed = JSON.parse(dataStr)

              // TinyFish COMPLETE event has resultJson
              if (
                parsed.type === 'COMPLETE' ||
                parsed.resultJson !== undefined
              ) {
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ type: 'done', payload: parsed })}\n\n`
                ))
              }
            } catch {
              // not JSON — plain status text, already forwarded
            }
          }
        }

        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'stream_end' })}\n\n`
        ))
        controller.close()

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'error', message })}\n\n`
        ))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
