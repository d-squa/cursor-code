import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformSelector } from "./PlatformSelector";
import { BudgetAllocation } from "./BudgetAllocation";
import { Calendar, Download, Rocket } from "lucide-react";
import { toast } from "sonner";

interface Platform {
  id: string;
  name: string;
  enabled: boolean;
  budgetPercentage: number;
}

export function MediaPlanEditor() {
  const [totalBudget, setTotalBudget] = useState<string>("10000");
  const [objective, setObjective] = useState<string>("Brand Awareness");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [platforms, setPlatforms] = useState<Platform[]>([
    { id: "meta", name: "Meta", enabled: true, budgetPercentage: 30 },
    { id: "google", name: "Google Ads", enabled: true, budgetPercentage: 25 },
    { id: "linkedin", name: "LinkedIn", enabled: true, budgetPercentage: 20 },
    { id: "tiktok", name: "TikTok", enabled: false, budgetPercentage: 10 },
    { id: "snapchat", name: "Snapchat", enabled: false, budgetPercentage: 10 },
    { id: "pinterest", name: "Pinterest", enabled: false, budgetPercentage: 5 },
  ]);

  const handleExport = () => {
    toast.success("Media plan exported successfully!");
  };

  const handleLaunch = () => {
    toast.success("Campaign ready to launch across selected platforms!");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Campaign Details</CardTitle>
          <CardDescription>Define your campaign's core parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="budget">Total Budget ($)</Label>
              <Input
                id="budget"
                type="number"
                value={totalBudget}
                onChange={(e) => setTotalBudget(e.target.value)}
                placeholder="Enter total budget"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="objective">Campaign Objective</Label>
              <Input
                id="objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="e.g., Brand Awareness, Conversions"
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start-date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Start Date
              </Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                End Date
              </Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <PlatformSelector platforms={platforms} setPlatforms={setPlatforms} />

      <BudgetAllocation platforms={platforms} setPlatforms={setPlatforms} totalBudget={parseFloat(totalBudget) || 0} />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 justify-end">
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Export Media Plan
            </Button>
            <Button variant="gradient" onClick={handleLaunch} className="gap-2">
              <Rocket className="h-4 w-4" />
              Launch Campaign
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
