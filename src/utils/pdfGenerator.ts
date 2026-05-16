import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export interface KeywordItemForExport {
  id: string;
  name: string;
  platform: "google" | "tiktok";
  avgMonthlySearches?: number;
  competition?: string;
  cpcLow?: number;
  cpcHigh?: number;
  strategy?: "brand" | "generic" | "competition";
  matchType?: "exact" | "phrase" | "broad";
  isNegative?: boolean;
}

export interface MediaPlanData {
  name: string;
  totalBudget: number;
  startDate: string;
  endDate: string;
  platforms: any[];
  genericConfig: any;
  forecasts?: any;
  selectedKeywords?: KeywordItemForExport[];
  clientBranding?: {
    name?: string;
    client_logo_url?: string | null;
    agency_logo_url?: string | null;
    brand_font_color?: string | null;
    brand_background_color?: string | null;
    brand_foreground_color?: string | null;
  };
  actiplanForecasts?: {
    totalBudget: number;
    totalAudienceSize: number;
    totalImpressions: number;
    totalReach: number;
    avgCPM: number;
    frequency: number;
    sov: number;
    platformDeliverables: Record<string, Array<{ kpi: string; result: number }>>;
    platforms: Array<{
      platformId: string;
      platformName: string;
      totalBudget: number;
      totalAudienceSize: number;
      totalImpressions: number;
      totalReach: number;
      avgCPM: number;
      frequency: number;
      sov: number;
      markets: Array<{
        marketName: string;
        budget: number;
        audienceSize: number;
        impressions: number;
        reach: number;
        cpm: number;
        frequency: number;
        sov: number;
        resultsByGoal: Array<{
          goal: string;
          kpi: string;
          result: number;
          costPerResult: number;
          resultRate: number;
        }>;
        phases: Array<{
          phaseName: string;
          budget: number;
          startDate: string;
          endDate: string;
          kpi: string;
          optimizationGoal: string;
          result: number;
          costPerResult: number;
          resultRate: number;
        }>;
      }>;
    }>;
  };
}

async function fetchImageAsDataUrl(url: string): Promise<{ dataUrl: string; format: string; width: number; height: number } | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => resolve({ width: 100, height: 40 });
      img.src = dataUrl;
    });
    const mime = blob.type || "image/png";
    const format = mime.includes("png") ? "PNG" : mime.includes("jpeg") || mime.includes("jpg") ? "JPEG" : mime.includes("webp") ? "WEBP" : "PNG";
    return { dataUrl, format, ...dims };
  } catch {
    return null;
  }
}

