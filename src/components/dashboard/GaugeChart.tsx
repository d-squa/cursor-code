import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface GaugeChartProps {
  title: string;
  value: number;
  max?: number;
  target?: number;
  unit?: string;
  thresholds?: { low: number; medium: number };
}

export default function GaugeChart({
  title,
  value,
  max = 100,
  target,
  unit = '%',
  thresholds = { low: 33, medium: 66 }
}: GaugeChartProps) {
  const percentage = Math.min(100, (value / max) * 100);
  const angle = (percentage / 100) * 180 - 90; // -90 to 90 degrees
  
  const getColor = () => {
    if (percentage < thresholds.low) return { text: 'text-red-500', gradient: 'from-red-500 to-orange-500' };
    if (percentage < thresholds.medium) return { text: 'text-amber-500', gradient: 'from-amber-500 to-yellow-400' };
    return { text: 'text-emerald-500', gradient: 'from-emerald-500 to-green-400' };
  };

  const colors = getColor();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-center">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center pb-6">
        <div className="relative w-40 h-20 overflow-hidden">
          {/* Background arc */}
          <div className="absolute inset-0">
            <svg viewBox="0 0 100 50" className="w-full h-full">
              <defs>
                <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="50%" stopColor="#eab308" />
                  <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
              </defs>
              
              {/* Background track */}
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke="currentColor"
                className="text-muted/30"
                strokeWidth="8"
                strokeLinecap="round"
              />
              
              {/* Colored arc */}
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke="url(#gauge-gradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(percentage / 100) * 126} 126`}
                className="transition-all duration-1000 ease-out"
              />
              
              {/* Target marker */}
              {target && (
                <line
                  x1="50"
                  y1="50"
                  x2={50 + 35 * Math.cos(((target / max) * 180 - 90) * Math.PI / 180)}
                  y2={50 - 35 * Math.sin(((target / max) * 180 - 90) * Math.PI / 180)}
                  stroke="currentColor"
                  className="text-foreground"
                  strokeWidth="2"
                  strokeDasharray="2 2"
                />
              )}
            </svg>
          </div>
          
          {/* Needle */}
          <div 
            className="absolute bottom-0 left-1/2 w-1 h-16 origin-bottom transition-transform duration-1000 ease-out"
            style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
          >
            <div className={cn("w-1.5 h-14 rounded-full bg-gradient-to-t", colors.gradient)} />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-background border-2 border-foreground" />
          </div>
        </div>
        
        {/* Value display */}
        <div className="text-center mt-2">
          <span className={cn("text-3xl font-bold", colors.text)}>
            {value.toFixed(0)}{unit}
          </span>
          {target && (
            <p className="text-xs text-muted-foreground mt-1">
              Target: {target}{unit}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
