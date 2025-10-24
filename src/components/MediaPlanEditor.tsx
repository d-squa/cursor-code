import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformSelector } from "./PlatformSelector";
import { BudgetSummary } from "./BudgetSummary";
import { CampaignMetrics } from "./CampaignMetrics";
import { Calendar, Download, Rocket, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import { Platform, PlatformConfiguration } from "./PlatformConfiguration";


export function MediaPlanEditor() {
  const { user } = useAuth();
  const [campaignName, setCampaignName] = useState<string>("");
  const [totalBudget, setTotalBudget] = useState<string>("10000");
  const [objective, setObjective] = useState<string>("Brand Awareness");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>([
    { id: "meta", name: "Meta", enabled: true, budgetPercentage: 30, config: undefined },
    { id: "google", name: "Google Ads", enabled: true, budgetPercentage: 25, config: undefined },
    { id: "linkedin", name: "LinkedIn", enabled: true, budgetPercentage: 20, config: undefined },
    { id: "tiktok", name: "TikTok", enabled: false, budgetPercentage: 10, config: undefined },
    { id: "snapchat", name: "Snapchat", enabled: false, budgetPercentage: 10, config: undefined },
    { id: "pinterest", name: "Pinterest", enabled: false, budgetPercentage: 5, config: undefined },
  ]);

  const isAllPlatformsConfigured = () => {
    const enabledPlatforms = platforms.filter(p => p.enabled);
    if (enabledPlatforms.length === 0) return false;
    return enabledPlatforms.every(p => {
      if (!p.config) return false;
      const { objective, campaignType, optimizationGoal, targeting } = p.config;
      return !!(
        objective &&
        campaignType &&
        optimizationGoal &&
        targeting?.locations?.length &&
        targeting?.ageMin &&
        targeting?.ageMax
      );
    });
  };

  const handleExport = () => {
    const campaignData = {
      name: campaignName,
      objective,
      totalBudget,
      startDate,
      endDate,
      platforms: platforms.filter(p => p.enabled),
      budgetAllocation: platforms
        .filter(p => p.enabled)
        .reduce((acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }), {}),
    };
    
    const blob = new Blob([JSON.stringify(campaignData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-${campaignName || 'plan'}.json`;
    a.click();
    toast.success("Media plan exported successfully!");
  };

  const handleLaunch = async () => {
    if (!campaignName.trim()) {
      toast.error("Please enter a campaign name");
      return;
    }

    setSaving(true);
    try {
      const budgetAllocation = platforms
        .filter(p => p.enabled)
        .reduce((acc, p) => ({ ...acc, [p.id]: p.budgetPercentage }), {});

      const { error } = await supabase.from("campaigns").insert({
        user_id: user?.id,
        name: campaignName,
        objective,
        total_budget: parseFloat(totalBudget) || 0,
        start_date: startDate || null,
        end_date: endDate || null,
        platforms: platforms.filter(p => p.enabled).map(p => ({ id: p.id, name: p.name })),
        budget_allocation: budgetAllocation,
        status: "active",
      });

      if (error) throw error;
      
      toast.success("Campaign launched successfully!");
      setCampaignName("");
    } catch (error: any) {
      toast.error(error.message || "Failed to launch campaign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Activation Details</CardTitle>
            <CardDescription>Define your activation's core parameters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Activation Name</Label>
            <Input
              id="name"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g., Q1 2024 Brand Activation"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget">Total Activation Budget ($)</Label>
            <Input
              id="budget"
              type="number"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              placeholder="Enter total budget"
            />
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

        <PlatformConfiguration 
          platforms={platforms} 
          setPlatforms={setPlatforms} 
          startDate={startDate}
          endDate={endDate}
        />

        {isAllPlatformsConfigured() && (
          <CampaignMetrics platforms={platforms} totalBudget={parseFloat(totalBudget) || 0} />
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-end">
              <Button variant="outline" onClick={handleExport} className="gap-2">
                <Download className="h-4 w-4" />
                Export Media Plan
              </Button>
              <Button variant="gradient" onClick={handleLaunch} className="gap-2" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Launching...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Launch Campaign
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:block hidden">
        <BudgetSummary platforms={platforms} setPlatforms={setPlatforms} totalBudget={parseFloat(totalBudget) || 0} />
      </div>
    </div>
  );
}
