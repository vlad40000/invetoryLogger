export type Source = 'photo' | 'manual' | 'noplate';

/** Stored at batches/{batchId}/records/{recordId} (open batches) or inside
 *  batches/{batchId}/archive/{chunkId}.records[] (closed batches). */
export interface RecordDoc {
  no: number;
  type: string;
  typeReason: string;
  brand: string;
  model: string;
  serial: string;
  color: string;
  notes: string[];
  freeNotes: string;
  source: Source;
  /** Asset id of the nameplate photo (served at /_blob/<id>), or null. */
  photo: string | null;
  createdAt: number;
  updatedAt: number;
  /** Opaque viewer id of whoever logged it (user capability), or null. */
  by: string | null;
  /** Set when another device took the number this unit was shown with. */
  renumberedFrom: number | null;
}

export interface Rec extends RecordDoc {
  id: string;
}

/** Stored at batches/{batchId}. */
export interface BatchDoc {
  name: string;
  startNumber: number;
  nextNumber: number;
  status: 'open' | 'closed';
  /** Closed batches are compacted into archive chunks to save space. */
  archived: boolean;
  count: number;
  firstUnit: number | null;
  lastUnit: number | null;
  createdAt: number;
  updatedAt: number;
  createdBy: string | null;
}

export interface Batch extends BatchDoc {
  id: string;
}
