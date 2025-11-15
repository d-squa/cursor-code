import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type { MediaPlanData } from './pdfGenerator';

export function generateMediaPlanExcel(data: MediaPlanData): Blob {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Actiplan Deliverables Overview
  if (data.actiplanForecasts && Object.keys(data.actiplanForecasts).length > 0) {
    const platforms = Object.values(data.actiplanForecasts);
    const totalAudienceSize = platforms.reduce((sum, p) => sum + p.totalAudienceSize, 0);
    const totalImpressions = platforms.reduce((sum, p) => sum + p.totalImpressions, 0);
    const totalReach = platforms.reduce((sum, p) => sum + p.totalReach, 0);
    const avgCPM = totalImpressions > 0 ? (data.totalBudget / (totalImpressions / 1000)) : 0;
    const frequency = totalReach > 0 ? totalImpressions / totalReach : 0;
    const sov = totalAudienceSize > 0 ? (totalReach / totalAudienceSize) * 100 : 0;

    const overviewData = [
      ['Actiplan Deliverables', ''],
      ['Plan Name', data.name],
      ['Total Budget', `$${data.totalBudget.toLocaleString()}`],
      ['Duration', `${format(new Date(data.startDate), 'MMM d, yyyy')} - ${format(new Date(data.endDate), 'MMM d, yyyy')}`],
      ['Strategy', data.genericConfig.strategyFocus || 'Custom'],
      ['', ''],
      ['Total Audience Size', totalAudienceSize],
      ['Total Impressions', totalImpressions],
      ['Total Reach', totalReach],
      ['Avg. CPM', avgCPM],
      ['Frequency', frequency],
      ['SOV', `${sov.toFixed(1)}%`],
    ];

    // Add market deliverables
    platforms.forEach((platform) => {
      Object.entries(platform.marketDeliverables).forEach(([marketName, kpis]) => {
        overviewData.push(['', '']);
        overviewData.push([`${marketName} Deliverables`, '']);
        kpis.forEach((kpi) => {
          overviewData.push([kpi.kpi, kpi.result]);
        });
      });
    });

    const ws1 = XLSX.utils.aoa_to_sheet(overviewData);
    ws1['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, ws1, 'Actiplan Overview');
  }

  // Sheet 2: Market Forecasts
  if (data.actiplanForecasts && Object.keys(data.actiplanForecasts).length > 0) {
    const marketData: any[][] = [
      ['Platform', 'Market', 'Budget', 'Audience Size', 'Impressions', 'Reach', 'CPM', 'Frequency', 'SOV']
    ];

    Object.entries(data.actiplanForecasts).forEach(([platformId, actiplan]) => {
      const platformName = data.platforms.find(p => p.id === platformId)?.name || platformId;
      
      actiplan.markets.forEach((market) => {
        marketData.push([
          platformName,
          market.marketName,
          market.budget,
          market.audienceSize,
          market.impressions,
          market.reach,
          market.cpm,
          market.frequency,
          `${market.sov.toFixed(1)}%`
        ]);
      });
    });

    const ws2 = XLSX.utils.aoa_to_sheet(marketData);
    ws2['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, 
      { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(workbook, ws2, 'Market Forecasts');
  }

  // Sheet 3: Market KPI Results
  if (data.actiplanForecasts && Object.keys(data.actiplanForecasts).length > 0) {
    const kpiData: any[][] = [
      ['Platform', 'Market', 'KPI', 'Result', 'Cost per Result', 'Result Rate']
    ];

    Object.entries(data.actiplanForecasts).forEach(([platformId, actiplan]) => {
      const platformName = data.platforms.find(p => p.id === platformId)?.name || platformId;
      
      actiplan.markets.forEach((market) => {
        market.resultsByGoal.forEach((result) => {
          kpiData.push([
            platformName,
            market.marketName,
            result.kpi,
            result.result,
            result.costPerResult,
            `${result.resultRate.toFixed(2)}%`
          ]);
        });
      });
    });

    const ws3 = XLSX.utils.aoa_to_sheet(kpiData);
    ws3['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 20 }, 
      { wch: 15 }, { wch: 15 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(workbook, ws3, 'KPI Results');
  }

  // Sheet 4: Phase Details
  if (data.actiplanForecasts && Object.keys(data.actiplanForecasts).length > 0) {
    const phaseData: any[][] = [
      ['Platform', 'Market', 'Phase', 'KPI', 'Start Date', 'End Date', 'Budget', 'Result', 'Cost per Result']
    ];

    Object.entries(data.actiplanForecasts).forEach(([platformId, actiplan]) => {
      const platformName = data.platforms.find(p => p.id === platformId)?.name || platformId;
      
      actiplan.markets.forEach((market) => {
        market.phases.forEach((phase) => {
          phaseData.push([
            platformName,
            market.marketName,
            phase.phaseName,
            phase.kpi,
            format(new Date(phase.startDate), 'MMM d, yyyy'),
            format(new Date(phase.endDate), 'MMM d, yyyy'),
            phase.budget,
            phase.result,
            phase.costPerResult
          ]);
        });
      });
    });

    const ws4 = XLSX.utils.aoa_to_sheet(phaseData);
    ws4['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, 
      { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(workbook, ws4, 'Phase Details');
  }

  // Sheet 5: Platform Allocation
  const platformData: any[][] = [
    ['Platform', 'Budget %', 'Budget ($)', 'Markets']
  ];

  data.platforms.forEach((platform: any) => {
    platformData.push([
      platform.name,
      `${platform.budgetPercentage}%`,
      data.totalBudget * platform.budgetPercentage / 100,
      platform.markets.map((m: any) => m.name).join(', ')
    ]);
  });

  const ws5 = XLSX.utils.aoa_to_sheet(platformData);
  ws5['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(workbook, ws5, 'Platform Allocation');

  // Generate Excel file
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadMediaPlanExcel(data: MediaPlanData): void {
  const blob = generateMediaPlanExcel(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `media-plan-${data.name.replace(/\s+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
