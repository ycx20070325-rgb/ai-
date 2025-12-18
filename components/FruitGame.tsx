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
  { type: 'fruit', emoji: '🍍' },
  { type: 'fruit', emoji: '🥝' },
  { type: 'bomb', emoji: '💣' },
];

const FruitGame: React.FC<FruitGameProps> = ({ isActive, videoElement, onScoreUpdate }) => {
  const [objects, setObjects] = useState<GameObject[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<{id: number, x: number, y: number, text: string, color: string}[]>([]);
  
  // Motion & Rendering Refs
  const motionCanvasRef = useRef<HTMLCanvasElement>(null);
  const visualCanvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const motionGridRef = useRef<Uint8Array | null>(null); // Stores motion intensity for the current frame
  const particlesRef = useRef<Particle[]>([]);
  
  // Game Loop Refs
  const requestRef = useRef<number>(0);
  const lastSpawnTime = useRef<number>(0);
  const spawnedCount = useRef<number>(0);

  // Constants
  const MOTION_THRESHOLD = 20; 
  const GRID_X = 64; // Motion grid resolution X
  const GRID_Y = 48; // Motion grid resolution Y
  const MAX_ITEMS = 8; // Reduced items for cleaner gameplay
  const SPAWN_RATE = 1500; // Slower spawn rate (1.5s)

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

    // --- 1. Spawning Logic ---
    // Spawn if enough time passed AND (we are under max items)
    if (time - lastSpawnTime.current > SPAWN_RATE && objects.filter(o => !o.isSliced).length < MAX_ITEMS) { 
      // 20% chance of bomb
      const isBomb = Math.random() < 0.2; 
      const item = isBomb ? ITEMS[ITEMS.length - 1] : ITEMS[Math.floor(Math.random() * (ITEMS.length - 1))];
      
      const newObj: GameObject = {
        id: time + Math.random(),
        type: item.type as 'fruit' | 'bomb',
        emoji: item.emoji,
        x: 10 + Math.random() * 80, // Keep away from extreme edges
        y: -15, 
        // Velocity calc: Distance 125 units (-15 to 110). 
        // 10s * 60fps = 600 frames. 125/600 ~= 0.208.
        velocity: 0.2, 
        isSliced: false
      };
      
      setObjects(prev => [...prev, newObj]);
      lastSpawnTime.current = time;
    }

    // --- 2. Motion Detection (Populate Grid) ---
    if (videoElement && motionCanvasRef.current) {
      const mCanvas = motionCanvasRef.current;
      const ctx = mCanvas.getContext('2d', { willReadFrequently: true });
      
      if (ctx && videoElement.readyState === 4) {
        // Init motion grid if needed
        if (!motionGridRef.current) {
          motionGridRef.current = new Uint8Array(GRID_X * GRID_Y);
        }

        // Draw small frame for motion processing
        ctx.drawImage(videoElement, 0, 0, GRID_X, GRID_Y);
        const frame = ctx.getImageData(0, 0, GRID_X, GRID_Y);
        const data = frame.data;
        const len = data.length;

        // Reset grid
        motionGridRef.current.fill(0);

        if (prevFrameRef.current) {
           for (let i = 0; i < len; i += 4) {
              const rDiff = Math.abs(data[i] - prevFrameRef.current[i]);
              const gDiff = Math.abs(data[i+1] - prevFrameRef.current[i+1]);
              const bDiff = Math.abs(data[i+2] - prevFrameRef.current[i+2]);
              const diff = rDiff + gDiff + bDiff;
              
              if (diff > MOTION_THRESHOLD) {
                 const pixelIdx = i / 4;
                 // Store motion in grid (1 = motion detected)
                 if (motionGridRef.current) {
                    motionGridRef.current[pixelIdx] = 1;
                 }
              }
           }
        }
        prevFrameRef.current = new Uint8ClampedArray(data);
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

         // --- COLLISION LOGIC: Check Grid ---
         if (!obj.isSliced && motionGridRef.current) {
            // Mapping Logic:
            // Object X (0-100) is on screen. Screen is mirrored.
            // Screen Left (0) = Camera Right (Grid X Max).
            // Screen Right (100) = Camera Left (Grid X 0).
            // So we invert X.
            
            const gridX = Math.floor((1.0 - (obj.x / 100)) * GRID_X);
            const gridY = Math.floor((obj.y / 100) * GRID_Y);

            // Check boundaries
            if (gridX >= 0 && gridX < GRID_X && gridY >= 0 && gridY < GRID_Y) {
               // Check the exact pixel and neighbors (3x3 area) for better hit detection
               let hit = false;
               for(let dy = -1; dy <= 1; dy++) {
                 for(let dx = -1; dx <= 1; dx++) {
                   const checkX = gridX + dx;
                   const checkY = gridY + dy;
                   if (checkX >= 0 && checkX < GRID_X && checkY >= 0 && checkY < GRID_Y) {
                     if (motionGridRef.current[checkY * GRID_X + checkX] === 1) {
                       hit = true;
                       break;
                     }
                   }
                 }
                 if(hit) break;
               }

               if (hit) {
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

         // Draw Particles
         particlesRef.current.forEach(p => {
           p.x += p.vx;
           p.y += p.vy;
           p.life -= 0.05;

           if (p.life > 0) {
             const px = (p.x / 100) * w;
             const py = (p.y / 100) * h;
             
             ctx.fillStyle = p.color === 'red'
                  ? `rgba(255, 50, 50, ${p.life})`
                  : `rgba(255, 255, 100, ${p.life})`;
             
             ctx.beginPath();
             ctx.arc(px, py, 4, 0, Math.PI * 2);
             ctx.fill();
           }
         });
         
         // Clean dead particles
         particlesRef.current = particlesRef.current.filter(p => p.life > 0);
       }
    }

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    // Set Visual Canvas Size to match window initially
    if (visualCanvasRef.current) {
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
      motionGridRef.current = null;
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

      {/* 2. Visual Effects Canvas (Particles) */}
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
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-red-600 rounded-full blur-3xl opacity-80 animate-pulse"></div>
                    <div className="text-8xl animate-bounce">💥</div>
                 </div>
               ) : (
                 <div className="relative">
                    {/* Slash */}
                    <div className="absolute top-1/2 left-1/2 w-40 h-2 bg-white -translate-x-1/2 -translate-y-1/2 rotate-[-45deg] shadow-[0_0_20px_rgba(255,255,255,1)] z-10 animate-pulse"></div>
                    <div className="text-8xl opacity-60 scale-110 transition-all duration-300 ease-out grayscale" style={{ transform: 'rotate(180deg) scale(1.2)' }}>
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
             <span className="text-8xl select-none filter drop-shadow-2xl animate-pulse">
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