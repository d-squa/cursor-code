import { cn } from "@/lib/utils";

interface RadialProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink';
}

const colorClasses = {
  blue: 'stroke-blue-500',
  green: 'stroke-emerald-500',
  purple: 'stroke-purple-500',
  orange: 'stroke-orange-500',
  pink: 'stroke-pink-500',
};

const gradientIds = {
  blue: 'gradient-blue',
  green: 'gradient-green',
  purple: 'gradient-purple',
  orange: 'gradient-orange',
  pink: 'gradient-pink',
};

export default function RadialProgress({
  value,
  max = 100,
  size = 120,
  strokeWidth = 12,
  label,
  sublabel,
  color = 'blue'
}: RadialProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = Math.min(100, (value / max) * 100);
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id={gradientIds[color]} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color === 'blue' ? '#3b82f6' : color === 'green' ? '#10b981' : color === 'purple' ? '#8b5cf6' : color === 'orange' ? '#f97316' : '#ec4899'} />
            <stop offset="100%" stopColor={color === 'blue' ? '#60a5fa' : color === 'green' ? '#34d399' : color === 'purple' ? '#a78bfa' : color === 'orange' ? '#fb923c' : '#f472b6'} />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/30"
          strokeWidth={strokeWidth}
        />
        
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientIds[color]})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          filter="url(#glow)"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{percentage.toFixed(0)}%</span>
        {label && <span className="text-xs text-muted-foreground font-medium">{label}</span>}
        {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
      </div>
    </div>
  );
}
