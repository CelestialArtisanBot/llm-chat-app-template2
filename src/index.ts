import { Router } from 'itty-router';
import { Ai } from '@cloudflare/ai';

// Define the streaming API endpoint for Gemini
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent';

const router = Router();

router.post('/api/chat', async (request, env) => {
  const { messages } = await request.json();

  if (!messages || messages.length === 0) {
    return new Response('No messages provided.', { status: 400 });
  }

  // Use a WritableStream to write the Gemini response directly to the client
  const { readable, writable } = new TransformStream();

  // Attempt to use Gemini API first
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
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    // Pipe the streaming response from Gemini to our client
    geminiResponse.body.pipeTo(writable);
    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain' },
    });

  } catch (geminiError) {
    console.error('Gemini API call failed, falling back to Workers AI:', geminiError);

    // Fallback to Workers AI
    try {
      const ai = new Ai(env.AI);
      const aiResponse = await ai.run(
        env.WORKERS_AI_MODEL,
        {
          messages: [{ role: "user", content: messages[messages.length - 1].content }],
        }
      );
      
      const aiMessage = aiResponse.response;
      
      return new Response(`(Fallback from Workers AI): ${aiMessage}`, {
        headers: { 'Content-Type': 'text/plain' },
      });
      
    } catch (aiError) {
      console.error('Workers AI also failed:', aiError);
      return new Response(`Both APIs failed. Error: ${aiError.message}`, { status: 500 });
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
    if (url.pathname === "/api/chat") {
      // Handle POST requests for chat
      if (request.method === "POST") {
        return handleChatRequest(request, env);
      }

      // Method not allowed for other request types
      return new Response("Method not allowed", { status: 405 });
    }

    // Handle 404 for unmatched routes
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests
 */
async function handleChatRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // Parse JSON request body
    const { messages = [] } = (await request.json()) as {
      messages: ChatMessage[];
    };

    // Add system prompt if not present
    if (!messages.some((msg) => msg.role === "system")) {
      messages.unshift({ role: "system", content: SYSTEM_PROMPT });
    }

    const response = await env.AI.run(
      MODEL_ID,
      {
        messages,
        max_tokens: 1024,
      },
      {
        returnRawResponse: true,
        // Uncomment to use AI Gateway
        // gateway: {
        //   id: "YOUR_GATEWAY_ID", // Replace with your AI Gateway ID
        //   skipCache: false,      // Set to true to bypass cache
        //   cacheTtl: 3600,        // Cache time-to-live in seconds
        // },
      },
    );

    // Return streaming response
    return response;
  } catch (error) {
    console.error("Error processing chat request:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
