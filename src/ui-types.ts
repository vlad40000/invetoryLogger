import type { Source } from './types';

export interface ReadState {
  state: 'none' | 'ok' | 'error' | 'notplate' | 'skipped' | 'unavailable';
  message?: string;
  tier?: string;
  low?: string[];
}

export interface Draft {
  key: string;
  batchId: string;
  mode: 'new' | 'edit';
  recId: string | null;
  /** Edit mode: the unit number as typed. */
  no: string;
  /** New mode: the unit number on screen when this draft began (what the crew labels). */
  shownNo: number | null;
  origNo: number | null;
  brand: string;
  model: string;
  serial: string;
  type: string;
  typeReason: string;
  typeFromAI: boolean;
  color: string;
  colorHint: { color: string; reason: string } | null;
  notes: string[];
  freeNotes: string;
  source: Source;
  /** Stored asset id for the photo, once uploaded. */
  photo: string | null;
  /** Edit mode: the record's photo when editing began. */
  origPhoto: string | null;
  photoUrl: string | null;
  photoState: 'none' | 'uploading' | 'stored' | 'unstored' | 'failed';
  photoNote: string | null;
  read: ReadState;
  by: string | null;
  createdAt: number | null;
}

export interface StoredDraft {
  batchId: string;
  savedAt: number;
  draft: Omit<Draft, 'photoUrl' | 'key'>;
}

export type Sheet =
  | { kind: 'menu' }
  | { kind: 'export' }
  | { kind: 'type' }
  | { kind: 'editBatch' }
  | { kind: 'confirm'; title: string; body: string; action: string; danger?: boolean; run: () => void }
  | { kind: 'photo'; url: string; caption: string }
  | { kind: 'progress'; title: string; done: number; total: number };

export interface Toast {
  kind: 'saved' | 'exported';
  title: string;
  detail: string;
  sub?: string;
}