export async function generateMediaPlanPDF(data: MediaPlanData): Promise<Blob> {
  const doc = new jsPDF();
  let yPos = 20;

  // Branding colors
  const branding = data.clientBranding;
  const hexToRgb = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "");
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
  };
  const accentColor: [number, number, number] = branding?.brand_foreground_color
    ? hexToRgb(branding.brand_foreground_color)
    : [66, 139, 202];
  const fontColorHex = branding?.brand_font_color || "#1a1a2e";
  const fontColorRgb = hexToRgb(fontColorHex);
  const bgColorRgb: [number, number, number] | null = branding?.brand_background_color
    ? hexToRgb(branding.brand_background_color)
    : null;

  // Branded header band
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerHeight = 32;
  if (bgColorRgb) {
    doc.setFillColor(...bgColorRgb);
    doc.rect(0, 0, pageWidth, headerHeight, "F");
  }

  // Logos (fetched async)
  const [clientImg, agencyImg] = await Promise.all([
    branding?.client_logo_url ? fetchImageAsDataUrl(branding.client_logo_url) : Promise.resolve(null),
    branding?.agency_logo_url ? fetchImageAsDataUrl(branding.agency_logo_url) : Promise.resolve(null),
  ]);

  const logoMaxH = 18;
  if (clientImg) {
    const ratio = clientImg.width / clientImg.height;
    const h = logoMaxH;
    const w = h * ratio;
    try { doc.addImage(clientImg.dataUrl, clientImg.format, 12, 7, w, h); } catch {}
  }
  if (agencyImg) {
    const ratio = agencyImg.width / agencyImg.height;
    const h = logoMaxH;
    const w = h * ratio;
    try { doc.addImage(agencyImg.dataUrl, agencyImg.format, pageWidth - w - 12, 7, w, h); } catch {}
  }

  // Accent bar under header
  doc.setFillColor(...accentColor);
  doc.rect(0, headerHeight, pageWidth, 2, "F");

  yPos = headerHeight + 12;

  // Title
  doc.setFontSize(20);
  doc.setTextColor(...fontColorRgb);
  doc.text(branding?.name ? `${branding.name} — Media Plan` : 'Media Plan', 105, yPos, { align: 'center' });
  yPos += 15;

  // Plan Details
  doc.setFontSize(12);
  doc.setTextColor(...fontColorRgb);
  doc.text(`Plan Name: ${data.name}`, 20, yPos);
  yPos += 8;
  doc.text(`Total Budget: $${data.totalBudget.toLocaleString()}`, 20, yPos);
  yPos += 8;
  doc.text(`Duration: ${format(new Date(data.startDate), 'MMM d, yyyy')} - ${format(new Date(data.endDate), 'MMM d, yyyy')}`, 20, yPos);
  yPos += 8;
  doc.text(`Strategy: ${data.genericConfig.strategyFocus || 'Custom'}`, 20, yPos);
  yPos += 15;

  // Actiplan Deliverables Overview
  if (data.actiplanForecasts) {
    doc.setFontSize(14);
    doc.text('Actiplan Deliverables', 20, yPos);
    yPos += 10;

    const overviewData = [
      ['Metric', 'Value'],
      ['Total Budget', `$${data.actiplanForecasts.totalBudget.toLocaleString()}`],
      ['Total Audience Size', data.actiplanForecasts.totalAudienceSize.toLocaleString()],
      ['Total Impressions', data.actiplanForecasts.totalImpressions.toLocaleString()],
      ['Total Reach', data.actiplanForecasts.totalReach.toLocaleString()],
      ['Avg. CPM', `$${data.actiplanForecasts.avgCPM.toFixed(2)}`],
      ['Frequency', data.actiplanForecasts.frequency.toFixed(2)],
      ['SOV', `${data.actiplanForecasts.sov.toFixed(1)}%`],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [overviewData[0]],
      body: overviewData.slice(1),
      theme: 'grid',
      headStyles: { fillColor: accentColor },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Platform Deliverables
    if (Object.keys(data.actiplanForecasts.platformDeliverables).length > 0) {
      doc.setFontSize(14);
      doc.text('Platform Deliverables', 20, yPos);
      yPos += 10;

      Object.entries(data.actiplanForecasts.platformDeliverables).forEach(([platformName, kpis]) => {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(12);
        doc.text(platformName, 25, yPos);
        yPos += 8;

        const kpiData = kpis.map(kpi => [kpi.kpi, kpi.result.toLocaleString()]);

        autoTable(doc, {
          startY: yPos,
          body: kpiData,
          theme: 'plain',
          styles: { fontSize: 9 },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 80 },
            1: { cellWidth: 60 }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      });

      yPos += 5;
    }
  }

  // Platforms & Markets
  doc.setFontSize(14);
  doc.text('Platform Allocation', 20, yPos);
  yPos += 10;

  const platformData: any[] = [];
  (data.platforms ?? []).forEach((platform: any) => {
    const markets = Array.isArray(platform.markets) ? platform.markets : [];
    platformData.push([
      platform.name ?? platform.id ?? 'Unknown',
      `${platform.budgetPercentage ?? 0}%`,
      `$${(data.totalBudget * (platform.budgetPercentage ?? 0) / 100).toLocaleString()}`,
      markets.map((m: any) => m?.name ?? m?.id ?? '').filter(Boolean).join(', ')
    ]);
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Platform', 'Budget %', 'Budget ($)', 'Markets']],
    body: platformData,
    theme: 'grid',
    headStyles: { fillColor: accentColor },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // Platform and Market Forecasts
  if (data.actiplanForecasts) {
    data.actiplanForecasts.platforms.forEach((platform) => {
      if (yPos > 230) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.text(`${platform.platformName} Deliverables`, 20, yPos);
      yPos += 10;

      // Platform-level metrics
      const platformMetrics = [
        ['Budget', `$${platform.totalBudget.toLocaleString()}`],
        ['Audience Size', platform.totalAudienceSize.toLocaleString()],
        ['Impressions', platform.totalImpressions.toLocaleString()],
        ['Reach', platform.totalReach.toLocaleString()],
        ['CPM', `$${platform.avgCPM.toFixed(2)}`],
        ['Frequency', platform.frequency.toFixed(2)],
        ['SOV', `${platform.sov.toFixed(1)}%`],
      ];

      autoTable(doc, {
        startY: yPos,
        body: platformMetrics,
        theme: 'plain',
        styles: { fontSize: 10 },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 60 },
          1: { cellWidth: 80 }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 12;

      // Markets under platform
      platform.markets.forEach((market) => {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(12);
        doc.text(`Market: ${market.marketName}`, 25, yPos);
        yPos += 8;

        // Market-level metrics
        const marketMetrics = [
          ['Budget', `$${market.budget.toLocaleString()}`],
          ['Audience Size', market.audienceSize.toLocaleString()],
          ['Impressions', market.impressions.toLocaleString()],
          ['Reach', market.reach.toLocaleString()],
          ['CPM', `$${market.cpm.toFixed(2)}`],
          ['Frequency', market.frequency.toFixed(2)],
          ['SOV', `${market.sov.toFixed(1)}%`],
        ];

        autoTable(doc, {
          startY: yPos,
          body: marketMetrics,
          theme: 'plain',
          styles: { fontSize: 9 },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 50 },
            1: { cellWidth: 70 }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 8;

        // Market KPI Results
        if (market.resultsByGoal.length > 0) {
          const kpiData = market.resultsByGoal.map(r => [
            r.kpi,
            r.result.toLocaleString(),
            `$${r.costPerResult.toFixed(2)}`,
            `${r.resultRate.toFixed(2)}%`
          ]);

          autoTable(doc, {
            startY: yPos,
            head: [['KPI', 'Result', 'Cost/Result', 'Rate']],
            body: kpiData,
            theme: 'grid',
            headStyles: { fillColor: accentColor, fontSize: 9 },
            styles: { fontSize: 8 },
          });

          yPos = (doc as any).lastAutoTable.finalY + 8;
        }

        // Phase-level details
        if (market.phases.length > 0) {
          const phaseData = market.phases.map(p => [
            p.phaseName,
            p.kpi,
            `${format(new Date(p.startDate), 'MMM d')} - ${format(new Date(p.endDate), 'MMM d')}`,
            `$${p.budget.toLocaleString()}`,
            p.result.toLocaleString(),
            `$${p.costPerResult.toFixed(2)}`
          ]);

          autoTable(doc, {
            startY: yPos,
            head: [['Phase', 'KPI', 'Dates', 'Budget', 'Result', 'Cost/Result']],
            body: phaseData,
            theme: 'striped',
            headStyles: { fillColor: accentColor, fontSize: 9 },
            styles: { fontSize: 8 },
          });

          yPos = (doc as any).lastAutoTable.finalY + 12;
        }
      });
    });
  }

  // Keyword Strategy Section
  if (data.selectedKeywords && data.selectedKeywords.length > 0) {
    const strategies = ['brand', 'generic', 'competition'] as const;
    const positiveKeywords = data.selectedKeywords.filter(k => !k.isNegative);
    const strategyData = strategies.map(strategy => {
      const kws = positiveKeywords.filter(k => k.strategy === strategy);
      const negatives = data.selectedKeywords!.filter(k => k.strategy === strategy && k.isNegative);
      const totalVol = kws.reduce((s, k) => s + (k.avgMonthlySearches || 0), 0);
      const avgCpcLow = kws.length > 0 ? kws.reduce((s, k) => s + (k.cpcLow || 0), 0) / kws.length : 0;
      const avgCpcHigh = kws.length > 0 ? kws.reduce((s, k) => s + (k.cpcHigh || 0), 0) / kws.length : 0;
      const avgCpc = (avgCpcLow + avgCpcHigh) / 2;
      const estimatedClicks = avgCpc > 0 ? Math.round(totalVol * 0.03) : 0;
      return { strategy, kws, negatives, totalVol, avgCpcLow, avgCpcHigh, avgCpc, estimatedClicks };
    }).filter(s => s.kws.length > 0);

    if (strategyData.length > 0) {
      const totalStrategyVol = strategyData.reduce((s, d) => s + d.totalVol, 0);

      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.text('Keyword Strategy Breakdown', 20, yPos);
      yPos += 10;

      const kwTableData = strategyData.map(d => {
        const budgetPct = totalStrategyVol > 0
          ? Math.round((d.totalVol / totalStrategyVol) * 100)
          : Math.round(100 / strategyData.length);
        return [
          d.strategy.charAt(0).toUpperCase() + d.strategy.slice(1),
          String(d.kws.length),
          `${budgetPct}%`,
          d.totalVol.toLocaleString(),
          d.avgCpc > 0 ? `$${d.avgCpc.toFixed(2)}` : '—',
          d.estimatedClicks > 0 ? d.estimatedClicks.toLocaleString() : '—',
          String(d.negatives.length || '—'),
        ];
      });

      // Add totals row
      kwTableData.push([
        'Total',
        String(strategyData.reduce((s, d) => s + d.kws.length, 0)),
        '100%',
        strategyData.reduce((s, d) => s + d.totalVol, 0).toLocaleString(),
        (() => {
          const allKws = strategyData.flatMap(d => d.kws);
          const avg = allKws.length > 0 ? allKws.reduce((s, k) => s + ((k.cpcLow || 0) + (k.cpcHigh || 0)) / 2, 0) / allKws.length : 0;
          return avg > 0 ? `$${avg.toFixed(2)}` : '—';
        })(),
        strategyData.reduce((s, d) => s + d.estimatedClicks, 0).toLocaleString(),
        String(strategyData.reduce((s, d) => s + d.negatives.length, 0) || '—'),
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Strategy', 'Keywords', 'Budget %', 'Monthly Searches', 'Avg. CPC', 'Est. Clicks', 'Negatives']],
        body: kwTableData,
        theme: 'grid',
        headStyles: { fillColor: accentColor, fontSize: 9 },
        styles: { fontSize: 8 },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Keyword lists by strategy
      strategyData.forEach(d => {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(11);
        doc.text(`${d.strategy.charAt(0).toUpperCase() + d.strategy.slice(1)} Keywords (${d.kws.length})`, 25, yPos);
        yPos += 7;

        const kwListData = d.kws.map(k => [
          k.name,
          k.platform,
          k.matchType || 'broad',
          (k.avgMonthlySearches || 0).toLocaleString(),
          k.cpcLow && k.cpcHigh ? `$${k.cpcLow.toFixed(2)} – $${k.cpcHigh.toFixed(2)}` : '—',
          k.competition || '—',
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Keyword', 'Platform', 'Match Type', 'Monthly Vol.', 'CPC Range', 'Competition']],
          body: kwListData,
          theme: 'striped',
          headStyles: { fillColor: accentColor, fontSize: 8 },
          styles: { fontSize: 7 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;

        // Negative keywords for this strategy
        if (d.negatives.length > 0) {
          if (yPos > 260) {
            doc.addPage();
            yPos = 20;
          }
          doc.setFontSize(10);
          doc.text(`Negative Keywords (${d.negatives.length})`, 30, yPos);
          yPos += 6;

          const negData = d.negatives.map(k => [k.name, k.platform, k.matchType || 'broad']);
          autoTable(doc, {
            startY: yPos,
            head: [['Keyword', 'Platform', 'Match Type']],
            body: negData,
            theme: 'plain',
            headStyles: { fillColor: [200, 100, 100], fontSize: 8 },
            styles: { fontSize: 7 },
          });
          yPos = (doc as any).lastAutoTable.finalY + 10;
        }
      });
    }
  }

  // Add footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `Generated on ${format(new Date(), 'MMM d, yyyy HH:mm')} | Page ${i} of ${pageCount}`,
      105,
      285,
      { align: 'center' }
    );
  }

  return doc.output('blob');
}

export async function downloadMediaPlanPDF(data: MediaPlanData): Promise<void> {
  const blob = await generateMediaPlanPDF(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `media-plan-${data.name.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
