import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, Check, X, AlertCircle } from "lucide-react";

interface WebcamCaptureProps {
  label: string;
  onCapture: (file: File) => void;
  onCancel: () => void;
}

export default function WebcamCapture({ label, onCapture, onCancel }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<"loading" | "preview" | "captured" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);

  // Start the camera stream
  const startCamera = useCallback(async () => {
    setPhase("loading");
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setPhase("preview");
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission denied") || msg.includes("NotAllowedError")) {
        setErrorMsg("Camera access was denied. Please allow camera access in your browser settings and try again.");
      } else if (msg.includes("NotFoundError") || msg.includes("DevicesNotFoundError")) {
        setErrorMsg("No camera found on this device.");
      } else {
        setErrorMsg(`Could not access camera: ${msg}`);
      }
      setPhase("error");
    }
  }, []);

  // Stop the camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Capture a still frame from the video
  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedDataUrl(dataUrl);
    stopCamera();
    setPhase("captured");
  };

  // Retake — restart the camera
  const retake = () => {
    setCapturedDataUrl(null);
    startCamera();
  };

  // Confirm — convert canvas to File and pass up
  const confirmCapture = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const file = new File([blob], `${label.replace(/\s+/g, "-").toLowerCase()}-${timestamp}.jpg`, {
          type: "image/jpeg",
        });
        onCapture(file);
      },
      "image/jpeg",
      0.92
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <button
          onClick={() => { stopCamera(); onCancel(); }}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
        {/* Loading state */}
        {phase === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/60">
            <div className="h-8 w-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            <p className="text-sm">Starting camera…</p>
          </div>
        )}

        {/* Error state */}
        {phase === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-sm text-white/80 leading-relaxed">{errorMsg}</p>
            <Button size="sm" variant="outline" onClick={startCamera} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Try Again
            </Button>
          </div>
        )}

        {/* Live video preview */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${phase === "preview" ? "opacity-100" : "opacity-0"}`}
          style={{ display: phase === "error" || phase === "captured" ? "none" : "block" }}
        />

        {/* Captured photo preview */}
        {phase === "captured" && capturedDataUrl && (
          <img
            src={capturedDataUrl}
            alt="Captured photo"
            className="w-full h-full object-cover"
          />
        )}

        {/* Hidden canvas for snapshot */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Capture button overlay — shown during live preview */}
        {phase === "preview" && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <button
              onClick={capturePhoto}
              className="h-14 w-14 rounded-full bg-white border-4 border-white/30 shadow-lg hover:scale-105 active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              title="Take photo"
            >
              <span className="sr-only">Capture</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer actions — shown after capture */}
      {phase === "captured" && (
        <div className="flex gap-3 px-4 py-3 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={retake}
            className="flex-1"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retake
          </Button>
          <Button
            size="sm"
            onClick={confirmCapture}
            className="flex-1"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Use Photo
          </Button>
        </div>
      )}
    </div>
  );
}
