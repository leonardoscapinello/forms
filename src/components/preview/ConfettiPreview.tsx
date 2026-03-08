import { useEffect, useRef, useCallback } from 'react';

export type ConfettiDirection = 'top' | 'sides';
export type ConfettiIntensity = 'subtle' | 'explosion';

interface Props {
  direction?: ConfettiDirection;
  intensity?: ConfettiIntensity;
  colors?: string[];
  duration?: number;
  editorPreview?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  color: string;
  /** 3D tilt angles for realistic tumbling */
  tiltX: number;
  tiltY: number;
  tiltZ: number;
  tiltVx: number;
  tiltVy: number;
  tiltVz: number;
  opacity: number;
  /** Terminal velocity — unique per particle based on size */
  terminalVy: number;
  /** Air resistance coefficient (cross-section dependent) */
  dragCoeff: number;
  /** Lateral wobble phase */
  wobblePhase: number;
  wobbleSpeed: number;
  wobbleAmplitude: number;
  /** Shape: 0 = rectangle, 1 = circle, 2 = strip */
  shape: number;
}

const DEFAULT_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A78BFA', '#F97316', '#06B6D4', '#EC4899'];

// Physics constants (pixels ≈ scaled world)
const GRAVITY = 0.14;        // px/frame² — gentle gravitational pull
const AIR_DRAG = 0.012;      // base air resistance factor
const LATERAL_DRAG = 0.02;   // extra lateral damping (air resistance on X)

function createParticle(
  canvasW: number,
  canvasH: number,
  direction: ConfettiDirection,
  intensity: ConfettiIntensity,
  color: string,
): Particle {
  const isExplosion = intensity === 'explosion';

  let x: number, y: number, vx: number, vy: number;

  if (direction === 'sides') {
    const fromLeft = Math.random() > 0.5;
    x = fromLeft ? canvasW * 0.05 : canvasW * 0.95;
    y = canvasH * 0.15 + Math.random() * canvasH * 0.25;
    const speed = isExplosion ? 4 + Math.random() * 3 : 1.5 + Math.random() * 2;
    const angle = fromLeft
      ? (-Math.PI / 3 + Math.random() * Math.PI / 4)
      : (Math.PI + Math.PI / 3 - Math.random() * Math.PI / 4);
    vx = Math.cos(angle) * speed;
    vy = Math.sin(angle) * speed - (isExplosion ? 3 : 1.2);
  } else {
    // Top: burst upward then rain down (like a cannon shot upward)
    x = canvasW * 0.2 + Math.random() * canvasW * 0.6;
    y = isExplosion ? canvasH * 0.35 : -10;
    vx = (Math.random() - 0.5) * (isExplosion ? 6 : 2);
    vy = isExplosion
      ? -(3 + Math.random() * 4)       // burst upward
      : (0.3 + Math.random() * 0.6);   // gentle fall
  }

  const width = 3 + Math.random() * 5;
  const height = 5 + Math.random() * 8;
  const area = width * height;

  // Larger pieces have more drag but also higher terminal velocity
  const terminalVy = 1.8 + (area / 80) + Math.random() * 0.6;
  const dragCoeff = AIR_DRAG * (0.8 + area / 60);

  return {
    x, y, vx, vy, width, height, color,
    tiltX: Math.random() * Math.PI * 2,
    tiltY: Math.random() * Math.PI * 2,
    tiltZ: Math.random() * Math.PI * 2,
    tiltVx: (Math.random() - 0.5) * 0.08,
    tiltVy: (Math.random() - 0.5) * 0.06,
    tiltVz: (Math.random() - 0.5) * 0.1,
    opacity: 0.9 + Math.random() * 0.1,
    terminalVy,
    dragCoeff,
    wobblePhase: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.03 + Math.random() * 0.04,
    wobbleAmplitude: 0.3 + Math.random() * 0.8,
    shape: Math.floor(Math.random() * 3),
  };
}

function createParticles(
  count: number,
  canvasW: number,
  canvasH: number,
  direction: ConfettiDirection,
  intensity: ConfettiIntensity,
  usedColors: string[],
): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const color = usedColors[Math.floor(Math.random() * usedColors.length)];
    particles.push(createParticle(canvasW, canvasH, direction, intensity, color));
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
      ? (intensity === 'explosion' ? 35 : 18)
      : (intensity === 'explosion' ? 100 : 45);

    particlesRef.current = createParticles(count, canvas.width, canvas.height, direction, intensity, usedColors);
    startRef.current = performance.now();
  }, [direction, intensity, usedColors, editorPreview]);

  useEffect(() => {
    init();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;
    let lastTime = performance.now();

    const animate = (now: number) => {
      if (!running) return;

      // Delta-time in frames (target 60fps)
      const dt = Math.min((now - lastTime) / 16.667, 3);
      lastTime = now;

      const elapsed = now - startRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const alive: Particle[] = [];

      for (const p of particlesRef.current) {
        // --- Physics step ---

        // Gravity
        p.vy += GRAVITY * dt;

        // Air drag: opposes velocity, stronger on larger cross-section
        // Asymptotic approach to terminal velocity
        if (p.vy > 0) {
          const dragForce = p.dragCoeff * (p.vy / p.terminalVy) * dt;
          p.vy = Math.max(0, p.vy - dragForce);
        }

        // Lateral air resistance
        p.vx -= p.vx * LATERAL_DRAG * dt;

        // Lateral wobble (simulates air catching flat surface)
        p.wobblePhase += p.wobbleSpeed * dt;
        const wobble = Math.sin(p.wobblePhase) * p.wobbleAmplitude * (p.vy > 0 ? 1 : 0.3);
        
        p.x += (p.vx + wobble * 0.15) * dt;
        p.y += p.vy * dt;

        // 3D tumbling
        p.tiltX += p.tiltVx * dt;
        p.tiltY += p.tiltVy * dt;
        p.tiltZ += p.tiltVz * dt;

        // Dampen tumble slowly (air friction on rotation)
        p.tiltVx *= (1 - 0.001 * dt);
        p.tiltVy *= (1 - 0.001 * dt);
        p.tiltVz *= (1 - 0.001 * dt);

        // Fade out towards end of duration
        const fadeFraction = 0.65;
        if (elapsed > (duration || 3000) * fadeFraction) {
          const fadeProgress = (elapsed - (duration || 3000) * fadeFraction) / ((duration || 3000) * (1 - fadeFraction));
          p.opacity = Math.max(0, (0.9 + Math.random() * 0.001) * (1 - fadeProgress));
        }

        if (p.opacity <= 0.01 || p.y > canvas.height + 60) continue;

        // --- Render ---
        // Simulate 3D projection via scale from tilt
        const scaleX = Math.abs(Math.cos(p.tiltY));
        const scaleY = Math.abs(Math.cos(p.tiltX));
        const projW = Math.max(0.4, p.width * scaleX);
        const projH = Math.max(0.4, p.height * scaleY);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.tiltZ);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;

        if (p.shape === 1) {
          // Circle / dot
          ctx.beginPath();
          ctx.ellipse(0, 0, projW / 2, projH / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 2) {
          // Thin strip / ribbon
          ctx.fillRect(-projW / 2, -projH * 0.15, projW, projH * 0.3);
        } else {
          // Rectangle
          ctx.fillRect(-projW / 2, -projH / 2, projW, projH);
        }

        ctx.restore();
        alive.push(p);
      }

      particlesRef.current = alive;

      if (alive.length === 0) {
        if (editorPreview) {
          setTimeout(() => { if (running) { init(); rafRef.current = requestAnimationFrame(animate); } }, 1000);
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
