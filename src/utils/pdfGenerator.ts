import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

export interface MediaPlanData {
  name: string;
  totalBudget: number;
  startDate: string;
  endDate: string;
  platforms: any[];
  genericConfig: any;
  forecasts?: any;
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

export function generateMediaPlanPDF(data: MediaPlanData): Blob {
  const doc = new jsPDF();
  let yPos = 20;

  // Title
  doc.setFontSize(20);
  doc.text('Media Plan', 105, yPos, { align: 'center' });
  yPos += 15;

  // Plan Details
  doc.setFontSize(12);
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
      headStyles: { fillColor: [66, 139, 202] },
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
  data.platforms.forEach((platform: any) => {
    platformData.push([
      platform.name,
      `${platform.budgetPercentage}%`,
      `$${(data.totalBudget * platform.budgetPercentage / 100).toLocaleString()}`,
      platform.markets.map((m: any) => m.name).join(', ')
    ]);
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Platform', 'Budget %', 'Budget ($)', 'Markets']],
    body: platformData,
    theme: 'grid',
    headStyles: { fillColor: [66, 139, 202] },
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
            headStyles: { fillColor: [100, 180, 100], fontSize: 9 },
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
            headStyles: { fillColor: [66, 139, 202], fontSize: 9 },
            styles: { fontSize: 8 },
          });

          yPos = (doc as any).lastAutoTable.finalY + 12;
        }
      });
    });
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

export function downloadMediaPlanPDF(data: MediaPlanData): void {
  const blob = generateMediaPlanPDF(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `media-plan-${data.name.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
