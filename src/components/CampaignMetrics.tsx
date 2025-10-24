import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Platform {
  id: string;
  name: string;
  enabled: boolean;
  budgetPercentage: number;
}

interface CampaignMetricsProps {
  platforms: Platform[];
  totalBudget: number;
}

// Industry average CPMs (Cost Per Mille) by platform
const PLATFORM_CPM: Record<string, number> = {
  meta: 8.5,
  google: 12.0,
  linkedin: 28.0,
  tiktok: 6.5,
  snapchat: 7.0,
  pinterest: 5.5,
};

// Average frequency ranges by platform
const PLATFORM_FREQUENCY: Record<string, number> = {
  meta: 3.2,
  google: 2.5,
  linkedin: 2.8,
  tiktok: 4.5,
  snapchat: 5.0,
  pinterest: 3.0,
};

// CPR (Cost Per Reach) multiplier based on platform
const CPR_MULTIPLIER: Record<string, number> = {
  meta: 0.35,
  google: 0.45,
  linkedin: 0.65,
  tiktok: 0.25,
  snapchat: 0.28,
  pinterest: 0.22,
};

export function CampaignMetrics({ platforms, totalBudget }: CampaignMetricsProps) {
  const enabledPlatforms = platforms.filter(p => p.enabled);

  const calculateMetrics = (platform: Platform) => {
    const platformBudget = (totalBudget * platform.budgetPercentage) / 100;
    const cpm = PLATFORM_CPM[platform.id] || 10;
    const frequency = PLATFORM_FREQUENCY[platform.id] || 3;
    const cprMultiplier = CPR_MULTIPLIER[platform.id] || 0.4;

    // Calculate impressions: (Budget / CPM) * 1000
    const plannedImpressions = Math.round((platformBudget / cpm) * 1000);

    // Calculate reach: Impressions / Frequency
    const plannedReach = Math.round(plannedImpressions / frequency);

    // Calculate CPR: CPM * multiplier
    const cpr = (cpm * cprMultiplier).toFixed(2);

    // Target SOV (Share of Voice): Based on budget percentage
    const targetSOV = platform.budgetPercentage.toFixed(1);

    return {
      platformBudget: platformBudget.toFixed(2),
      plannedImpressions: plannedImpressions.toLocaleString(),
      cpm: cpm.toFixed(2),
      plannedReach: plannedReach.toLocaleString(),
      cpr,
      targetSOV,
      frequency: frequency.toFixed(1),
    };
  };

  const totalMetrics = enabledPlatforms.reduce(
    (acc, platform) => {
      const metrics = calculateMetrics(platform);
      const platformBudget = (totalBudget * platform.budgetPercentage) / 100;
      
      return {
        totalBudget: acc.totalBudget + platformBudget,
        totalImpressions: acc.totalImpressions + parseInt(metrics.plannedImpressions.replace(/,/g, '')),
        totalReach: acc.totalReach + parseInt(metrics.plannedReach.replace(/,/g, '')),
      };
    },
    { totalBudget: 0, totalImpressions: 0, totalReach: 0 }
  );

  const avgCPM = totalMetrics.totalBudget > 0 
    ? ((totalMetrics.totalBudget / totalMetrics.totalImpressions) * 1000).toFixed(2)
    : "0.00";
  
  const avgCPR = totalMetrics.totalBudget > 0
    ? (totalMetrics.totalBudget / totalMetrics.totalReach).toFixed(2)
    : "0.00";

  const avgFrequency = totalMetrics.totalReach > 0
    ? (totalMetrics.totalImpressions / totalMetrics.totalReach).toFixed(1)
    : "0.0";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign Metrics Forecast</CardTitle>
        <CardDescription>
          Projected performance metrics based on budget allocation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Planned Budget</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">CPM</TableHead>
                <TableHead className="text-right">Reach</TableHead>
                <TableHead className="text-right">CPR</TableHead>
                <TableHead className="text-right">Target SOV</TableHead>
                <TableHead className="text-right">Frequency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enabledPlatforms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No platforms selected
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {enabledPlatforms.map((platform) => {
                    const metrics = calculateMetrics(platform);
                    return (
                      <TableRow key={platform.id}>
                        <TableCell className="font-medium">
                          <Badge variant="outline">{platform.name}</Badge>
                        </TableCell>
                        <TableCell className="text-right">${metrics.platformBudget}</TableCell>
                        <TableCell className="text-right">{metrics.plannedImpressions}</TableCell>
                        <TableCell className="text-right">${metrics.cpm}</TableCell>
                        <TableCell className="text-right">{metrics.plannedReach}</TableCell>
                        <TableCell className="text-right">${metrics.cpr}</TableCell>
                        <TableCell className="text-right">{metrics.targetSOV}%</TableCell>
                        <TableCell className="text-right">{metrics.frequency}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-bold bg-muted/50">
                    <TableCell>Total / Average</TableCell>
                    <TableCell className="text-right">${totalMetrics.totalBudget.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{totalMetrics.totalImpressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${avgCPM}</TableCell>
                    <TableCell className="text-right">{totalMetrics.totalReach.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${avgCPR}</TableCell>
                    <TableCell className="text-right">100.0%</TableCell>
                    <TableCell className="text-right">{avgFrequency}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 text-sm text-muted-foreground">
          <p><strong>Metrics Definitions:</strong></p>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            <li><strong>CPM (Cost Per Mille):</strong> Cost per 1,000 impressions</li>
            <li><strong>CPR (Cost Per Reach):</strong> Cost to reach one unique user</li>
            <li><strong>SOV (Share of Voice):</strong> Budget share allocated to each platform</li>
            <li><strong>Frequency:</strong> Average times a user sees your ad</li>
            <li><strong>Reach:</strong> Estimated unique users who will see your ads</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
