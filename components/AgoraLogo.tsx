export function AgoraLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="256" cy="256" r="220" fill="#1E3A5F"/>
      <polygon points="256,100 360,380 300,380 276,310 236,310 212,380 152,380" fill="white"/>
    </svg>
  );
}