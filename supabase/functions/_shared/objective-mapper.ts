/**
 * Platform Objective Mapping Service
 * Handles translation of objectives between platforms (Meta -> TikTok, etc.)
 * Uses database mapping table with fallbacks for unmapped objectives
 */

import { createClient } from "npm:@supabase/supabase-js@2.76.1";

export interface ObjectiveMapping {
  sourceObjective: string;
  targetObjective: string;
  targetPlatform: string;
  notes?: string;
}

export class ObjectiveMapper {
  private supabase;
  private mappingCache: Map<string, ObjectiveMapping> = new Map();

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Map objective from source platform to target platform
   */
  async mapObjective(
    sourceObjective: string,
    sourcePlatform: string,
    targetPlatform: string
  ): Promise<ObjectiveMapping> {
    const cacheKey = `${sourcePlatform}:${sourceObjective}:${targetPlatform}`;
    
    // Check cache first
    if (this.mappingCache.has(cacheKey)) {
      return this.mappingCache.get(cacheKey)!;
    }

    try {
      // Query mapping table
      const { data, error } = await this.supabase
        .from("platform_objective_mapping")
        .select("*")
        .eq("source_platform", sourcePlatform.toLowerCase())
        .eq("source_objective", sourceObjective.toUpperCase())
        .eq("target_platform", targetPlatform.toLowerCase())
        .maybeSingle();

      if (error) {
        console.error("Error fetching objective mapping:", error);
      }

      if (data) {
        const mapping: ObjectiveMapping = {
          sourceObjective: data.source_objective,
          targetObjective: data.target_objective,
          targetPlatform: data.target_platform,
          notes: data.notes,
        };
        
        this.mappingCache.set(cacheKey, mapping);
        return mapping;
      }

      // Fallback to hardcoded mapping
      const fallbackMapping = this.getFallbackMapping(
        sourceObjective,
        sourcePlatform,
        targetPlatform
      );
      
      // Log unmapped objective to capability gaps
      await this.logCapabilityGap(
        targetPlatform,
        "objective",
        sourceObjective,
        `No mapping found for ${sourcePlatform} objective: ${sourceObjective}`,
        fallbackMapping.targetObjective
      );

      return fallbackMapping;
    } catch (error) {
      console.error("Error in mapObjective:", error);
      return this.getFallbackMapping(sourceObjective, sourcePlatform, targetPlatform);
    }
  }

