export const APPLIANCE_TYPES: { group: string; items: string[] }[] = [
  {
    group: 'Refrigerator',
    items: [
      'Side-by-Side Refrigerator',
      'French Door Refrigerator',
      'Standard Refrigerator (Freezer on Top)',
      'Bottom Freezer Refrigerator',
    ],
  },
  {
    group: 'Range',
    items: [
      'Glass Top Electric Range',
      'Coil Top Electric Range',
      'Glass Top Double Oven Electric Range',
      'Induction Range',
      'Gas Range',
      'Double Oven Gas Range',
    ],
  },
  {
    group: 'Laundry',
    items: [
      'Top Load Washer',
      'Front Load Washer',
      'Electric Dryer',
      'Gas Dryer',
      'Electric Washer/Dryer Laundry Center',
      'Gas Washer/Dryer Laundry Center',
    ],
  },
  {
    group: 'Other',
    items: ['Dishwasher', 'Microwave', 'Water Heater', 'HVAC', 'Other'],
  },
];

export const ALL_TYPES = APPLIANCE_TYPES.flatMap((g) => g.items);

export const COLORS: { name: string; swatch: string; bd: string }[] = [
  { name: 'White', swatch: '#FFFFFF', bd: '#0F0F0E' },
  { name: 'Stainless', swatch: 'linear-gradient(135deg,#dfe1e3 0%,#b9bdc2 55%,#e6e8ea 100%)', bd: '#8a8d91' },
  { name: 'Black', swatch: '#0F0F0E', bd: '#0F0F0E' },
  { name: 'Black Stainless', swatch: 'linear-gradient(135deg,#4a4543 0%,#1f1d1c 55%,#3a3634 100%)', bd: '#0F0F0E' },
  { name: 'Bisque', swatch: '#E8D5C0', bd: '#8C7A66' },
  { name: 'Almond', swatch: '#D4C4A8', bd: '#8C7A66' },
  { name: 'Red', swatch: '#B61E1E', bd: '#0F0F0E' },
  { name: 'Other', swatch: 'linear-gradient(45deg,#fff 0%,#fff 50%,#B61E1E 50%,#B61E1E 100%)', bd: '#0F0F0E' },
];

export const COLOR_NAMES = COLORS.map((c) => c.name);

export const NOTE_CHIPS = [
  'Missing handles',
  'Broken door handle',
  'Broken glass top',
  'Broken bottom oven door',
  'Nameplate worn off',
  'Broken glass display',
];

/** Values that mean "no real serial/model" and are ignored for duplicate checks. */
export const PLACEHOLDER_VALUES = new Set(['', 'no serial', 'unreadable', 'no nameplate', 'n/a', 'unknown']);

export const SOURCE_LABEL: Record<string, string> = {
  photo: 'Photo',
  manual: 'Manual',
  noplate: 'No nameplate',
};

/** Records per archive chunk when a batch is closed (well under the 256 KiB doc cap). */
export const ARCHIVE_CHUNK = 150;
/** The artifact database holds at most 5,000 documents. */
export const DOC_CAP = 5000;
