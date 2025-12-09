import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { downloadCSV } from "@/utils/downloadUtils";
import { cn } from "@/lib/utils";

interface Column {
  key: string;
  label: string;
  format?: (value: any) => string;
}

interface ChartDataTableProps {
  data: any[];
  columns: Column[];
  filename: string;
  defaultExpanded?: boolean;
}

export default function ChartDataTable({ 
  data, 
  columns, 
  filename,
  defaultExpanded = false 
}: ChartDataTableProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const formatValue = (value: any, column: Column) => {
    if (column.format) return column.format(value);
    if (typeof value === 'number') {
      if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
      return value.toFixed(2);
    }
    return String(value ?? '-');
  };

  const handleDownload = () => {
    downloadCSV(data, filename, columns.map(c => ({ key: c.key, label: c.label })));
  };

  return (
    <div className="mt-2 border-t pt-2">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Hide Data
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Show Data
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <Download className="h-3 w-3 mr-1" />
          Download CSV
        </Button>
      </div>
      
      {expanded && (
        <div className="max-h-48 overflow-auto mt-2">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map(col => (
                  <TableHead key={col.key} className="text-xs py-1 px-2 whitespace-nowrap">
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, idx) => (
                <TableRow key={idx}>
                  {columns.map(col => (
                    <TableCell key={col.key} className="text-xs py-1 px-2 whitespace-nowrap">
                      {formatValue(row[col.key], col)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
