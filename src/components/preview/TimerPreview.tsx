import { useState, useEffect, useMemo } from 'react';

interface Props {
  mode: 'text' | 'time' | 'datetime';
  durationMinutes?: number;
  targetDate?: string;
  label?: string;
  finishedLabel?: string;
  showDays?: boolean;
  showHours?: boolean;
  showMinutes?: boolean;
  showSeconds?: boolean;
  digitColor?: string;
  labelColor?: string;
  separatorColor?: string;
  boxBackground?: string;
  boxBorderRadius?: number;
  /** If true, timer doesn't tick (editor preview) */
  static?: boolean;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeLeft(endTime: number): TimeLeft {
  const diff = Math.max(0, endTime - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export default function TimerPreview({
  mode = 'time',
  durationMinutes = 10,
  targetDate,
  label,
  finishedLabel = 'Tempo esgotado!',
  showDays = false,
  showHours = true,
  showMinutes = true,
  showSeconds = true,
  digitColor = '#ffffff',
  labelColor = '#1a1a1a',
  separatorColor = '#1a1a1a',
  boxBackground = '#EF4444',
  boxBorderRadius = 8,
  static: isStatic = false,
}: Props) {
  const endTime = useMemo(() => {
    if (mode === 'datetime' && targetDate) {
      return new Date(targetDate).getTime();
    }
    return Date.now() + (durationMinutes || 10) * 60 * 1000;
  }, [mode, targetDate, durationMinutes]);

  const staticTime = useMemo<TimeLeft>(() => {
    if (mode === 'datetime' && targetDate) {
      return getTimeLeft(new Date(targetDate).getTime());
    }
    const mins = durationMinutes || 10;
    return {
      days: Math.floor(mins / (60 * 24)),
      hours: Math.floor((mins / 60) % 24),
      minutes: mins % 60,
      seconds: 0,
    };
  }, [mode, targetDate, durationMinutes]);

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(isStatic ? staticTime : getTimeLeft(endTime));

  useEffect(() => {
    if (isStatic) {
      setTimeLeft(staticTime);
      return;
    }
    const tick = () => setTimeLeft(getTimeLeft(endTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime, isStatic, staticTime]);

  const isFinished = !isStatic && timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0;

  const pad = (n: number) => String(n).padStart(2, '0');

  const segments: { value: string; unit: string }[] = [];
  if (showDays) segments.push({ value: pad(timeLeft.days), unit: 'Dias' });
  if (showHours) segments.push({ value: pad(timeLeft.hours), unit: 'Horas' });
  if (showMinutes) segments.push({ value: pad(timeLeft.minutes), unit: 'Min' });
  if (showSeconds) segments.push({ value: pad(timeLeft.seconds), unit: 'Seg' });

  if (mode === 'text') {
    // Text mode: inline countdown with label
    const parts: string[] = [];
    if (showDays && timeLeft.days > 0) parts.push(`${timeLeft.days}d`);
    if (showHours) parts.push(`${pad(timeLeft.hours)}h`);
    if (showMinutes) parts.push(`${pad(timeLeft.minutes)}m`);
    if (showSeconds) parts.push(`${pad(timeLeft.seconds)}s`);

    return (
      <div className="flex items-center gap-2 flex-wrap">
        {label && (
          <span className="text-base font-semibold" style={{ color: labelColor }}>
            {isFinished ? finishedLabel : label}
          </span>
        )}
        {!isFinished && (
          <span className="text-base font-bold tabular-nums" style={{ color: digitColor === '#ffffff' ? boxBackground : digitColor }}>
            {parts.join(' : ')}
          </span>
        )}
      </div>
    );
  }

  // time and datetime modes: box-style countdown
  return (
    <div className="flex flex-col items-center gap-2">
      {label && (
        <span className="text-base font-semibold" style={{ color: labelColor }}>
          {isFinished ? finishedLabel : label}
        </span>
      )}
      {!isFinished && (
        <div className="flex items-center gap-2">
          {segments.map((seg, i) => (
            <div key={seg.unit} className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <div
                  className="flex items-center justify-center font-bold text-2xl tabular-nums min-w-[52px] h-[52px]"
                  style={{
                    backgroundColor: boxBackground,
                    borderRadius: boxBorderRadius,
                    color: digitColor,
                  }}
                >
                  {seg.value}
                </div>
                <span className="text-[10px] font-medium mt-1" style={{ color: labelColor }}>
                  {seg.unit}
                </span>
              </div>
              {i < segments.length - 1 && (
                <span className="text-xl font-bold -mt-4" style={{ color: separatorColor }}>
                  :
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
