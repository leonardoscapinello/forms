import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NotificationItem } from '@/types/pageElements';
import Twemoji from '@/components/Twemoji';

interface Props {
  items: NotificationItem[];
  mode: 'sequential' | 'random';
  interval: number; // seconds
}

/**
 * iOS-style notification banner that cycles through items
 * with a slide-down + blur animation.
 */
export default function IOSNotification({ items, mode, interval }: Props) {
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

    // Show first notification after a short delay
    const showTimeout = setTimeout(() => setVisible(true), 800);

    return () => clearTimeout(showTimeout);
  }, [items.length]);

  useEffect(() => {
    if (items.length === 0 || !visible) return;

    const timer = setInterval(() => {
      // Hide current
      setVisible(false);
      // After exit animation, show next
      setTimeout(() => {
        setCurrentIndex(getNextIndex());
        setVisible(true);
      }, 500);
    }, interval * 1000);

    return () => clearInterval(timer);
  }, [visible, interval, getNextIndex, items.length]);

  if (items.length === 0) return null;

  const item = items[currentIndex];

  return (
    <div className="w-full flex justify-center pointer-events-none" style={{ minHeight: 90 }}>
      <AnimatePresence mode="wait">
        {visible && (
          <motion.div
            key={item.id}
            initial={{ y: -60, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -40, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="w-full max-w-sm"
          >
            <div
              className="mx-auto rounded-2xl px-4 py-3 flex items-start gap-3 shadow-lg border border-white/20"
              style={{
                background: 'rgba(255,255,255,0.82)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
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
