// POST /api/sample
// multipart/form-data: prompt (string), tier (quick|default), image (file)
// → { text: "<JSON string from Claude>" }
//
// Uses Anthropic Messages API. Prompt stays in the client (src/extract.ts).
import Anthropic from '@anthropic-ai/sdk';
import { requireSession } from './_lib/session.js';
import { IncomingForm } from 'formidable';
import { readFileSync } from 'node:fs';

export const config = {
  api: {
    bodyParser: false, // formidable parses multipart.
  },
};

const MODELS = {
  quick: 'claude-haiku-4-5-20251001',
  default: 'claude-sonnet-5',
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

    const imageBytes = readFileSync(imageFile.filepath);
    const mediaType = imageFile.mimetype || 'image/jpeg';
    const base64 = imageBytes.toString('base64');

    const model = MODELS[tier] || MODELS.quick;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: String(prompt) },
          ],
        },
      ],
    });

    const text = message.content.find((c) => c.type === 'text')?.text ?? '';
    return res.status(200).json({ text });
  } catch (err) {
    console.error('[sample]', err);
    if (err?.status === 429) return res.status(429).json({ error: 'Rate limited', code: 'rate_limited' });
    return res.status(500).json({ error: 'Internal server error', code: 'unavailable' });
  }
}
