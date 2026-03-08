import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle, XCircle, AlertTriangle, Play, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface TestResult {
  testId: string;
  dimension: string;
  objective: string;
  objectiveLabel: string;
  optimizationGoal: string;
  optimizationGoalLabel: string;
  bidStrategy: string;
  budgetType: string;
  placementConfig: string;
  targetingConfig: string;
  conversionEvent: string | null;
  attributionWindow: string | null;
  destinationType: string | null;
  campaignValidation: { success: boolean; error: any | null };
  adSetValidation: { success: boolean; error: any | null };
}

interface ValidationResponse {
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    passRate: string;
    adAccount: string;
    testedAt: string;
    dimensions: string[];
  };
  errorGroups: Record<string, { count: number; tests: string[]; error: any }>;
  results: TestResult[];
  failures: TestResult[];
}

const DIMENSIONS = [
  { id: "objective_optgoal", label: "Objective × OptGoal", description: "All 6 objectives with their optimization goals" },
  { id: "bid_budget", label: "Bid Strategy & Budget", description: "LOWEST_COST, COST_CAP, BID_CAP + daily/lifetime + CBO" },
  { id: "placements", label: "Placements", description: "Advantage+ vs manual with different publisher platforms" },
  { id: "targeting", label: "Targeting", description: "Age/gender/device targeting variations" },
  { id: "conversion_attribution", label: "Conversion & Attribution", description: "Pixel events, attribution windows, destination types" },
];

