import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Scans a QR code either from a live camera feed (webcam) or an uploaded
// image (fallback for coordinators without a webcam). Calls onResult(text)
// once, then stops the camera.
export default function QRScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(document.createElement("canvas"));
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScanning(true);
        tick();
      } catch (e) {
        setError("Tidak bisa akses kamera — pakai upload gambar QR di bawah.");
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          stop();
          onResult(code.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        onResult(code.data);
      } else {
        setError("QR tidak terbaca dari gambar itu, coba foto ulang lebih dekat/terang.");
      }
    };
    img.src = URL.createObjectURL(file);
  }

  return (
    <div className="card">
      <div className="row between">
        <h3 style={{ margin: 0 }}>Scan QR</h3>
        <button className="secondary" onClick={onClose}>Tutup</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ width: "100%", borderRadius: 10, background: "#000", marginTop: 10 }}
      />
      {scanning && <p className="muted" style={{ fontSize: 12 }}>Arahkan kamera ke QR code...</p>}
      <label>Atau upload foto QR</label>
      <input type="file" accept="image/*" onChange={handleFile} />
    </div>
  );
}
