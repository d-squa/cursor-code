import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type { MediaPlanData } from './pdfGenerator';

type ActiplanForecasts = NonNullable<MediaPlanData['actiplanForecasts']>;

/** Normalize saved forecast JSON so export never hits undefined .map/.forEach. */
function normalizeActiplanForExport(raw: unknown): ActiplanForecasts | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const a = raw as Record<string, unknown>;
  const hasForecastShape =
    a.totalBudget != null ||
    a.platformDeliverables != null ||
    a.marketDeliverables != null ||
    Array.isArray(a.platforms);

  if (!hasForecastShape) return undefined;

  const platformDeliverables =
    (a.platformDeliverables as ActiplanForecasts['platformDeliverables']) ??
    (a.marketDeliverables as ActiplanForecasts['platformDeliverables']) ??
    {};

  const platforms = (Array.isArray(a.platforms) ? a.platforms : []).map((item) => {
    const p = item as Record<string, unknown>;
    const markets = (Array.isArray(p.markets) ? p.markets : []).map((m) => {
      const market = m as Record<string, unknown>;
      return {
        ...market,
        resultsByGoal: Array.isArray(market.resultsByGoal) ? market.resultsByGoal : [],
        phases: Array.isArray(market.phases) ? market.phases : [],
      };
    });
    return { ...p, markets };
  });

  return {
    totalBudget: Number(a.totalBudget ?? 0),
    totalAudienceSize: Number(a.totalAudienceSize ?? 0),
    totalImpressions: Number(a.totalImpressions ?? 0),
    totalReach: Number(a.totalReach ?? 0),
    avgCPM: Number(a.avgCPM ?? 0),
    frequency: Number(a.frequency ?? 0),
    sov: Number(a.sov ?? 0),
    platformDeliverables,
    platforms,
  } as ActiplanForecasts;
}

/** Build export payload from a saved campaign row (ActiPlans list, etc.). */
export function buildMediaPlanDataFromCampaign(campaign: {
  name: string;
  total_budget?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  platforms?: unknown[] | null;
  generic_config?: Record<string, unknown> | null;
  forecast_data?: Record<string, unknown> | null;
}): MediaPlanData {
  const forecastData = (campaign.forecast_data ?? {}) as Record<string, unknown>;
  const genericConfig = (campaign.generic_config ?? {}) as Record<string, unknown>;
  const actiplan = normalizeActiplanForExport(
    forecastData.actiplanForecast ?? forecastData.actiplanForecasts,
  );

  const platforms = (Array.isArray(campaign.platforms) ? campaign.platforms : []).map((raw) => {
    const p = raw as Record<string, unknown>;
    return {
      ...p,
      name: (p.name as string) ?? (p.id as string) ?? 'Unknown',
      budgetPercentage: (p.budgetPercentage as number) ?? (p.budget_percentage as number) ?? 0,
      markets: Array.isArray(p.markets) ? p.markets : [],
    };
  });

  const selectedKeywords =
    (genericConfig.selectedKeywords as MediaPlanData['selectedKeywords']) ??
    ((genericConfig.basicTargeting as Record<string, unknown> | undefined)?.selectedKeywords as
      | MediaPlanData['selectedKeywords']
      | undefined) ??
    (forecastData.selectedKeywords as MediaPlanData['selectedKeywords']) ??
    [];

  return {
    name: campaign.name,
    totalBudget: campaign.total_budget ?? 0,
    startDate: campaign.start_date ?? new Date().toISOString(),
    endDate: campaign.end_date ?? new Date().toISOString(),
    platforms,
    genericConfig,
    forecasts: forecastData,
    actiplanForecasts: actiplan,
    selectedKeywords,
  };
}

