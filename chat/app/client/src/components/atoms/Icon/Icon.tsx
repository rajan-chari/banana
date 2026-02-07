import type { CSSProperties } from 'react';

export type IconName =
  | 'bell' | 'chat-bubble' | 'calendar' | 'phone' | 'folder' | 'grid'
  | 'people' | 'ellipsis-h' | 'arrow-left' | 'arrow-right' | 'magnify'
  | 'close' | 'minus' | 'square' | 'chevron-down' | 'chevron-right'
  | 'plus' | 'pencil' | 'send' | 'bold' | 'italic' | 'underline'
  | 'strikethrough' | 'code' | 'list-bullet' | 'emoji-smile' | 'paperclip'
  | 'hash' | 'arrow-reply' | 'arrow-forward' | 'text-format';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const sizeMap: Record<IconSize, string> = {
  xs: 'var(--icon-xs)',
  sm: 'var(--icon-sm)',
  md: 'var(--icon-md)',
  lg: 'var(--icon-lg)',
  xl: 'var(--icon-xl)',
};

const strokeWidthMap: Record<IconSize, number> = {
  xs: 2,
  sm: 2,
  md: 1.75,
  lg: 1.5,
  xl: 1.5,
};

// Outlined stroke-based SVG paths (Lucide-inspired, viewBox="0 0 24 24")
const paths: Record<IconName, string | string[]> = {
  'bell': [
    'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9',
    'M13.73 21a2 2 0 0 1-3.46 0',
  ],
  'chat-bubble': [
    'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  ],
  'calendar': [
    'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z',
    'M16 2v4',
    'M8 2v4',
    'M3 10h18',
  ],
  'phone': [
    'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z',
  ],
  'folder': [
    'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  ],
  'grid': [
    'M3 3h7v7H3z',
    'M14 3h7v7h-7z',
    'M14 14h7v7h-7z',
    'M3 14h7v7H3z',
  ],
  'people': [
    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M23 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  'ellipsis-h': [
    'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    'M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    'M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  ],
  'arrow-left': [
    'M19 12H5',
    'M12 19l-7-7 7-7',
  ],
  'arrow-right': [
    'M5 12h14',
    'M12 5l7 7-7 7',
  ],
  'magnify': [
    'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
    'M21 21l-4.35-4.35',
  ],
  'close': [
    'M18 6L6 18',
    'M6 6l12 12',
  ],
  'minus': 'M5 12h14',
  'square': 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  'plus': [
    'M12 5v14',
    'M5 12h14',
  ],
  'pencil': [
    'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  ],
  'send': [
    'M22 2L11 13',
    'M22 2l-7 20-4-9-9-4 20-7z',
  ],
  'bold': [
    'M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z',
    'M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z',
  ],
  'italic': [
    'M19 4h-9',
    'M14 20H5',
    'M15 4l-6 16',
  ],
  'underline': [
    'M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3',
    'M4 21h16',
  ],
  'strikethrough': [
    'M16 4H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H8',
    'M4 12h16',
  ],
  'code': [
    'M16 18l6-6-6-6',
    'M8 6l-6 6 6 6',
  ],
  'list-bullet': [
    'M8 6h13',
    'M8 12h13',
    'M8 18h13',
    'M3 6h.01',
    'M3 12h.01',
    'M3 18h.01',
  ],
  'emoji-smile': [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    'M8 14s1.5 2 4 2 4-2 4-2',
    'M9 9h.01',
    'M15 9h.01',
  ],
  'paperclip': [
    'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  ],
  'hash': [
    'M4 9h16',
    'M4 15h16',
    'M10 3l-2 18',
    'M16 3l-2 18',
  ],
  'arrow-reply': [
    'M9 17H4V7',
    'M20 17c0-6-3.5-10-10-10',
    'M4 12l5-5',
    'M4 12l5 5',
  ],
  'arrow-forward': [
    'M15 17h5V7',
    'M4 17c0-6 3.5-10 10-10',
    'M20 12l-5-5',
    'M20 12l-5 5',
  ],
  'text-format': [
    'M11 4H4v2h7',
    'M13 4h7v2h-7',
    'M12 4v16',
    'M8 20h8',
  ],
};

interface IconProps {
  name: IconName;
  size?: IconSize;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 'md', color, className, style }: IconProps) {
  const svgSize = sizeMap[size];
  const pathData = paths[name];
  return (
    <svg
      width={svgSize}
      height={svgSize}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth={strokeWidthMap[size]}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {Array.isArray(pathData)
        ? pathData.map((d, i) => <path key={i} d={d} />)
        : <path d={pathData} />}
    </svg>
  );
}
