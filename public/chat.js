name = "llm-chat-app-template2"
main = "src/index.ts"
compatibility_date = "2025-04-01"
compatibility_flags = ["nodejs_compat", "global_fetch_strictly_public"]

[vars]
GEMINI_API_KEY = "{{ secrets.GEMINI_API_KEY }}"
WORKERS_AI_MODEL = "@cf/meta/llama-3-8b-instruct"

[assets]
binding = "ASSETS"
directory = "./public"

[ai]
binding = "AI"

[observability]
enabled = true

upload_source_maps = true
