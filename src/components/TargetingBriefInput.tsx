import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TargetingBriefInputProps {
  onTargetingGenerated: (targeting: any[]) => void;
}

export function TargetingBriefInput({ onTargetingGenerated }: TargetingBriefInputProps) {
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [adAccountId, setAdAccountId] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const fetchAdAccount = async () => {
      const { data: accounts } = await supabase
        .from("meta_ad_accounts")
        .select("account_id")
        .limit(1)
        .single();
      
      if (accounts) {
        setAdAccountId(accounts.account_id);
      }
    };
    fetchAdAccount();
  }, []);

  const handleGenerate = async () => {
    if (!brief.trim()) {
      toast({
        title: "Brief Required",
        description: "Please describe your targeting strategy first.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-targeting-brief", {
        body: { brief, adAccountId },
      });

      if (error) throw error;

      if (data?.targeting) {
        onTargetingGenerated(data.targeting);
        toast({
          title: "Targeting Generated",
          description: `Successfully parsed targeting for ${data.targeting.length} market(s).`,
        });
      }
    } catch (error) {
      console.error("Error generating targeting:", error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate targeting",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Describe Your Targeting Strategy
        </CardTitle>
        <CardDescription>
          Describe what you want to achieve with your campaign. Include details about locations, demographics, interests, and audience types.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder="Example: I'd like to expand to new audiences who are interested in alcohol and have a job. They should be 21+, females. I already have customer lists and website visitors, so I'd like to reach people who look like these as well. That's for UAE. For KSA, it's a new market, we're looking to penetrate this market. We'll be targeting broad audiences, +21."
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={6}
          className="resize-none"
        />
        <Button
          onClick={handleGenerate}
          disabled={loading || !brief.trim()}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Targeting...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Targeting from Brief
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