export default function MetaDryRunValidation() {
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<ValidationResponse | null>(null);
  const [pixelId, setPixelId] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>(
    DIMENSIONS.map((d) => d.id)
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());

  const toggleDimension = (id: string) => {
    setSelectedDimensions((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const runValidation = useCallback(async () => {
    if (selectedDimensions.length === 0) {
      toast.error("Select at least one dimension to test");
      return;
    }

    setRunning(true);
    setResponse(null);

    try {
      const { data, error } = await supabase.functions.invoke("meta-dry-run-validation", {
        body: {
          dimensions: selectedDimensions,
          pixelId: pixelId || null,
          adAccountId: adAccountId || null,
        },
      });

      if (error) throw error;
      setResponse(data as ValidationResponse);
      
      if (data.summary) {
        const s = data.summary;
        if (s.failed === 0) {
          toast.success(`All ${s.totalTests} tests passed!`);
        } else {
          toast.warning(`${s.passed}/${s.totalTests} passed, ${s.failed} failed`);
        }
      }
    } catch (err: any) {
      console.error("Dry-run error:", err);
      toast.error(err.message || "Validation failed");
    } finally {
      setRunning(false);
    }
  }, [selectedDimensions, pixelId, adAccountId]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleTest = (testId: string) => {
    setExpandedTests((prev) => {
      const next = new Set(prev);
      next.has(testId) ? next.delete(testId) : next.add(testId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Meta API Dry-Run Validation
          </CardTitle>
          <CardDescription>
            Tests all objective, bid strategy, placement, targeting, and conversion combinations
            using Meta's <code className="bg-muted px-1 rounded text-xs">validation_only=true</code> parameter.
            No real campaigns are created.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dimensions */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Test Dimensions</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {DIMENSIONS.map((dim) => (
                <label
                  key={dim.id}
                  className="flex items-start gap-2 p-2 border rounded cursor-pointer hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedDimensions.includes(dim.id)}
                    onCheckedChange={() => toggleDimension(dim.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">{dim.label}</p>
                    <p className="text-xs text-muted-foreground">{dim.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Optional inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Pixel ID (optional, needed for conversion tests)</Label>
              <Input
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                placeholder="e.g. 123456789"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ad Account ID override (optional)</Label>
              <Input
                value={adAccountId}
                onChange={(e) => setAdAccountId(e.target.value)}
                placeholder="e.g. act_123456789"
                className="h-9"
              />
            </div>
          </div>

          <Button onClick={runValidation} disabled={running} className="w-full sm:w-auto">
            {running ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running validation...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Dry-Run Validation
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {response && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold">{response.summary.totalTests}</p>
                <p className="text-xs text-muted-foreground">Total Tests</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold text-green-600">{response.summary.passed}</p>
                <p className="text-xs text-muted-foreground">Passed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold text-red-600">{response.summary.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <p className="text-2xl font-bold">{response.summary.passRate}</p>
                <p className="text-xs text-muted-foreground">Pass Rate</p>
              </CardContent>
            </Card>
          </div>

          {/* Error Groups */}
          {Object.keys(response.errorGroups).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  Error Groups ({Object.keys(response.errorGroups).length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(response.errorGroups).map(([key, group]) => (
                    <Collapsible key={key} open={expandedGroups.has(key)}>
                      <CollapsibleTrigger
                        onClick={() => toggleGroup(key)}
                        className="w-full flex items-center justify-between p-3 bg-destructive/5 border border-destructive/20 rounded hover:bg-destructive/10"
                      >
                        <div className="flex items-center gap-2">
                          {expandedGroups.has(key) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <Badge variant="destructive" className="text-xs">
                            {group.count}× 
                          </Badge>
                          <span className="text-sm font-mono">{key}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {group.tests.slice(0, 3).join(", ")}
                          {group.tests.length > 3 ? ` +${group.tests.length - 3} more` : ""}
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-1 p-3 bg-muted/30 rounded border text-xs">
                        <p className="font-medium mb-1">Error message:</p>
                        <pre className="whitespace-pre-wrap text-destructive bg-destructive/5 p-2 rounded mb-2 max-h-40 overflow-auto">
                          {group.error?.message || JSON.stringify(group.error, null, 2)}
                        </pre>
                        {group.error?.error_user_msg && (
                          <>
                            <p className="font-medium mb-1">User message:</p>
                            <p className="text-muted-foreground mb-2">{group.error.error_user_msg}</p>
                          </>
                        )}
                        <p className="font-medium mb-1">Affected tests:</p>
                        <p className="text-muted-foreground">{group.tests.join(", ")}</p>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* All Results */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">All Test Results</CardTitle>
              <CardDescription>
                {response.summary.adAccount} • {new Date(response.summary.testedAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-1">
                  {response.results.map((result) => {
                    const passed = result.campaignValidation.success && result.adSetValidation.success;
                    const isExpanded = expandedTests.has(result.testId);

                    return (
                      <div key={result.testId} className="border rounded">
                        <button
                          onClick={() => toggleTest(result.testId)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 ${
                            passed ? "" : "bg-destructive/5"
                          }`}
                        >
                          {passed ? (
                            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                          )}
                          <Badge variant="outline" className="text-[10px] flex-shrink-0">
                            {result.testId}
                          </Badge>
                          <span className="text-xs truncate flex-1">
                            {result.objectiveLabel} → {result.optimizationGoalLabel}
                            {result.bidStrategy !== "LOWEST_COST_WITHOUT_CAP" && (
                              <span className="text-muted-foreground"> • {result.bidStrategy}</span>
                            )}
                            {result.placementConfig !== "Advantage+ (auto)" && (
                              <span className="text-muted-foreground"> • {result.placementConfig}</span>
                            )}
                            {result.conversionEvent && (
                              <span className="text-muted-foreground"> • {result.conversionEvent}</span>
                            )}
                            {result.destinationType && (
                              <span className="text-muted-foreground"> • dest:{result.destinationType}</span>
                            )}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] flex-shrink-0"
                          >
                            {result.dimension}
                          </Badge>
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 text-xs border-t bg-muted/20 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="font-medium">Objective:</span> {result.objective}
                              </div>
                              <div>
                                <span className="font-medium">Opt Goal:</span> {result.optimizationGoal}
                              </div>
                              <div>
                                <span className="font-medium">Bid Strategy:</span> {result.bidStrategy}
                              </div>
                              <div>
                                <span className="font-medium">Budget:</span> {result.budgetType}
                              </div>
                              <div>
                                <span className="font-medium">Placement:</span> {result.placementConfig}
                              </div>
                              <div>
                                <span className="font-medium">Targeting:</span> {result.targetingConfig}
                              </div>
                              {result.conversionEvent && (
                                <div>
                                  <span className="font-medium">Conv Event:</span> {result.conversionEvent}
                                </div>
                              )}
                              {result.attributionWindow && (
                                <div>
                                  <span className="font-medium">Attribution:</span> {result.attributionWindow}
                                </div>
                              )}
                              {result.destinationType && (
                                <div>
                                  <span className="font-medium">Destination:</span> {result.destinationType}
                                </div>
                              )}
                            </div>

                            {!result.campaignValidation.success && result.campaignValidation.error && (
                              <div className="bg-destructive/10 p-2 rounded">
                                <p className="font-medium text-destructive">Campaign Error:</p>
                                <pre className="whitespace-pre-wrap mt-1">
                                  {JSON.stringify(result.campaignValidation.error, null, 2)}
                                </pre>
                              </div>
                            )}
                            {!result.adSetValidation.success && result.adSetValidation.error && (
                              <div className="bg-destructive/10 p-2 rounded">
                                <p className="font-medium text-destructive">Ad Set Error:</p>
                                <pre className="whitespace-pre-wrap mt-1">
                                  {JSON.stringify(result.adSetValidation.error, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
