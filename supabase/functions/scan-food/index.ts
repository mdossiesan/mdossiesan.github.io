// Supabase Edge Function: scan-food
// Takes a food photo (base64) or a text description from a signed-in user, asks Claude for
// the nutrition of each item, and returns { items, note }.
// Secrets (set in Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  your Anthropic API key (required)
//   ALLOWED_EMAILS     optional comma-separated list of emails allowed to scan
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by Supabase automatically.
import Anthropic from 'npm:@anthropic-ai/sdk@1.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const MODEL = 'claude-opus-5-5';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ITEM_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['name', 'serving', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'source', 'confidence'],
  properties: {
    name: { type: 'string' }, serving: { type: 'string' }, calories: { type: 'number' }, protein_g: { type: 'number' },
    carbs_g: { type: 'number' }, fat_g: { type: 'number' }, fiber_g: { type: 'number' }, sugar_g: { type: 'number' },
    sodium_mg: { type: 'number' },
    source: { type: 'string', enum: ['label', 'product', 'estimate'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
};
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items', 'note'],
  properties: { items: { type: 'array', items: ITEM_SCHEMA }, note: { type: 'string' } },
};
const RULES = [
  '- "serving" is the amount the numbers are for, in everyday units with grams where helpful, e.g. "1 cup (185 g)".',
  '- calories in kcal; protein_g, carbs_g, fat_g, fiber_g and sugar_g in grams; sodium_mg in milligrams. Use your best single number, never a range.',
  '- "confidence" is how sure you are about the numbers.',
  '- "note" is one short sentence on what you saw or assumed.',
].join('\n');
function scanPrompt(hint: string) {
  return [
    'You are the food scanner in a calorie and macro tracking app. Look at the attached photo.',
    'It may show a plated meal, a single food or drink, the front of a packaged product, or a nutrition facts label.',
    '- List each distinct food or drink as its own item. Treat a mixed dish such as a burrito, sandwich or salad as one item.',
    '- If a nutrition label is readable, copy its per-serving numbers exactly, use the label serving size, and set "source" to "label".',
    "- If it is a recognizable packaged or restaurant product without a readable label, use that product's standard nutrition and set \"source\" to \"product\".",
    '- Otherwise estimate the visible portion and set "source" to "estimate".',
    RULES,
    '- If there is no food or drink in the photo, return no items and say what you saw in "note".',
    hint ? 'The person added this note about the photo: ' + JSON.stringify(hint.slice(0, 300)) : '',
  ].filter(Boolean).join('\n');
}
function describePrompt(text: string, hint: string) {
  return [
    'You are the nutrition estimator in a calorie and macro tracking app. The person describes what they ate.',
    '- Split it into separate items and estimate each for the amount described. If no amount is given, assume one typical serving and say so in "serving".',
    '- If they name a brand or restaurant item, use its standard nutrition and set "source" to "product"; otherwise set "source" to "estimate".',
    RULES,
    'What they ate: ' + JSON.stringify(text.slice(0, 1500)),
    hint ? 'Extra note: ' + JSON.stringify(hint.slice(0, 300)) : '',
  ].filter(Boolean).join('\n');
}

const MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type Media = typeof MEDIA[number];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  // 1. Only signed-in (and, if configured, allow-listed) users may scan.
  const auth = req.headers.get('Authorization') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (!user) return json({ error: 'Sign in to use AI scanning.' }, 401);
  const allowed = (Deno.env.get('ALLOWED_EMAILS') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes((user.email ?? '').toLowerCase())) {
    return json({ error: "This account isn't allowed to use AI scanning." }, 403);
  }
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'The AI key is not set on the server yet.' }, 500);

  // 2. Validate the request.
  let body: { image?: string; media_type?: string; text?: string; hint?: string };
  try { body = await req.json(); } catch { return json({ error: 'The request was not valid JSON.' }, 400); }
  const image = typeof body.image === 'string' ? body.image : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const hint = typeof body.hint === 'string' ? body.hint.trim() : '';
  const media = (MEDIA as readonly string[]).includes(body.media_type ?? '') ? (body.media_type as Media) : 'image/jpeg';
  if (!image && !text) return json({ error: 'Send a photo or a description.' }, 400);
  if (image.length > 7_000_000) return json({ error: 'That photo is too large. Try again with a smaller one.' }, 413);

  // 3. Ask Claude.
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: media, data: image } });
  content.push({ type: 'text', text: image ? scanPrompt(hint) : describePrompt(text, hint) });

  const client = new Anthropic({ maxRetries: 1, timeout: 140_000 });
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'The server\'s Anthropic key was rejected. Check the ANTHROPIC_API_KEY secret.' }, 502);
    if (e instanceof Anthropic.PermissionDeniedError) return json({ error: "The server's Anthropic key can't use the model." }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Too many requests right now. Wait a minute and try again.' }, 429);
    if (e instanceof Anthropic.BadRequestError) return json({ error: "Anthropic couldn't process this request: " + e.message }, 400);
    if (e instanceof Anthropic.APIConnectionTimeoutError) return json({ error: 'The AI took too long to answer. Try again.' }, 504);
    if (e instanceof Anthropic.APIConnectionError) return json({ error: "The server couldn't reach Anthropic. Try again." }, 502);
    if (e instanceof Anthropic.APIError) return json({ error: `Anthropic had a problem (error ${e.status ?? 'unknown'}). Try again in a moment.` }, 502);
    return json({ error: 'Something went wrong on the server. Try again.' }, 500);
  }
  if (res.stop_reason === 'refusal') return json({ error: 'The AI declined this one. Try a different photo, or describe the meal instead.' }, 422);
  if (res.stop_reason === 'max_tokens') return json({ error: 'The answer was cut short. Try a photo with fewer items.' }, 422);

  const out = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try {
    const parsed = JSON.parse(out);
    return json({ items: Array.isArray(parsed.items) ? parsed.items.slice(0, 20) : [], note: typeof parsed.note === 'string' ? parsed.note : '' });
  } catch {
    return json({ error: "The AI's answer couldn't be read. Try again." }, 502);
  }
});