  /**
   * Get fallback mapping when database lookup fails
   */
  private getFallbackMapping(
    sourceObjective: string,
    sourcePlatform: string,
    targetPlatform: string
  ): ObjectiveMapping {
    const upper = sourceObjective.toUpperCase();

    if (targetPlatform.toLowerCase() === "tiktok") {
      // Meta -> TikTok fallback mappings
      if (upper.includes("AWARENESS") || upper.includes("REACH")) {
        return {
          sourceObjective: upper,
          targetObjective: "REACH",
          targetPlatform: "tiktok",
          notes: "Fallback: awareness maps to reach",
        };
      }
      if (upper.includes("TRAFFIC") || upper.includes("LINK")) {
        return {
          sourceObjective: upper,
          targetObjective: "TRAFFIC",
          targetPlatform: "tiktok",
          notes: "Fallback: traffic/link clicks",
        };
      }
      if (upper.includes("ENGAGEMENT") || upper.includes("VIDEO")) {
        return {
          sourceObjective: upper,
          targetObjective: "VIDEO_VIEWS",
          targetPlatform: "tiktok",
          notes: "Fallback: engagement via video views",
        };
      }
      if (upper.includes("LEAD")) {
        return {
          sourceObjective: upper,
          targetObjective: "LEAD_GENERATION",
          targetPlatform: "tiktok",
          notes: "Fallback: lead generation",
        };
      }
      if (upper.includes("CONVERSION") || upper.includes("SALES") || upper.includes("PURCHASE")) {
        return {
          sourceObjective: upper,
          targetObjective: "WEB_CONVERSIONS",
          targetPlatform: "tiktok",
          notes: "Fallback: conversions/sales → WEB_CONVERSIONS (not PRODUCT_CATALOG_PRODUCT_SALES)",
        };
      }
      if (upper.includes("APP")) {
        return {
          sourceObjective: upper,
          targetObjective: "APP_PROMOTION",
          targetPlatform: "tiktok",
          notes: "Fallback: app promotion",
        };
      }

      // Default fallback
      return {
        sourceObjective: upper,
        targetObjective: "TRAFFIC",
        targetPlatform: "tiktok",
        notes: "Default fallback to traffic",
      };
    }

    if (targetPlatform.toLowerCase() === "google" || targetPlatform.toLowerCase() === "google_ads") {
      // Meta/TikTok -> Google Ads fallback mappings
      if (upper.includes("AWARENESS") || upper.includes("REACH")) {
        return {
          sourceObjective: upper,
          targetObjective: "AWARENESS",
          targetPlatform: "google",
          notes: "Fallback: awareness/reach → Display/Video awareness",
        };
      }
      if (upper.includes("TRAFFIC") || upper.includes("LINK") || upper.includes("CLICK")) {
        return {
          sourceObjective: upper,
          targetObjective: "WEBSITE_TRAFFIC",
          targetPlatform: "google",
          notes: "Fallback: traffic/clicks → Search/Display traffic",
        };
      }
      if (upper.includes("ENGAGEMENT") || upper.includes("VIDEO")) {
        return {
          sourceObjective: upper,
          targetObjective: "CONSIDERATION",
          targetPlatform: "google",
          notes: "Fallback: engagement/video → Video consideration",
        };
      }
      if (upper.includes("LEAD")) {
        return {
          sourceObjective: upper,
          targetObjective: "LEADS",
          targetPlatform: "google",
          notes: "Fallback: leads → PMax/Search leads",
        };
      }
      if (upper.includes("CONVERSION") || upper.includes("SALES") || upper.includes("PURCHASE")) {
        return {
          sourceObjective: upper,
          targetObjective: "SALES",
          targetPlatform: "google",
          notes: "Fallback: conversions/sales → PMax/Search sales",
        };
      }
      if (upper.includes("APP")) {
        return {
          sourceObjective: upper,
          targetObjective: "APP_PROMOTION",
          targetPlatform: "google",
          notes: "Fallback: app promotion → UAC",
        };
      }

      return {
        sourceObjective: upper,
        targetObjective: "WEBSITE_TRAFFIC",
        targetPlatform: "google",
        notes: "Default fallback to website traffic",
      };
    }

    // Default catch-all
    return {
      sourceObjective: upper,
      targetObjective: upper,
      targetPlatform,
      notes: "No mapping available, using source objective",
    };
  }

  /**
   * Log capability gap when feature is not supported or mapped
   */
  private async logCapabilityGap(
    platform: string,
    featureType: string,
    featureName: string,
    notes: string,
    fallbackBehavior: string
  ): Promise<void> {
    try {
      await this.supabase
        .from("platform_capability_gaps")
        .upsert({
          platform: platform.toLowerCase(),
          feature_type: featureType,
          feature_name: featureName,
          is_supported: false,
          fallback_behavior: fallbackBehavior,
          impact_level: "medium",
          notes: notes,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "platform,feature_type,feature_name",
        });
    } catch (error) {
      console.error("Error logging capability gap:", error);
    }
  }

  /**
   * Map placement from source to target platform
   */
  async mapPlacement(
    sourcePlacement: string,
    sourcePlatform: string,
    targetPlatform: string
  ): Promise<{ supported: boolean; targetPlacement?: string; fallback?: string }> {
    try {
      const { data, error } = await this.supabase
        .from("platform_placement_mapping")
        .select("*")
        .eq("source_platform", sourcePlatform.toLowerCase())
        .eq("source_placement", sourcePlacement.toLowerCase())
        .eq("target_platform", targetPlatform.toLowerCase())
        .maybeSingle();

      if (error) {
        console.error("Error fetching placement mapping:", error);
      }

      if (data) {
        return {
          supported: data.is_supported,
          targetPlacement: data.target_placement,
          fallback: data.fallback_placement,
        };
      }

      // Log unsupported placement
      await this.logCapabilityGap(
        targetPlatform,
        "placement",
        sourcePlacement,
        `No placement mapping from ${sourcePlatform}`,
        "exclude placement"
      );

      return { supported: false };
    } catch (error) {
      console.error("Error in mapPlacement:", error);
      return { supported: false };
    }
  }
}
