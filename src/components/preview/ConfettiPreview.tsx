import { useEffect, useRef, useCallback } from 'react';

export type ConfettiDirection = 'top' | 'sides';
export type ConfettiIntensity = 'subtle' | 'explosion';

interface Props {
  direction?: ConfettiDirection;
  intensity?: ConfettiIntensity;
  /** Primary colors for confetti pieces */
  colors?: string[];
  /** Duration in ms before stopping emission (particles still fall). 0 = one burst */
  duration?: number;
  /** Whether this is an editor preview (smaller, looping) */
  editorPreview?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  gravity: number;
  drag: number;
}

const DEFAULT_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A78BFA', '#F97316', '#06B6D4', '#EC4899'];

function createParticles(
  count: number,
  canvasW: number,
  canvasH: number,
  direction: ConfettiDirection,
  intensity: ConfettiIntensity,
): Particle[] {
  const particles: Particle[] = [];
  const isExplosion = intensity === 'explosion';

  for (let i = 0; i < count; i++) {
    let x: number, y: number, vx: number, vy: number;

    if (direction === 'sides') {
      const fromLeft = Math.random() > 0.5;
      x = fromLeft ? canvasW * 0.1 : canvasW * 0.9;
      y = canvasH * 0.3 + Math.random() * canvasH * 0.2;
      const spread = isExplosion ? 3.5 : 1.5;
      vx = (fromLeft ? 1 : -1) * (Math.random() * spread + 0.5);
      vy = -(Math.random() * (isExplosion ? 5 : 2.5) + 1);
    } else {
      // top — gentle rain from above
      x = Math.random() * canvasW;
      y = -(Math.random() * 40);
      vx = (Math.random() - 0.5) * (isExplosion ? 3 : 1.2);
      vy = Math.random() * (isExplosion ? 1.5 : 0.8) + 0.5;
    }

    particles.push({
      x, y, vx, vy,
      w: 3 + Math.random() * 4,
      h: 4 + Math.random() * 6,
      color: DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.15,
      opacity: 0.85 + Math.random() * 0.15,
      gravity: 0.06 + Math.random() * 0.04,
      drag: 0.985 + Math.random() * 0.01,
    });
  }
  return particles;
}

export default function ConfettiPreview({
  direction = 'top',
  intensity = 'explosion',
  colors,
  duration = 3000,
  editorPreview = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const startRef = useRef(0);

  const usedColors = colors?.length ? colors : DEFAULT_COLORS;

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const count = editorPreview
      ? (intensity === 'explosion' ? 40 : 20)
      : (intensity === 'explosion' ? 120 : 50);

    const parts = createParticles(count, canvas.width, canvas.height, direction, intensity);
    // Apply custom colors
    parts.forEach(p => { p.color = usedColors[Math.floor(Math.random() * usedColors.length)]; });
    particlesRef.current = parts;
    startRef.current = performance.now();
  }, [direction, intensity, usedColors, editorPreview]);

  useEffect(() => {
    init();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const animate = () => {
      if (!running) return;
      const elapsed = performance.now() - startRef.current;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const alive: Particle[] = [];
      for (const p of particlesRef.current) {
        p.vy += p.gravity;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        // Fade out over time
        if (elapsed > (duration || 3000) * 0.7) {
          p.opacity -= 0.008;
        }

        if (p.opacity <= 0 || p.y > canvas.height + 50) continue;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();

        alive.push(p);
      }

      particlesRef.current = alive;

      if (alive.length === 0) {
        if (editorPreview) {
          // Loop in editor
          setTimeout(() => { if (running) init(); }, 800);
        }
        return;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [init, duration, editorPreview]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 50 }}
    />
  );
}
