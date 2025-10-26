import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ForecastMetrics {
  onTargetReach: number;
  onTargetImpressions: number;
  totalReach: number;
  totalImpressions: number;
  cpm: number;
  frequency: number;
}

export const GoogleAdsForecastTest = () => {
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<ForecastMetrics | null>(null);
  const { toast } = useToast();

  const handleFetchForecast = async () => {
    setLoading(true);
    try {
      console.log("Calling Google Ads forecast function...");
      
      const { data, error } = await supabase.functions.invoke('google-ads-forecast', {
        body: {
          customerId: "7262510539",
          locationId: "2840",
          currencyCode: "USD",
          budget: 50000,
          campaignDuration: {
            startDate: "2025-11-01",
            endDate: "2025-12-31"
          },
          targeting: {
            ageRange: "18-24",
            gender: "Female"
          },
          adProducts: ["BUMPER", "SKIPPABLE_IN_STREAM"]
        }
      });

      if (error) {
        console.error("Function error:", error);
        throw error;
      }

      console.log("Function response:", data);

      if (data.success) {
        setMetrics(data.metrics);
        toast({
          title: "Forecast Retrieved",
          description: "Successfully fetched Google Ads forecast data",
        });
      } else {
        throw new Error(data.error || "Unknown error");
      }
    } catch (error) {
      console.error("Error fetching forecast:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch forecast",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    return num.toFixed(2);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Google Ads API Test - ReachPlanService</CardTitle>
        <CardDescription>
          Test live API call to Google Ads ReachPlanService for YouTube campaign forecast
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <p><strong>Location:</strong> United States (2840)</p>
          <p><strong>Budget:</strong> $50,000 USD</p>
          <p><strong>Duration:</strong> Nov 1, 2025 - Dec 31, 2025 (61 days)</p>
          <p><strong>Target:</strong> Female, 18-24</p>
          <p><strong>Ad Formats:</strong> Bumper Ads, Skippable In-Stream</p>
        </div>

        <Button 
          onClick={handleFetchForecast} 
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fetching Forecast...
            </>
          ) : (
            "Fetch Google Ads Forecast"
          )}
        </Button>

        {metrics && (
          <div className="grid grid-cols-2 gap-4 mt-6">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>On Target Reach</CardDescription>
                <CardTitle className="text-2xl">{formatNumber(metrics.onTargetReach)}</CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>On Target Impressions</CardDescription>
                <CardTitle className="text-2xl">{formatNumber(metrics.onTargetImpressions)}</CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Total Reach</CardDescription>
                <CardTitle className="text-2xl">{formatNumber(metrics.totalReach)}</CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Total Impressions</CardDescription>
                <CardTitle className="text-2xl">{formatNumber(metrics.totalImpressions)}</CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>CPM</CardDescription>
                <CardTitle className="text-2xl">${metrics.cpm.toFixed(2)}</CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Frequency</CardDescription>
                <CardTitle className="text-2xl">{metrics.frequency.toFixed(2)}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
