// Google Gemini image generation (Imagen) for lesson images.
//
// Needs GEMINI_API_KEY in the environment (from aistudio.google.com/apikey).
// Optional GEMINI_IMAGE_MODEL overrides the model (default imagen-3.0-generate-002).
//
// Returns { buffer, mimeType } for a generated PNG, or throws with a clear
// message the UI can show.

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';

function apiKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k || k.startsWith('replace_with')) {
    throw new Error('GEMINI_API_KEY is not set. Add it to your .env (or Render settings) -- get one free at aistudio.google.com/apikey.');
  }
  return k;
}

async function generateImage(prompt) {
  if (!prompt || !prompt.trim()) throw new Error('Please type what image you want.');
  // Uses the Gemini image-generation model via generateContent -- this works
  // with a normal AI Studio (aistudio.google.com/apikey) key, unlike the
  // Imagen "predict" endpoint which needs a Vertex/paid setup.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Generate an image: ' + prompt.trim() }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Image generation failed (${res.status}).`;
    throw new Error(msg);
  }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData || p.inline_data);
  const inline = imgPart && (imgPart.inlineData || imgPart.inline_data);
  if (!inline || !inline.data) throw new Error('The AI returned no image. Try rephrasing your prompt.');
  return { buffer: Buffer.from(inline.data, 'base64'), mimeType: inline.mimeType || inline.mime_type || 'image/png' };
}

// Text generation (for the academy report) via Gemini.
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
async function generateText(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `AI request failed (${res.status}).`);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n');
  if (!text) throw new Error('The AI returned no text. Try again.');
  return text;
}

function isConfigured() {
  const k = process.env.GEMINI_API_KEY;
  return !!(k && !k.startsWith('replace_with'));
}

module.exports = { generateImage, generateText, isConfigured };
