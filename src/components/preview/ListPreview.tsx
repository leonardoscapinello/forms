import Twemoji from '@/components/Twemoji';
import { Check } from 'lucide-react';
import type { ListItem, ListStyleType } from '@/types/pageElements';

interface Props {
  items: ListItem[];
  listStyle?: ListStyleType;
  iconColor?: string;
  textColor?: string;
  gap?: number;
  fontSize?: string;
}

export default function ListPreview({
  items,
  listStyle = 'bullet',
  iconColor = '#22c55e',
  textColor = '#1a1a1a',
  gap = 8,
  fontSize,
}: Props) {
  const fSize = fontSize || 'base';
  const textSizeClass = `text-${fSize}`;

  return (
    <ul
      className="w-full list-none p-0 m-0"
      style={{ display: 'flex', flexDirection: 'column', gap }}
    >
      {items.map((item, index) => (
        <li key={item.id} className="flex items-start gap-2.5">
          {/* Marker */}
          <span
            className="flex-shrink-0 flex items-center justify-center mt-0.5"
            style={{ color: iconColor, minWidth: 22 }}
          >
            {listStyle === 'bullet' && (
              <span className="block w-2 h-2 rounded-full" style={{ backgroundColor: iconColor }} />
            )}
            {listStyle === 'numbered' && (
              <span className="text-sm font-bold" style={{ color: iconColor }}>
                {index + 1}.
              </span>
            )}
            {listStyle === 'check' && (
              <Check className="w-4 h-4" strokeWidth={3} />
            )}
            {listStyle === 'emoji' && (
              <Twemoji className="w-4 h-4">{item.emoji || '✅'}</Twemoji>
            )}
          </span>

          {/* Text */}
          <span className={`${textSizeClass} leading-relaxed`} style={{ color: textColor }}>
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
