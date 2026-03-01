/**
 * Export a chart element as a PNG image
 * @param elementId - The ID of the chart container element
 * @param filename - The desired filename for the exported image
 */
export const exportChartAsImage = async (
  elementId: string,
  filename: string = 'chart'
): Promise<void> => {
  try {
    const element = document.getElementById(elementId);

    if (!element) {
      console.error(`Element with ID "${elementId}" not found`);
      return;
    }

    // Dynamically import html2canvas only when needed (~500KB savings on initial load)
    const { default: html2canvas } = await import('html2canvas');

    // Generate canvas from the element
    const canvas = await html2canvas(element, {
      backgroundColor: '#1c1e26', // Match the chart background
      scale: 2, // Higher quality
      logging: false,
      useCORS: true,
    });

    // Convert canvas to blob and download
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  } catch (error) {
    console.error('Error exporting chart:', error);
  }
};
