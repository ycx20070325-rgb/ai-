import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

interface CameraFeedProps {
  isActive: boolean;
}

export interface CameraFeedHandle {
  capture: () => string | null;
  video: HTMLVideoElement | null;
}

const CameraFeed = forwardRef<CameraFeedHandle, CameraFeedProps>(({ isActive }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    capture: () => {
      if (!videoRef.current || !canvasRef.current) return null;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return null;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      // Mirror the capture to match the mirrored video preview
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      return canvas.toDataURL('image/jpeg', 0.8);
    },
    get video() {
      return videoRef.current;
    }
  }));

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    if (isActive) {
      startCamera();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isActive]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover transform -scale-x-100" // Mirror effect
      />
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Grid Overlay for alignment help */}
      <div className="absolute inset-0 pointer-events-none opacity-10 flex">
        <div className="flex-1 border-r border-white"></div>
        <div className="flex-1 border-r border-white"></div>
        <div className="flex-1"></div>
      </div>
      <div className="absolute inset-0 pointer-events-none opacity-10 flex flex-col">
        <div className="flex-1 border-b border-white"></div>
        <div className="flex-1 border-b border-white"></div>
        <div className="flex-1"></div>
      </div>
    </div>
  );
});

export default CameraFeed;