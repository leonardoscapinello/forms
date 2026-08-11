import { useEffect, useRef } from 'react';
import twemoji from 'twemoji';

interface TwemojiProps {
  children: React.ReactNode;
  className?: string;
  tag?: keyof JSX.IntrinsicElements;
}

/**
 * Wraps children and replaces Unicode emojis with Twemoji SVGs so custom
 * emojis keep the same appearance across platforms.
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
    // @ts-expect-error - dynamic tag
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
