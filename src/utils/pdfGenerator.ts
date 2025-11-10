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

  // Overview Scorecards
  if (data.forecasts) {
    doc.setFontSize(14);
    doc.text('Performance Overview', 20, yPos);
    yPos += 10;

    const overviewData = [
      ['Metric', 'Value'],
      ['Total Reach', data.forecasts.totalReach?.toLocaleString() || 'N/A'],
      ['Audience Size', data.forecasts.audienceSize?.toLocaleString() || 'N/A'],
      ['SOV (Share of Voice)', `${data.forecasts.sov?.toFixed(2)}%` || 'N/A'],
      ['CPM', `$${data.forecasts.cpm?.toFixed(2)}` || 'N/A'],
      ['Total Impressions', data.forecasts.totalImpressions?.toLocaleString() || 'N/A'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [overviewData[0]],
      body: overviewData.slice(1),
      theme: 'grid',
      headStyles: { fillColor: [66, 139, 202] },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
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

  // Campaign Forecast Details
  if (data.forecasts && data.forecasts.campaigns) {
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.text('Campaign Forecasts', 20, yPos);
    yPos += 10;

    const campaignData: any[] = [];
    data.forecasts.campaigns.forEach((campaign: any) => {
      campaignData.push([
        campaign.name || campaign.market,
        campaign.objective || 'N/A',
        `$${campaign.budget?.toLocaleString() || '0'}`,
        campaign.impressions?.toLocaleString() || 'N/A',
        campaign.reach?.toLocaleString() || 'N/A',
        `$${campaign.cpm?.toFixed(2) || '0'}`,
        campaign.result?.toLocaleString() || 'N/A',
        `$${campaign.costPerResult?.toFixed(2) || '0'}`,
      ]);
    });

    autoTable(doc, {
      startY: yPos,
      head: [['Campaign', 'Objective', 'Budget', 'Impressions', 'Reach', 'CPM', 'Result', 'Cost/Result']],
      body: campaignData,
      theme: 'grid',
      headStyles: { fillColor: [66, 139, 202] },
      styles: { fontSize: 8 },
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
