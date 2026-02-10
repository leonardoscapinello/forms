import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NotificationItem } from '@/types/pageElements';
import Twemoji from '@/components/Twemoji';

interface Props {
  items: NotificationItem[];
  mode: 'sequential' | 'random';
  interval: number; // seconds
  position?: 'top' | 'bottom';
}

/**
 * iOS-style notification banner fixed to top/bottom of viewport,
 * max-width 390px, cycling through items with spring animation.
 */
export default function IOSNotification({ items, mode, interval, position = 'top' }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  const getNextIndex = useCallback(() => {
    if (mode === 'random') {
      if (items.length <= 1) return 0;
      let next: number;
      do { next = Math.floor(Math.random() * items.length); } while (next === currentIndex);
      return next;
    }
    return (currentIndex + 1) % items.length;
  }, [mode, currentIndex, items.length]);

  useEffect(() => {
    if (items.length === 0) return;
    const showTimeout = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(showTimeout);
  }, [items.length]);

  useEffect(() => {
    if (items.length === 0 || !visible) return;

    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCurrentIndex(getNextIndex());
        setVisible(true);
      }, 500);
    }, interval * 1000);

    return () => clearInterval(timer);
  }, [visible, interval, getNextIndex, items.length]);

  if (items.length === 0) return null;

  const item = items[currentIndex];
  const isTop = position === 'top';

  const slideOffset = 80;

  return (
    <div
      className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none px-3"
      style={{ [isTop ? 'top' : 'bottom']: 12 }}
    >
      <AnimatePresence mode="wait">
        {visible && (
          <motion.div
            key={item.id}
            initial={{ y: isTop ? -slideOffset : slideOffset, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: isTop ? -slideOffset : slideOffset, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="w-full"
            style={{ maxWidth: 390 }}
          >
            <div
              className="rounded-2xl px-4 py-3 flex items-start gap-3 shadow-xl border border-white/20"
              style={{
                background: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
              }}
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Twemoji className="text-lg leading-none">{item.icon || '🔔'}</Twemoji>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">
                    {item.title || 'Notificação'}
                  </p>
                  <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">agora</span>
                </div>
                <p className="text-[12px] text-gray-600 leading-snug mt-0.5 line-clamp-2">
                  {item.text || ''}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
