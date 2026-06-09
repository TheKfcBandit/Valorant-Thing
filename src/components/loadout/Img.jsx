import { useState } from "react";

export function Img({ src, className = "", fallback = null }) {
  const [err, setErr] = useState(false);
  if (!src || err) return fallback || <div className={`bg-base-600/50 ${className}`} />;
  return (
    <img
      src={src}
      alt=""
      className={className}
      onError={() => setErr(true)}
      loading="lazy"
      draggable={false}
    />
  );
}
