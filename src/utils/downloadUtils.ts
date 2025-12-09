// Utility functions for downloading chart data as CSV

export function downloadCSV(data: any[], filename: string, columns?: { key: string; label: string }[]) {
  if (!data || data.length === 0) return;

  // Determine columns from first row if not provided
  const cols = columns || Object.keys(data[0]).map(key => ({ key, label: formatColumnLabel(key) }));
  
  // Create header row
  const header = cols.map(c => `"${c.label}"`).join(',');
  
  // Create data rows
  const rows = data.map(row => 
    cols.map(c => {
      const value = row[c.key];
      if (typeof value === 'number') {
        return value.toFixed(2);
      }
      return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }).join(',')
  );
  
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatColumnLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

export function formatNumber(num: number, decimals = 2): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(decimals)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(decimals)}K`;
  return num.toFixed(decimals);
}
