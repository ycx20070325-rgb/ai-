import React, { useEffect, useRef, useState } from 'react';

interface FruitGameProps {
  isActive: boolean;
  videoElement: HTMLVideoElement | null;
  onScoreUpdate: (delta: number) => void;
}

interface GameObject {
  id: number;
  type: 'fruit' | 'bomb';
  emoji: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  velocity: number;
  isSliced: boolean;
  slicedAt?: number;
}

interface Particle {
  id: number;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const ITEMS = [
  { type: 'fruit', emoji: '🍎' },
  { type: 'fruit', emoji: '🍌' },
  { type: 'fruit', emoji: '🍉' },
  { type: 'fruit', emoji: '🍇' },
  { type: 'fruit', emoji: '🍊' },
  { type: 'bomb', emoji: '💣' },
];

const FruitGame: React.FC<FruitGameProps> = ({ isActive, videoElement, onScoreUpdate }) => {
  const [objects, setObjects] = useState<GameObject[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<{id: number, x: number, y: number, text: string, color: string}[]>([]);
  
  // Motion & Rendering Refs
  const motionCanvasRef = useRef<HTMLCanvasElement>(null);
  const visualCanvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const handPosRef = useRef<{x: number, y: number} | null>(null); // Tracked hand position (0-100)
  const particlesRef = useRef<Particle[]>([]);
  const haloRotationRef = useRef<number>(0); // Rotation for the halo effect
  
  // Game Loop Refs
  const requestRef = useRef<number>(0);
  const lastSpawnTime = useRef<number>(0);
  const spawnedCount = useRef<number>(0);

  // Constants
  const MOTION_THRESHOLD = 25; 
  const GRID_X = 64; // Increased resolution for better centroid
  const GRID_Y = 48;
  const COLLISION_DISTANCE = 12; // Slightly larger for better feel

  const addFloatingText = (x: number, y: number, text: string, color: string) => {
    const id = Date.now() + Math.random();
    setFloatingTexts(prev => [...prev, { id, x, y, text, color }]);
    setTimeout(() => {
      setFloatingTexts(prev => prev.filter(ft => ft.id !== id));
    }, 1000);
  };

  const createParticles = (x: number, y: number, color: string, count: number = 5) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        id: Math.random(),
        x,
        y,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        life: 1.0,
        color
      });
    }
  };

  const gameLoop = (time: number) => {
    if (!isActive) return;

    // --- 1. Spawning (Max 5 per round) ---
    if (spawnedCount.current < 5 && time - lastSpawnTime.current > 1200) { 
      const isBomb = Math.random() < 0.25; 
      const item = isBomb ? ITEMS[5] : ITEMS[Math.floor(Math.random() * 5)];
      
      const newObj: GameObject = {
        id: time,
        type: item.type as 'fruit' | 'bomb',
        emoji: item.emoji,
        x: 10 + Math.random() * 80, 
        y: -15, 
        velocity: 0.3 + Math.random() * 0.2, 
        isSliced: false
      };
      
      setObjects(prev => [...prev, newObj]);
      lastSpawnTime.current = time;
      spawnedCount.current += 1;
    }

    // --- 2. Motion Detection (Right Hand Tracking) ---
    if (videoElement && motionCanvasRef.current) {
      const mCanvas = motionCanvasRef.current;
      const ctx = mCanvas.getContext('2d', { willReadFrequently: true });
      
      if (ctx && videoElement.readyState === 4) {
        // Draw small frame for motion processing
        ctx.drawImage(videoElement, 0, 0, GRID_X, GRID_Y);
        const frame = ctx.getImageData(0, 0, GRID_X, GRID_Y);
        const data = frame.data;
        const len = data.length;

        let sumX = 0;
        let sumY = 0;
        let totalWeight = 0;

        if (prevFrameRef.current) {
           for (let i = 0; i < len; i += 4) {
              const rDiff = Math.abs(data[i] - prevFrameRef.current[i]);
              const gDiff = Math.abs(data[i+1] - prevFrameRef.current[i+1]);
              const bDiff = Math.abs(data[i+2] - prevFrameRef.current[i+2]);
              const diff = rDiff + gDiff + bDiff;
              
              if (diff > MOTION_THRESHOLD) {
                 const pixelIdx = i / 4;
                 const x = pixelIdx % GRID_X;
                 const y = Math.floor(pixelIdx / GRID_X);
                 
                 // RIGHT HAND BIAS ALGORITHM
                 // The camera feed is mirrored on screen, but the raw data corresponds to the sensor.
                 // Sensor Left (Low X) = User's Right Hand.
                 // Sensor Right (High X) = User's Left Hand.
                 // We apply a strong weight multiplier to pixels on the Left side of the sensor.
                 // This ensures the tracker "favors" the right hand if both are moving.
                 
                 const normalizedX = x / GRID_X; // 0.0 to 1.0
                 // Bias: 4.0 at Left Edge (User Right), 1.0 at Right Edge (User Left)
                 const handednessBias = 1 + Math.pow(1 - normalizedX, 2) * 3;
                 
                 const weightedDiff = diff * handednessBias;

                 sumX += x * weightedDiff;
                 sumY += y * weightedDiff;
                 totalWeight += weightedDiff;
              }
           }
        }
        
        prevFrameRef.current = new Uint8ClampedArray(data);

        // Update Hand Position if meaningful motion detected
        if (totalWeight > 2000) {
           const rawAvgX = sumX / totalWeight;
           const rawAvgY = sumY / totalWeight;
           
           // Convert to Game Coordinates (0-100)
           // Mirror X axis because video is mirrored on screen
           // rawAvgX (0) -> targetX (100) (Screen Right)
           const targetX = 100 - (rawAvgX / GRID_X * 100);
           const targetY = (rawAvgY / GRID_Y * 100);

           if (!handPosRef.current) {
             handPosRef.current = { x: targetX, y: targetY };
           } else {
             // Adaptive Lerp (Smoothing)
             const dist = Math.hypot(targetX - handPosRef.current.x, targetY - handPosRef.current.y);
             const lerpFactor = Math.min(0.15 + (dist / 100), 0.6); // Slightly faster response

             handPosRef.current.x += (targetX - handPosRef.current.x) * lerpFactor;
             handPosRef.current.y += (targetY - handPosRef.current.y) * lerpFactor;
           }

           // Generate Trail particles
           if (Math.random() > 0.6) {
             createParticles(handPosRef.current.x, handPosRef.current.y, '#00ffff', 1);
           }
        }
      }
    }

    // --- 3. Update Objects & Collision ---
    setObjects(currentObjects => {
      const updatedObjects = [...currentObjects];
      const now = Date.now();

      updatedObjects.forEach(obj => {
         // Move Object
         if(!obj.isSliced) {
           obj.y += obj.velocity;
         } else {
           obj.y += obj.velocity * 0.1; // Slow down when sliced
         }

         // Check Collision with Hand
         if (!obj.isSliced && handPosRef.current) {
            const dx = obj.x - handPosRef.current.x;
            const dy = obj.y - handPosRef.current.y;
            // Aspect ratio correction approximation
            const dist = Math.sqrt(dx*dx + dy*dy * 0.6); 

            if (dist < COLLISION_DISTANCE) {
               obj.isSliced = true;
               obj.slicedAt = now;
               
               if (obj.type === 'fruit') {
                 onScoreUpdate(1);
                 addFloatingText(obj.x, obj.y, "+1", "text-green-400");
                 createParticles(obj.x, obj.y, 'yellow', 12);
               } else {
                 onScoreUpdate(-3);
                 addFloatingText(obj.x, obj.y, "-3", "text-red-500");
                 createParticles(obj.x, obj.y, 'red', 15);
               }
            }
         }
      });

      // Filter Logic
      return updatedObjects.filter(obj => {
        const isOnScreen = obj.y < 110;
        const isAlive = !obj.isSliced;
        const isAnimating = obj.isSliced && obj.slicedAt && (now - obj.slicedAt < 800);
        return isOnScreen && (isAlive || isAnimating);
      });
    });

    // --- 4. Render Visuals (Canvas Overlay) ---
    if (visualCanvasRef.current) {
       const ctx = visualCanvasRef.current.getContext('2d');
       if (ctx) {
         ctx.clearRect(0, 0, visualCanvasRef.current.width, visualCanvasRef.current.height);
         const w = visualCanvasRef.current.width;
         const h = visualCanvasRef.current.height;

         // Update Rotation
         haloRotationRef.current += 0.05;

         // Update & Draw Particles
         particlesRef.current.forEach(p => {
           p.x += p.vx;
           p.y += p.vy;
           p.life -= 0.05;

           if (p.life > 0) {
             const px = (p.x / 100) * w;
             const py = (p.y / 100) * h;
             
             ctx.fillStyle = p.color === '#00ffff' 
                ? `rgba(0, 255, 255, ${p.life})` 
                : p.color === 'red'
                  ? `rgba(255, 50, 50, ${p.life})`
                  : `rgba(255, 255, 100, ${p.life})`;
             
             ctx.beginPath();
             ctx.arc(px, py, p.color === '#00ffff' ? 2 : 5, 0, Math.PI * 2);
             ctx.fill();
           }
         });
         
         // Clean dead particles
         particlesRef.current = particlesRef.current.filter(p => p.life > 0);

         // Draw HALO Cursor (Right Hand Indicator)
         if (handPosRef.current) {
            const hx = (handPosRef.current.x / 100) * w;
            const hy = (handPosRef.current.y / 100) * h;
            const radius = 25;
            
            ctx.save();
            ctx.translate(hx, hy);
            
            // 1. Core Glow
            ctx.shadowBlur = 15;
            ctx.shadowColor = 'rgba(0, 255, 255, 0.8)';
            ctx.fillStyle = 'rgba(200, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();

            // 2. Inner Rotating Ring
            ctx.rotate(haloRotationRef.current);
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 1.5); // Open ring
            ctx.stroke();

            // 3. Outer Rotating Ring (Opposite direction)
            ctx.rotate(-haloRotationRef.current * 2);
            ctx.strokeStyle = 'rgba(0, 200, 255, 0.5)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 1.2); // Open ring
            ctx.stroke();
            
            // 4. Decoration dots on outer ring
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(radius, 0, 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
            ctx.shadowBlur = 0;
         }
       }
    }

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    // Set Visual Canvas Size to match window initially
    if (visualCanvasRef.current) {
      // We use a safe default; CSS handles the actual display size
      visualCanvasRef.current.width = window.innerWidth;
      visualCanvasRef.current.height = window.innerHeight;
    }

    const handleResize = () => {
      if (visualCanvasRef.current) {
        visualCanvasRef.current.width = window.innerWidth;
        visualCanvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);

    if (isActive) {
      spawnedCount.current = 0;
      setObjects([]);
      handPosRef.current = null;
      requestRef.current = requestAnimationFrame(gameLoop);
    } else {
      cancelAnimationFrame(requestRef.current);
      setObjects([]);
    }
    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [isActive, videoElement]);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-40">
      {/* 1. Motion Proc Canvas (Hidden) */}
      <canvas ref={motionCanvasRef} width={GRID_X} height={GRID_Y} className="hidden" />

      {/* 2. Visual Effects Canvas (Particles, Halo) */}
      <canvas 
        ref={visualCanvasRef} 
        className="absolute inset-0 w-full h-full z-50"
      />

      {/* 3. Game Objects (DOM) */}
      {objects.map(obj => {
        if (obj.isSliced) {
          return (
             <div
               key={obj.id}
               className="absolute transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-40"
               style={{ left: `${obj.x}%`, top: `${obj.y}%` }}
             >
               {obj.type === 'bomb' ? (
                 <div className="relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-red-600 rounded-full blur-3xl opacity-80 animate-pulse"></div>
                    <div className="text-9xl animate-bounce">💥</div>
                 </div>
               ) : (
                 <div className="relative">
                    {/* Slash */}
                    <div className="absolute top-1/2 left-1/2 w-56 h-3 bg-white -translate-x-1/2 -translate-y-1/2 rotate-[-45deg] shadow-[0_0_20px_rgba(255,255,255,1)] z-10 animate-pulse"></div>
                    <div className="text-9xl opacity-60 scale-125 transition-all duration-500 ease-out grayscale" style={{ transform: 'rotate(180deg) scale(1.4)' }}>
                      {obj.emoji}
                    </div>
                 </div>
               )}
             </div>
          );
        }

        return (
          <div
            key={obj.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 flex items-center justify-center"
            style={{ 
              left: `${obj.x}%`, 
              top: `${obj.y}%`,
              textShadow: '0 4px 15px rgba(0,0,0,0.6)'
            }}
          >
             <span className="text-9xl select-none filter drop-shadow-2xl">
               {obj.emoji}
             </span>
          </div>
        );
      })}

      {/* 4. Floating Score Text */}
      {floatingTexts.map(ft => (
        <div
          key={ft.id}
          className={`absolute font-black text-6xl animate-bounce ${ft.color} z-50`}
          style={{ left: `${ft.x}%`, top: `${ft.y}%`, textShadow: '0 4px 8px rgba(0,0,0,1)' }}
        >
          {ft.text}
        </div>
      ))}
    </div>
  );
};

export default FruitGame;