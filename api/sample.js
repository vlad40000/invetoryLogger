// POST /api/sample
// multipart/form-data: prompt (string), tier (quick|default), image (file)
// → { text: "<JSON string from Gemini>" }
//
// Uses the Google Gen AI SDK. Prompt stays in the client (src/extract.ts).
import { GoogleGenAI } from '@google/genai';
import { requireSession } from './_lib/session.js';
import { IncomingForm } from 'formidable';
import { readFileSync } from 'node:fs';

export const config = {
  api: {
    bodyParser: false, // formidable parses multipart.
  },
};

const MODELS = {
  quick: process.env.GEMINI_QUICK_MODEL || 'gemini-3.8-flash',
  default: process.env.GEMINI_DEFAULT_MODEL || 'gemini-3.8-flash',
};

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ maxFileSize: 20 * 1024 * 1024, keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { fields, files } = await parseForm(req);

    const prompt = Array.isArray(fields.prompt) ? fields.prompt[0] : fields.prompt;
    const tier = Array.isArray(fields.tier) ? fields.tier[0] : fields.tier;
    const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;

    if (!prompt || !imageFile) {
      return res.status(400).json({ error: 'prompt and image are required', code: 'invalid_argument' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'Gemini API key is not configured', code: 'unavailable' });
    }

    const imageBytes = readFileSync(imageFile.filepath);
    const mediaType = imageFile.mimetype || 'image/jpeg';
    const base64 = imageBytes.toString('base64');
    const model = MODELS[tier] || MODELS.quick;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          inlineData: {
            data: base64,
            mimeType: mediaType,
          },
        },
        String(prompt),
      ],
      config: {
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    });

    const text = String(response.text || '');
    return res.status(200).json({ text });
  } catch (err) {
    console.error('[sample]', err);
    const status = Number(err?.status || err?.statusCode || err?.code);
    if (status === 429) return res.status(429).json({ error: 'Rate limited', code: 'rate_limited' });
    if (status === 400) return res.status(400).json({ error: 'Gemini rejected the request', code: 'invalid_argument' });
    return res.status(500).json({ error: 'Internal server error', code: 'unavailable' });
  }
}