export function generateMediaPlanExcel(data: MediaPlanData): Blob {
  const workbook = XLSX.utils.book_new();
  const genericConfig = data.genericConfig ?? {};
  const platforms = data.platforms ?? [];
  const actiplanForecasts = data.actiplanForecasts
    ? normalizeActiplanForExport(data.actiplanForecasts)
    : undefined;

  // Sheet 1: Actiplan Deliverables Overview
  if (actiplanForecasts) {
    const actiplan = actiplanForecasts;

    const overviewData = [
      ['Actiplan Deliverables', ''],
      ['Plan Name', data.name],
      ['Total Budget', `$${(actiplan.totalBudget ?? 0).toLocaleString()}`],
      ['Duration', `${format(new Date(data.startDate), 'MMM d, yyyy')} - ${format(new Date(data.endDate), 'MMM d, yyyy')}`],
      ['Strategy', (genericConfig.strategyFocus as string) || 'Custom'],
      ['', ''],
      ['Total Audience Size', actiplan.totalAudienceSize],
      ['Total Impressions', actiplan.totalImpressions],
      ['Total Reach', actiplan.totalReach],
      ['Avg. CPM', actiplan.avgCPM],
      ['Frequency', actiplan.frequency],
      ['SOV', `${(actiplan.sov ?? 0).toFixed(1)}%`],
    ];

    // Add platform deliverables
    Object.entries(actiplan.platformDeliverables ?? {}).forEach(([platformName, kpis]) => {
      overviewData.push(['', '']);
      overviewData.push([`${platformName} Deliverables`, '']);
      (kpis ?? []).forEach((kpi) => {
        overviewData.push([kpi.kpi, kpi.result]);
      });
    });

    const ws1 = XLSX.utils.aoa_to_sheet(overviewData);
    ws1['!cols'] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, ws1, 'Actiplan Overview');
  }

  // Sheet 2: Platform Forecasts
  if (actiplanForecasts) {
    const platformData: any[][] = [
      ['Platform', 'Budget', 'Audience Size', 'Impressions', 'Reach', 'CPM', 'Frequency', 'SOV']
    ];

    (actiplanForecasts.platforms ?? []).forEach((platform) => {
      platformData.push([
        platform.platformName,
        platform.totalBudget,
        platform.totalAudienceSize,
        platform.totalImpressions,
        platform.totalReach,
        platform.avgCPM,
        platform.frequency,
        `${(platform.sov ?? 0).toFixed(1)}%`
      ]);
    });

    const ws2 = XLSX.utils.aoa_to_sheet(platformData);
    ws2['!cols'] = [
      { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, 
      { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(workbook, ws2, 'Platform Forecasts');
  }

  // Sheet 3: Market Forecasts
  if (actiplanForecasts) {
    const marketData: any[][] = [
      ['Platform', 'Market', 'Budget', 'Audience Size', 'Impressions', 'Reach', 'CPM', 'Frequency', 'SOV']
    ];

    (actiplanForecasts.platforms ?? []).forEach((platform) => {
      (platform.markets ?? []).forEach((market) => {
        marketData.push([
          platform.platformName,
          market.marketName,
          market.budget,
          market.audienceSize,
          market.impressions,
          market.reach,
          market.cpm,
          market.frequency,
          `${(market.sov ?? 0).toFixed(1)}%`
        ]);
      });
    });

    const ws3 = XLSX.utils.aoa_to_sheet(marketData);
    ws3['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, 
      { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(workbook, ws3, 'Market Forecasts');
  }

  // Sheet 4: Market KPI Results
  if (actiplanForecasts) {
    const kpiData: any[][] = [
      ['Platform', 'Market', 'KPI', 'Result', 'Cost per Result', 'Result Rate']
    ];

    (actiplanForecasts.platforms ?? []).forEach((platform) => {
      (platform.markets ?? []).forEach((market) => {
        (market.resultsByGoal ?? []).forEach((result) => {
          kpiData.push([
            platform.platformName,
            market.marketName,
            result.kpi,
            result.result,
            result.costPerResult,
            `${(result.resultRate ?? 0).toFixed(2)}%`
          ]);
        });
      });
    });

    const ws4 = XLSX.utils.aoa_to_sheet(kpiData);
    ws4['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 20 }, 
      { wch: 15 }, { wch: 15 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(workbook, ws4, 'KPI Results');
  }

  // Sheet 5: Phase Details
  if (actiplanForecasts) {
    const phaseData: any[][] = [
      ['Platform', 'Market', 'Phase', 'KPI', 'Start Date', 'End Date', 'Budget', 'Result', 'Cost per Result']
    ];

    (actiplanForecasts.platforms ?? []).forEach((platform) => {
      (platform.markets ?? []).forEach((market) => {
        (market.phases ?? []).forEach((phase) => {
          phaseData.push([
            platform.platformName,
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

    const ws5 = XLSX.utils.aoa_to_sheet(phaseData);
    ws5['!cols'] = [
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, 
      { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(workbook, ws5, 'Phase Details');
  }

  // Sheet 6: Platform Allocation
  const platformData: any[][] = [
    ['Platform', 'Budget %', 'Budget ($)', 'Markets']
  ];

  platforms.forEach((platform: any) => {
    const markets = Array.isArray(platform.markets) ? platform.markets : [];
    platformData.push([
      platform.name ?? platform.id ?? 'Unknown',
      `${platform.budgetPercentage ?? 0}%`,
      (data.totalBudget * (platform.budgetPercentage ?? 0)) / 100,
      markets.map((m: any) => m?.name ?? m?.id ?? '').filter(Boolean).join(', ')
    ]);
  });

  const ws6 = XLSX.utils.aoa_to_sheet(platformData);
  ws6['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(workbook, ws6, 'Platform Allocation');

  // Sheet 7: Keyword Strategy Summary
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

      const summaryData: any[][] = [
        ['Keyword Strategy Summary', '', '', '', '', '', '', ''],
        ['Strategy', 'Keywords', 'Budget %', 'Avg. Monthly Searches', 'CPC Low', 'CPC High', 'Avg. CPC', 'Est. Clicks', 'Negatives']
      ];

      strategyData.forEach(d => {
        const budgetPct = totalStrategyVol > 0
          ? Math.round((d.totalVol / totalStrategyVol) * 100)
          : Math.round(100 / strategyData.length);
        summaryData.push([
          d.strategy.charAt(0).toUpperCase() + d.strategy.slice(1),
          d.kws.length,
          `${budgetPct}%`,
          d.totalVol,
          d.avgCpcLow > 0 ? d.avgCpcLow : '',
          d.avgCpcHigh > 0 ? d.avgCpcHigh : '',
          d.avgCpc > 0 ? d.avgCpc : '',
          d.estimatedClicks > 0 ? d.estimatedClicks : '',
          d.negatives.length || '',
        ]);
      });

      // Totals row
      summaryData.push([
        'Total',
        strategyData.reduce((s, d) => s + d.kws.length, 0),
        '100%',
        strategyData.reduce((s, d) => s + d.totalVol, 0),
        '',
        '',
        (() => {
          const allKws = strategyData.flatMap(d => d.kws);
          return allKws.length > 0 ? allKws.reduce((s, k) => s + ((k.cpcLow || 0) + (k.cpcHigh || 0)) / 2, 0) / allKws.length : '';
        })(),
        strategyData.reduce((s, d) => s + d.estimatedClicks, 0),
        strategyData.reduce((s, d) => s + d.negatives.length, 0) || '',
      ]);

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [
        { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 20 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }
      ];
      XLSX.utils.book_append_sheet(workbook, wsSummary, 'Keyword Strategies');
    }

    // Sheet 8: Keyword Lists (full detail, grouped by strategy)
    const kwListData: any[][] = [
      ['Strategy', 'Keyword', 'Platform', 'Match Type', 'Negative?', 'Avg. Monthly Searches', 'Competition', 'CPC Low', 'CPC High']
    ];

    // Sort: group by strategy, positives first
    const sortedKeywords = [...data.selectedKeywords].sort((a, b) => {
      const stratOrder = { brand: 0, generic: 1, competition: 2 };
      const aOrder = stratOrder[a.strategy || 'generic'] || 1;
      const bOrder = stratOrder[b.strategy || 'generic'] || 1;
      if (aOrder !== bOrder) return aOrder - bOrder;
      if (a.isNegative !== b.isNegative) return a.isNegative ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    sortedKeywords.forEach(kw => {
      kwListData.push([
        (kw.strategy || 'generic').charAt(0).toUpperCase() + (kw.strategy || 'generic').slice(1),
        kw.name,
        kw.platform,
        kw.matchType || 'broad',
        kw.isNegative ? 'Yes' : 'No',
        kw.avgMonthlySearches || '',
        kw.competition || '',
        kw.cpcLow || '',
        kw.cpcHigh || '',
      ]);
    });

    const wsKeywords = XLSX.utils.aoa_to_sheet(kwListData);
    wsKeywords['!cols'] = [
      { wch: 14 }, { wch: 35 }, { wch: 10 }, { wch: 12 },
      { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 10 }
    ];
    XLSX.utils.book_append_sheet(workbook, wsKeywords, 'Keyword Lists');
  }

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
