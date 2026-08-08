import { useEffect, useRef } from "react";
import QRCode from "qrcode";

// Renders `data` (a string) as a QR code on a canvas. Used both for the
// coordinator (tx payload) and inside signer.html (signature payload).
export default function QRDisplay({ data, size = 260 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, data, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
    }).catch((err) => console.error("QR render error:", err));
  }, [data, size]);

  if (!data) return null;

  return (
    <div className="qr-box">
      <canvas ref={canvasRef} width={size} height={size} />
    </div>
  );
}
