import { useEffect, useRef } from 'react';
import twemoji from 'twemoji';

interface TwemojiProps {
  children: React.ReactNode;
  className?: string;
  tag?: keyof JSX.IntrinsicElements;
}

/**
 * Wraps children and replaces all Unicode emojis with Twemoji SVGs
 * so they render consistently (Apple-style) across all platforms.
 */
export default function Twemoji({ children, className, tag: Tag = 'span' }: TwemojiProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current) {
      twemoji.parse(ref.current, {
        folder: 'svg',
        ext: '.svg',
        base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/',
      });
    }
  });

  return (
    // @ts-ignore - dynamic tag
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
