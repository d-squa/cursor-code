import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import TaxonomyBuilder from "./TaxonomyBuilder";

interface AccountTaxonomySectionProps {
  adAccountId: string;
  platform: 'meta' | 'tiktok' | 'google';
  userId: string;
}

export default function AccountTaxonomySection({
  adAccountId,
  platform,
  userId,
}: AccountTaxonomySectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Naming Taxonomy</h3>
        <Badge variant="secondary" className="text-xs">
          {platform === 'meta' ? 'Meta' : 'TikTok'}
        </Badge>
      </div>
      
      <p className="text-xs text-muted-foreground">
        Configure naming structure for campaigns, ad sets, and ads. Values are auto-extracted from ActiPlan workflow data. 
        Click "Reset" to update to the latest default template.
      </p>

      <Accordion type="multiple" className="space-y-2">
        <AccordionItem value="campaign" className="border rounded-lg">
          <AccordionTrigger className="px-4 py-2 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Campaign Taxonomy</span>
              <Badge variant="outline" className="text-xs">Required: Platform, BO, Team</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <TaxonomyBuilder
              adAccountId={adAccountId}
              platform={platform}
              userId={userId}
              entityType="campaign"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="adset" className="border rounded-lg">
          <AccordionTrigger className="px-4 py-2 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {platform === 'tiktok' ? 'Ad Group' : 'Ad Set'} Taxonomy
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <TaxonomyBuilder
              adAccountId={adAccountId}
              platform={platform}
              userId={userId}
              entityType="adset"
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="ad" className="border rounded-lg">
          <AccordionTrigger className="px-4 py-2 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Ad Taxonomy</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <TaxonomyBuilder
              adAccountId={adAccountId}
              platform={platform}
              userId={userId}
              entityType="ad"
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
