export const exportToCSV = (data: any[], filename: string = 'data'): void => {
  try {
    if (!data || data.length === 0) {
      console.error('No data to export');
      return;
    }

    // Get headers from the first object
    const headers = Object.keys(data[0]);

    // Create CSV content
    const csvContent = [
      // Header row
      headers.join(','),
      // Data rows
      ...data.map(row =>
        headers.map(header => {
          const value = row[header];
          // Handle values that might contain commas
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting CSV:', error);
  }
};
