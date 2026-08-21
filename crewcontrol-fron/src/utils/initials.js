// Shared initials-generation rule for the Finance company cards. Mirrors
// the algorithm already used for person avatars elsewhere in the app (see
// components/expenses/ExpenseDetailPanel.jsx's getInitialsAndColor), but
// takes up to `maxLetters` significant words instead of hardcoding 2, so a
// 3-word company name like "Prime Edge Maintenance" resolves to "PEM"
// rather than "PE". Common legal suffixes (LLC, Ltd, etc.) are ignored so
// they don't consume a letter slot ahead of the name's actual words.
const STOP_WORDS = new Set(['llc', 'ltd', 'inc', 'co', 'company', 'the', 'and', '&']);

export function getInitials(name = '', maxLetters = 3) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w.toLowerCase().replace(/[.,]/g, '')));

  const source = words.length > 0 ? words : String(name || '').trim().split(/\s+/);
  if (source.length === 0 || !source[0]) return '?';

  return source
    .slice(0, maxLetters)
    .map((w) => w[0].toUpperCase())
    .join('');
}

const AVATAR_COLORS = ['#7C6FF7', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];

export function getAvatarColor(name = '') {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
