# Vendored libraries

- `anthropic-sdk.mjs`: Anthropic TypeScript SDK (`@anthropic-ai/sdk`) 1.7.0, bundled for the browser with esbuild (`--bundle --format=esm --platform=browser --minify`). Used only when sign-in is not set up and a key is saved in the browser. License: Apache 2.0, see `anthropic-sdk.LICENSE`.
- `supabase.mjs`: Supabase JS client (`@supabase/supabase-js`) 2.119.0, bundled the same way. License: MIT, see `supabase.LICENSE`.
