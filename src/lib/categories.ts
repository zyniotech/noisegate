import type { CategoryId } from './types';

export interface CategoryMeta {
  id: CategoryId | string;
  label: string;
  shortLabel: string;
  description: string;
  accentColor: string;
  icon:
    | 'robot'
    | 'sparkle'
    | 'warning'
    | 'info'
    | 'shield-check'
    | 'tag'
    | 'currency-circle-dollar'
    | 'megaphone'
    | 'television';
}

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  'ai-synthetic': {
    id: 'ai-synthetic',
    label: 'AI / Synthetic Content',
    shortLabel: 'AI / Synthetic',
    description: 'Channel primarily publishes synthetic voice, visuals, or AI-generated video content.',
    accentColor: '#d97706', // amber-600
    icon: 'robot',
  },
  'synthetic-mass-upload': {
    id: 'synthetic-mass-upload',
    label: 'Synthetic Mass Upload',
    shortLabel: 'Synthetic Mass Upload',
    description: 'High-volume automated or TTS uploads with recurring synthetic templates.',
    accentColor: '#ea580c', // orange-600
    icon: 'robot',
  },
  'content-farm': {
    id: 'content-farm',
    label: 'Content Farm',
    shortLabel: 'Content Farm',
    description: 'Repetitive, low-originality mass-produced uploads optimized for clicks.',
    accentColor: '#dc2626', // red-600
    icon: 'warning',
  },
  'reupload-compilation': {
    id: 'reupload-compilation',
    label: 'Reupload / Compilation',
    shortLabel: 'Reupload',
    description: 'Primarily redistributes clips or compilations sourced from other creators.',
    accentColor: '#6366f1', // indigo-500
    icon: 'info',
  },
  'verified-independent': {
    id: 'verified-independent',
    label: 'Independent / Trusted',
    shortLabel: 'Trusted',
    description: 'Verified or personally trusted independent creator.',
    accentColor: '#10b981', // emerald-500
    icon: 'shield-check',
  },
  'disclosure-detected': {
    id: 'disclosure-detected',
    label: 'Altered or Synthetic (YouTube Disclosure)',
    shortLabel: 'YT Synthetic Disclosure',
    description: 'Creator or YouTube disclosed altered or synthetic content on the Watch page.',
    accentColor: '#38bdf8', // sky-400
    icon: 'sparkle',
  },
  'paid-promotion': {
    id: 'paid-promotion',
    label: 'Paid Promotion Disclosed',
    shortLabel: 'Paid Promotion',
    description: 'Creator disclosed paid product placement or sponsorship on this video.',
    accentColor: '#94a3b8', // neutral slate
    icon: 'megaphone',
  },
  'ypp-monetized': {
    id: 'ypp-monetized',
    label: 'YPP Partner Signals Observed',
    shortLabel: 'YPP Monetized',
    description: 'Public YouTube Partner Program features (Memberships, Super Thanks, Shopping) observed.',
    accentColor: '#94a3b8',
    icon: 'currency-circle-dollar',
  },
  'topic-match': {
    id: 'topic-match',
    label: 'Topic Filter Match',
    shortLabel: 'Topic',
    description: 'Matches a user-configured topic category preference.',
    accentColor: '#94a3b8',
    icon: 'television',
  },
  custom: {
    id: 'custom',
    label: 'Custom Note',
    shortLabel: 'Note',
    description: 'Custom personal label or context note.',
    accentColor: '#64748b',
    icon: 'tag',
  },
};

export const SELECTABLE_CATEGORIES: CategoryMeta[] = [
  CATEGORIES['ai-synthetic'],
  CATEGORIES['synthetic-mass-upload'],
  CATEGORIES['content-farm'],
  CATEGORIES['reupload-compilation'],
  CATEGORIES['verified-independent'],
  CATEGORIES['custom'],
];

export function getCategoryMeta(category: string): CategoryMeta {
  const safeInput = typeof category === 'string' ? category : '';
  const key = safeInput.trim().toLowerCase() as CategoryId;
  if (Object.hasOwn(CATEGORIES, key)) {
    return CATEGORIES[key];
  }
  const formatted = safeInput
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return {
    id: safeInput,
    label: formatted || 'Labeled',
    shortLabel: formatted || 'Labeled',
    description: 'Category provided by an external filter list.',
    accentColor: '#d97706',
    icon: 'tag',
  };
}
