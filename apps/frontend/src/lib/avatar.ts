const COLORS = [
  '#92b4cc',
  '#a8c4a0',
  '#d4a888',
  '#b8a0c4',
  '#8cb8b0',
  '#c9a0a0',
  '#a0b0cc',
  '#c4b890',
  '#b0c4a8',
  '#c0a0b4',
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
