import { Router } from 'itty-router';
import { Ai } from '@cloudflare/ai';

// Define the streaming API endpoint for Gemini
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent';

const router = Router();

// Handle the chat API endpoint
router.post('/api/chat', async (request, env) => {
  const { messages } = await request.json();

  if (!messages || messages.length === 0) {
    return new Response('No messages provided.', { status: 400 });
  }

  // Set up a TransformStream to process and reformat the response before sending it to the client
  const { readable, writable } = new TransformStream();

  // --- Attempt to use Gemini API first ---
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

    if (!geminiResponse.ok) {
      // If Gemini API fails, throw an error to trigger the fallback
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    // Process the raw streaming response from Gemini and reformat it for the frontend
    const reader = geminiResponse.body.getReader();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    // Asynchronously process the stream
    const processStream = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          writer.close();
          break;
        }

        const chunk = decoder.decode(value);
        const data = JSON.parse(chunk);

        // Check if the chunk contains text and reformat it
        if (data.candidates && data.candidates[0].content.parts[0].text) {
          const text = data.candidates[0].content.parts[0].text;
          const formattedChunk = JSON.stringify({ response: text }) + '\n';
          await writer.write(encoder.encode(formattedChunk));
        }
      }
    };

    // Run the stream processor
    processStream().catch(e => {
        console.error("Stream processing error:", e);
        writer.close();
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'application/x-ndjson' },
    });

  } catch (geminiError) {
    console.error('Gemini API call failed, falling back to Workers AI:', geminiError);

    // --- Fallback to Workers AI ---
    try {
      const ai = new Ai(env.AI);
      // Workers AI does not support multi-turn chat directly in this way, so we send only the last message
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
      
    } catch (aiError) {
      console.error('Workers AI also failed:', aiError);
      const errorChunk = JSON.stringify({ error: `Both APIs failed. Error: ${aiError.message}` }) + '\n';
      return new Response(errorChunk, {
        status: 500,
        headers: { 'Content-Type': 'application/x-ndjson' },
      });
    }
  }
});

// Serve the static HTML page from the public directory for all other requests
router.get('*', async (request, env) => {
  return env.ASSETS.fetch(request);
});

export default {
  fetch: router.handle,
};
