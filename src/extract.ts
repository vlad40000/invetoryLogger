import { ALL_TYPES, COLOR_NAMES } from './constants';

export type Tier = 'quick' | 'default';

export interface Extraction {
  brand: string;
  model: string;
  serial: string;
  type: string;
  typeReason: string;
  color: string;
  colorReason: string;
  low: string[]; // fields Claude marked low-confidence
  notAPlate: boolean;
  tier: string;
}

export interface ReadProgress {
  brand: boolean;
  model: boolean;
  serial: boolean;
}

const PROMPT = `You are reading the rating plate (nameplate / data tag) of a household appliance, photographed during a used-appliance inventory.

Reply with only this JSON object, keys in exactly this order:
{"brand": "", "model": "", "serial": "", "type": "", "typeReason": "", "color": "", "colorReason": "", "confidence": {"brand": "high", "model": "high", "serial": "high"}, "notAPlate": false}

Field rules:
- brand: the brand as printed (Whirlpool, GE, Samsung, LG, Frigidaire, Kenmore, Maytag, Amana, Hotpoint, KitchenAid, Bosch, Electrolux, Haier, Roper, Crosley, Estate, Magic Chef, ...). If only the manufacturer is printed (for example "Whirlpool Corporation" on a Kenmore), use the brand the model number belongs to. "" if you cannot tell.
- model: the model number exactly as printed, every character kept, including leading zeros, periods, slashes and dashes (for example "110.27102310" or "RF28HFEDBSR/AA"). Leave out labels such as "MODEL", "MOD. NO." or "M/N".
- serial: the serial number exactly as printed, same rules. Leave out labels such as "SERIAL", "SER. NO." or "S/N".
- Read look-alike characters carefully (0/O, 1/I/L, 5/S, 8/B, 2/Z, 6/G). Never invent characters you cannot see. If part of a value is unreadable, return what is legible and set that field's confidence to "low".
- type: exactly one of the following, or "" if the plate and model number do not settle it:
${ALL_TYPES.map((t) => `  ${t}`).join('\n')}
- typeReason: 2 to 4 words naming the evidence, for example "WTW prefix", "JBS = coil top", "RF prefix", "plate says DISHWASHER".
- color: only when the model number's color code makes the finish clear (for example GE "SS" = Stainless, "WW" = White, "BB" = Black); one of ${COLOR_NAMES.join(', ')}. Otherwise "".
- colorReason: 2 to 4 words such as "SS suffix"; "" when color is "".
- confidence: "high" when every character of that field was clearly legible, otherwise "low".
- notAPlate: true when no appliance rating plate is visible in the photo; then leave the other fields "".`;

const LABELS = /^(model|mod|m\/n|serial|ser|s\/n|sn)\b[\s.:#-]*(no\.?|number|#)?[\s.:#-]*/i;

function clean(v: unknown, max = 60, stripLabels = false): string {
  let s = typeof v === 'string' ? v : v == null ? '' : String(v);
  s = s.replace(/\s+/g, ' ').trim();
  if (stripLabels) for (let i = 0; i < 2; i++) s = s.replace(LABELS, '').trim();
  return s.slice(0, max);
}

function matchFrom(list: string[], v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!s) return '';
  return list.find((x) => x.toLowerCase() === s) || '';
}

export function progressOf(text: string): ReadProgress {
  return {
    brand: /"model"\s*:/.test(text),
    model: /"serial"\s*:/.test(text),
    serial: /"type"\s*:/.test(text),
  };
}

export async function readNameplate(
  sample: typeof Claude.sample,
  image: Blob,
  tier: Tier,
  signal: AbortSignal,
  onProgress: (p: ReadProgress) => void,
): Promise<Extraction> {
  const raw = await sample.json<Record<string, unknown>>(PROMPT, {
    images: image,
    modelTier: tier,
    signal,
    onText: ({ text }) => onProgress(progressOf(text)),
  });
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const conf = (o.confidence && typeof o.confidence === 'object' ? o.confidence : {}) as Record<string, unknown>;
  const brand = clean(o.brand, 40);
  const model = clean(o.model, 60, true);
  const serial = clean(o.serial, 60, true);
  const low = (['brand', 'model', 'serial'] as const).filter(
    (k) => String(conf[k] || '').toLowerCase() === 'low' && { brand, model, serial }[k],
  );
  const type = matchFrom(ALL_TYPES, o.type);
  const color = matchFrom(COLOR_NAMES, o.color);
  return {
    brand,
    model,
    serial,
    type,
    typeReason: type ? clean(o.typeReason, 32) : '',
    color,
    colorReason: color ? clean(o.colorReason, 32) : '',
    low: [...low],
    notAPlate: o.notAPlate === true && !model && !serial,
    tier,
  };
}

/** Codes after which reading can't work for the rest of this page load. */
export const READ_OFF_CODES = new Set([
  'not_granted',
  'sampling_disabled',
  'not_declared',
  'capability_disabled',
  'capability_removed',
  'images_unavailable',
]);

export function readErrorCopy(code: string): string {
  switch (code) {
    case 'not_granted':
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
    case 'images_unavailable':
      return 'Plate reading isn’t available here. Type the values from the photo.';
    case 'session_expired':
      return 'Sign in to Claude again to read plates. Type the values for now.';
    case 'rate_limited':
      return 'Claude is busy or your usage limit is reached. Type the values, or tap Re-read in a minute.';
    case 'refused':
      return 'Claude couldn’t read this photo. Type the values or retake it.';
    case 'image_rejected':
      return 'That photo couldn’t be sent for reading. Retake it.';
    default:
      return 'Couldn’t read the plate this time. Retake, tap Re-read, or type the values.';
  }
}
