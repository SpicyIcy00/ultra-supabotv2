import { useState, useEffect } from 'react';

interface ChartDimensions {
  chartHeight: number;
  margin: { top: number; right: number; bottom: number; left: number };
  pieMargin: { top: number; right: number; bottom: number; left: number };
  fontSize: { axis: number; label: number };
  outerRadius: number;
  innerRadius: number;
  showPieLabels: boolean;
  isMobile: boolean;
}

export function useChartDimensions(): ChartDimensions {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mobile: < 640px
  if (width < 640) {
    return {
      chartHeight: 220,
      margin: { top: 5, right: 10, bottom: 5, left: 5 },
      pieMargin: { top: 10, right: 10, bottom: 10, left: 10 },
      fontSize: { axis: 9, label: 9 },
      outerRadius: 70,
      innerRadius: 30,
      showPieLabels: false,
      isMobile: true,
    };
  }

  // Tablet: 640-1023px
  if (width < 1024) {
    return {
      chartHeight: 280,
      margin: { top: 10, right: 20, bottom: 10, left: 10 },
      pieMargin: { top: 20, right: 60, bottom: 20, left: 60 },
      fontSize: { axis: 10, label: 10 },
      outerRadius: 85,
      innerRadius: 35,
      showPieLabels: true,
      isMobile: false,
    };
  }

  // Desktop: >= 1024px (unchanged from current values)
  return {
    chartHeight: 370,
    margin: { top: 25, right: 40, bottom: 5, left: 5 },
    pieMargin: { top: 40, right: 120, bottom: 40, left: 120 },
    fontSize: { axis: 12, label: 11 },
    outerRadius: 100,
    innerRadius: 40,
    showPieLabels: true,
    isMobile: false,
  };
}
