import { Router } from 'itty-router';
import { Ai } from '@cloudflare/ai';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent';

const router = Router();

router.post('/api/chat', async (request, env: { GEMINI_API_KEY: string; AI: any; WORKERS_AI_MODEL: string; ASSETS: any }) => {
  const { messages } = await request.json() as { messages: { role: string; content: string }[] };

  if (!messages || messages.length === 0) {
    return new Response('No messages provided.', { status: 400 });
  }

  const { readable, writable } = new TransformStream();

  try {
    const requestBody = {
      contents: messages,
      generationConfig: {
        temperature: 0.9,
      },
    };

    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!geminiResponse.ok || !geminiResponse.body) {
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const reader = geminiResponse.body.getReader();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    const processStream = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          writer.close();
          break;
        }

        const chunk = decoder.decode(value);
        const data = JSON.parse(chunk);

        if (data.candidates && data.candidates[0].content.parts[0].text) {
          const text = data.candidates[0].content.parts[0].text;
          const formattedChunk = JSON.stringify({ response: text }) + '\n';
          await writer.write(encoder.encode(formattedChunk));
        }
      }
    };

    processStream().catch(e => {
        console.error("Stream processing error:", e);
        writer.close();
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });

  } catch (geminiError) {
    console.error('Gemini API call failed, falling back to Workers AI:', geminiError);

    try {
      const ai = new Ai(env.AI);
      const aiResponse = await ai.run(
        env.WORKERS_AI_MODEL,
        {
          messages: [{ role: "user", content: messages[messages.length - 1].content }],
        }
      );
      
      const aiMessage = aiResponse.response;
      const formattedChunk = JSON.stringify({ response: `(Fallback from Workers AI): ${aiMessage}` }) + '\n';
      
      return new Response(formattedChunk, {
        headers: { 'Content-Type': 'application/x-ndjson' },
      });
      
    } catch (aiError: any) {
      console.error('Workers AI also failed:', aiError);
      return new Response(JSON.stringify({ error: `Both APIs failed. Error: ${aiError.message}` }) + '\n', {
        status: 500,
        headers: { 'Content-Type': 'application/x-ndjson' },
      });
    }
  }
});

router.get('*', async (request, env) => {
  return env.ASSETS.fetch(request);
});

export default {
  fetch: router.handle,
};
