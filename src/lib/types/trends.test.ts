import { describe, it, expect, beforeEach } from 'vitest';
import {
  TrendDirection,
  TrendGranularity,
  type TrendData,
  type TrendConfig,
  type TrendAnalysis,
  calculateTrend,
  analyzeTrends,
  formatTrendValue,
  getTrendDirectionLabel,
  isSignificantTrend,
  aggregateTrendData,
  DEFAULT_TREND_CONFIG
} from './trends';

describe('Trends Types', () => {
  describe('calculateTrend', () => {
    const mockData: TrendData[] = [
      { timestamp: new Date('2024-01-01'), value: 100, label: 'Jan 1' },
      { timestamp: new Date('2024-01-02'), value: 110, label: 'Jan 2' },
      { timestamp: new Date('2024-01-03'), value: 105, label: 'Jan 3' },
      { timestamp: new Date('2024-01-04'), value: 120, label: 'Jan 4' },
      { timestamp: new Date('2024-01-05'), value: 115, label: 'Jan 5' }
    ];

    it('should calculate upward trend correctly', () => {
      const result = calculateTrend(mockData);
      
      expect(result.direction).toBe(TrendDirection.UP);
      expect(result.percentageChange).toBeGreaterThan(0);
      expect(result.startValue).toBe(100);
      expect(result.endValue).toBe(115);
    });

    it('should calculate downward trend correctly', () => {
      const descendingData: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: 100, label: 'Jan 1' },
        { timestamp: new Date('2024-01-02'), value: 90, label: 'Jan 2' },
        { timestamp: new Date('2024-01-03'), value: 85, label: 'Jan 3' },
        { timestamp: new Date('2024-01-04'), value: 80, label: 'Jan 4' }
      ];

      const result = calculateTrend(descendingData);
      
      expect(result.direction).toBe(TrendDirection.DOWN);
      expect(result.percentageChange).toBeLessThan(0);
    });

    it('should detect stable trend for flat data', () => {
      const flatData: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: 100, label: 'Jan 1' },
        { timestamp: new Date('2024-01-02'), value: 100, label: 'Jan 2' },
        { timestamp: new Date('2024-01-03'), value: 100, label: 'Jan 3' }
      ];

      const result = calculateTrend(flatData);
      
      expect(result.direction).toBe(TrendDirection.STABLE);
      expect(result.percentageChange).toBe(0);
    });

    it('should throw error for empty data array', () => {
      expect(() => calculateTrend([])).toThrow('Trend data cannot be empty');
    });

    it('should throw error for single data point', () => {
      const singlePoint: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: 100, label: 'Jan 1' }
      ];

      expect(() => calculateTrend(singlePoint)).toThrow('At least two data points required for trend calculation');
    });

    it('should handle data with metadata', () => {
      const dataWithMetadata: TrendData[] = [
        { 
          timestamp: new Date('2024-01-01'), 
          value: 100, 
          label: 'Jan 1',
          metadata: { source: 'api', confidence: 0.95 }
        },
        { 
          timestamp: new Date('2024-01-02'), 
          value: 110, 
          label: 'Jan 2',
          metadata: { source: 'api', confidence: 0.92 }
        }
      ];

      const result = calculateTrend(dataWithMetadata);
      
      expect(result.direction).toBe(TrendDirection.UP);
      expect(result.dataPoints).toHaveLength(2);
    });
  });

  describe('analyzeTrends', () => {
    const mockConfig: TrendConfig = {
      granularity: TrendGranularity.DAILY,
      significantChangeThreshold: 5,
      minDataPoints: 3,
      smoothingFactor: 0.3
    };

    const mockData: TrendData[] = [
      { timestamp: new Date('2024-01-01'), value: 100, label: 'Jan 1' },
      { timestamp: new Date('2024-01-02'), value: 110, label: 'Jan 2' },
      { timestamp: new Date('2024-01-03'), value: 105, label: 'Jan 3' },
      { timestamp: new Date('2024-01-04'), value: 120, label: 'Jan 4' },
      { timestamp: new Date('2024-01-05'), value: 115, label: 'Jan 5' }
    ];

    it('should perform comprehensive trend analysis', () => {
      const result = analyzeTrends(mockData, mockConfig);

      expect(result.primaryTrend).toBeDefined();
      expect(result.volatility).toBeGreaterThanOrEqual(0);
      expect(result.seasonality).toBeDefined();
      expect(result.forecast).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should use default config when not provided', () => {
      const result = analyzeTrends(mockData);

      expect(result.primaryTrend).toBeDefined();
      expect(result.config).toEqual(DEFAULT_TREND_CONFIG);
    });

    it('should calculate volatility correctly', () => {
      const result = analyzeTrends(mockData, mockConfig);
      
      // Volatility should be based on standard deviation of changes
      expect(result.volatility).toBeGreaterThan(0);
    });

    it('should generate forecast with specified number of points', () => {
      const result = analyzeTrends(mockData, { ...mockConfig, forecastPoints: 3 });
      
      expect(result.forecast).toHaveLength(3);
      expect(result.forecast![0].timestamp.getTime()).toBeGreaterThan(
        mockData[mockData.length - 1].timestamp.getTime()
      );
    });

    it('should detect seasonality in periodic data', () => {
      // Create data with weekly pattern
      const seasonalData: TrendData[] = [];
      for (let i = 0; i < 28; i++) {
        const dayOfWeek = i % 7;
        // Higher values on weekends
        const baseValue = (dayOfWeek === 0 || dayOfWeek === 6) ? 150 : 100;
        seasonalData.push({
          timestamp: new Date(2024, 0, i + 1),
          value: baseValue + Math.random() * 10,
          label: `Day ${i + 1}`
        });
      }

      const result = analyzeTrends(seasonalData, {
        ...mockConfig,
        granularity: TrendGranularity.DAILY
      });

      expect(result.seasonality.detected).toBe(true);
      expect(result.seasonality.period).toBe(7);
    });

    it('should throw error when data points below minimum', () => {
      const insufficientData: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: 100, label: 'Jan 1' },
        { timestamp: new Date('2024-01-02'), value: 110, label: 'Jan 2' }
      ];

      expect(() => analyzeTrends(insufficientData, mockConfig)).toThrow(
        `Insufficient data points: 2, minimum required: ${mockConfig.minDataPoints}`
      );
    });

    it('should handle invalid config gracefully', () => {
      const invalidConfig = { ...mockConfig, smoothingFactor: 1.5 };

      expect(() => analyzeTrends(mockData, invalidConfig)).toThrow(
        'Smoothing factor must be between 0 and 1'
      );
    });
  });

  describe('formatTrendValue', () => {
    it('should format percentage with default precision', () => {
      expect(formatTrendValue(15.6789, 'percentage')).toBe('+15.68%');
      expect(formatTrendValue(-15.6789, 'percentage')).toBe('-15.68%');
    });

    it('should format number with specified precision', () => {
      expect(formatTrendValue(1234.5678, 'number', 2)).toBe('1,234.57');
      expect(formatTrendValue(-1234.5678, 'number', 2)).toBe('-1,234.57');
    });

    it('should format currency with symbol', () => {
      expect(formatTrendValue(1234.56, 'currency')).toBe('$1,234.56');
      expect(formatTrendValue(-1234.56, 'currency')).toBe('-$1,234.56');
    });

    it('should format duration in human-readable form', () => {
      expect(formatTrendValue(3661, 'duration')).toBe('1h 1m');
      expect(formatTrendValue(86400, 'duration')).toBe('1d');
    });

    it('should handle zero values correctly', () => {
      expect(formatTrendValue(0, 'percentage')).toBe('0.00%');
      expect(formatTrendValue(0, 'number')).toBe('0');
    });

    it('should throw error for unsupported format type', () => {
      expect(() => formatTrendValue(100, 'invalid' as any)).toThrow(
        'Unsupported format type: invalid'
      );
    });

    it('should handle very large numbers', () => {
      expect(formatTrendValue(1000000000, 'number')).toBe('1,000,000,000');
    });

    it('should handle very small numbers', () => {
      expect(formatTrendValue(0.000001, 'number', 6)).toBe('0.000001');
    });
  });

  describe('getTrendDirectionLabel', () => {
    it('should return correct labels for each direction', () => {
      expect(getTrendDirectionLabel(TrendDirection.UP)).toBe('Increasing');
      expect(getTrendDirectionLabel(TrendDirection.DOWN)).toBe('Decreasing');
      expect(getTrendDirectionLabel(TrendDirection.STABLE)).toBe('Stable');
    });

    it('should return custom labels when provided', () => {
      const customLabels = {
        [TrendDirection.UP]: 'Growing',
        [TrendDirection.DOWN]: 'Shrinking',
        [TrendDirection.STABLE]: 'Unchanged'
      };

      expect(getTrendDirectionLabel(TrendDirection.UP, customLabels)).toBe('Growing');
      expect(getTrendDirectionLabel(TrendDirection.DOWN, customLabels)).toBe('Shrinking');
      expect(getTrendDirectionLabel(TrendDirection.STABLE, customLabels)).toBe('Unchanged');
    });

    it('should handle partial custom labels', () => {
      const partialLabels = {
        [TrendDirection.UP]: 'Rising'
      };

      expect(getTrendDirectionLabel(TrendDirection.UP, partialLabels)).toBe('Rising');
      expect(getTrendDirectionLabel(TrendDirection.DOWN, partialLabels)).toBe('Decreasing');
    });
  });

  describe('isSignificantTrend', () => {
    it('should identify significant upward trend', () => {
      const trend: TrendAnalysis = {
        direction: TrendDirection.UP,
        percentageChange: 10,
        absoluteChange: 100,
        startValue: 1000,
        endValue: 1100,
        dataPoints: [],
        volatility: 5
      };

      expect(isSignificantTrend(trend, 5)).toBe(true);
    });

    it('should identify significant downward trend', () => {
      const trend: TrendAnalysis = {
        direction: TrendDirection.DOWN,
        percentageChange: -10,
        absoluteChange: -100,
        startValue: 1000,
        endValue: 900,
        dataPoints: [],
        volatility: 5
      };

      expect(isSignificantTrend(trend, 5)).toBe(true);
    });

    it('should reject insignificant trend', () => {
      const trend: TrendAnalysis = {
        direction: TrendDirection.UP,
        percentageChange: 2,
        absoluteChange: 20,
        startValue: 1000,
        endValue: 1020,
        dataPoints: [],
        volatility: 5
      };

      expect(isSignificantTrend(trend, 5)).toBe(false);
    });

    it('should use default threshold when not specified', () => {
      const trend: TrendAnalysis = {
        direction: TrendDirection.UP,
        percentageChange: 6, // Above default 5%
        absoluteChange: 60,
        startValue: 1000,
        endValue: 1060,
        dataPoints: [],
        volatility: 5
      };

      expect(isSignificantTrend(trend)).toBe(true);
    });

    it('should consider stable trends as not significant', () => {
      const trend: TrendAnalysis = {
        direction: TrendDirection.STABLE,
        percentageChange: 0,
        absoluteChange: 0,
        startValue: 1000,
        endValue: 1000,
        dataPoints: [],
        volatility: 0
      };

      expect(isSignificantTrend(trend, 0)).toBe(false);
    });

    it('should use absolute change when percentage is unreliable', () => {
      const trend: TrendAnalysis = {
        direction: TrendDirection.UP,
        percentageChange: Infinity, // Division by near-zero
        absoluteChange: 100,
        startValue: 0.001,
        endValue: 100.001,
        dataPoints: [],
        volatility: 10
      };

      expect(isSignificantTrend(trend, 50, 50)).toBe(true);
    });
  });

  describe('aggregateTrendData', () => {
    const mockData: TrendData[] = [
      { timestamp: new Date('2024-01-01T08:00:00'), value: 100, label: '08:00' },
      { timestamp: new Date('2024-01-01T08:15:00'), value: 110, label: '08:15' },
      { timestamp: new Date('2024-01-01T08:30:00'), value: 105, label: '08:30' },
      { timestamp: new Date('2024-01-01T09:00:00'), value: 120, label: '09:00' },
      { timestamp: new Date('2024-01-01T09:15:00'), value: 115, label: '09:15' }
    ];

    it('should aggregate by hour correctly', () => {
      const result = aggregateTrendData(mockData, TrendGranularity.HOURLY);

      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('08:00');
      expect(result[0].value).toBe(105); // Average of 100, 110, 105
      expect(result[1].label).toBe('09:00');
      expect(result[1].value).toBe(117.5); // Average of 120, 115
    });

    it('should aggregate by day correctly', () => {
      const multiDayData: TrendData[] = [
        { timestamp: new Date('2024-01-01T10:00:00'), value: 100, label: 'Jan 1 10:00' },
        { timestamp: new Date('2024-01-01T14:00:00'), value: 110, label: 'Jan 1 14:00' },
        { timestamp: new Date('2024-01-02T10:00:00'), value: 120, label: 'Jan 2 10:00' },
        { timestamp: new Date('2024-01-02T14:00:00'), value: 130, label: 'Jan 2 14:00' }
      ];

      const result = aggregateTrendData(multiDayData, TrendGranularity.DAILY);

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(105); // Average of Jan 1
      expect(result[1].value).toBe(125); // Average of Jan 2
    });

    it('should use sum aggregation when specified', () => {
      const result = aggregateTrendData(
        mockData,
        TrendGranularity.HOURLY,
        'sum'
      );

      expect(result[0].value).toBe(315); // Sum of 100, 110, 105
      expect(result[1].value).toBe(235); // Sum of 120, 115
    });

    it('should use max aggregation when specified', () => {
      const result = aggregateTrendData(
        mockData,
        TrendGranularity.HOURLY,
        'max'
      );

      expect(result[0].value).toBe(110);
      expect(result[1].value).toBe(120);
    });

    it('should use min aggregation when specified', () => {
      const result = aggregateTrendData(
        mockData,
        TrendGranularity.HOURLY,
        'min'
      );

      expect(result[0].value).toBe(100);
      expect(result[1].value).toBe(115);
    });

    it('should preserve metadata in aggregation', () => {
      const dataWithMetadata: TrendData[] = [
        { 
          timestamp: new Date('2024-01-01T08:00:00'), 
          value: 100, 
          label: '08:00',
          metadata: { count: 5 }
        },
        { 
          timestamp: new Date('2024-01-01T08:30:00'), 
          value: 110, 
          label: '08:30',
          metadata: { count: 3 }
        }
      ];

      const result = aggregateTrendData(dataWithMetadata, TrendGranularity.HOURLY);

      expect(result[0].metadata).toBeDefined();
      expect(result[0].metadata?.aggregatedCount).toBe(2);
    });

    it('should throw error for empty data', () => {
      expect(() => aggregateTrendData([], TrendGranularity.HOURLY)).toThrow(
        'Cannot aggregate empty data array'
      );
    });

    it('should handle single data point', () => {
      const singlePoint: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: 100, label: 'Jan 1' }
      ];

      const result = aggregateTrendData(singlePoint, TrendGranularity.DAILY);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(100);
    });

    it('should handle weekly granularity', () => {
      const weeklyData: TrendData[] = [];
      for (let i = 0; i < 14; i++) {
        weeklyData.push({
          timestamp: new Date(2024, 0, i + 1),
          value: 100 + i * 10,
          label: `Day ${i + 1}`
        });
      }

      const result = aggregateTrendData(weeklyData, TrendGranularity.WEEKLY);

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle monthly granularity', () => {
      const monthlyData: TrendData[] = [
        { timestamp: new Date('2024-01-15'), value: 100, label: 'Jan' },
        { timestamp: new Date('2024-01-20'), value: 110, label: 'Jan 20' },
        { timestamp: new Date('2024-02-10'), value: 120, label: 'Feb' },
        { timestamp: new Date('2024-02-25'), value: 130, label: 'Feb 25' }
      ];

      const result = aggregateTrendData(monthlyData, TrendGranularity.MONTHLY);

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(105); // January average
      expect(result[1].value).toBe(125); // February average
    });
  });

  describe('DEFAULT_TREND_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_TREND_CONFIG.granularity).toBe(TrendGranularity.DAILY);
      expect(DEFAULT_TREND_CONFIG.significantChangeThreshold).toBe(5);
      expect(DEFAULT_TREND_CONFIG.minDataPoints).toBe(3);
      expect(DEFAULT_TREND_CONFIG.smoothingFactor).toBe(0.3);
      expect(DEFAULT_TREND_CONFIG.forecastPoints).toBe(7);
    });

    it('should have valid smoothing factor range', () => {
      expect(DEFAULT_TREND_CONFIG.smoothingFactor).toBeGreaterThanOrEqual(0);
      expect(DEFAULT_TREND_CONFIG.smoothingFactor).toBeLessThanOrEqual(1);
    });

    it('should have positive minDataPoints', () => {
      expect(DEFAULT_TREND_CONFIG.minDataPoints).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle data with duplicate timestamps', () => {
      const duplicateData: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: 100, label: 'Jan 1' },
        { timestamp: new Date('2024-01-01'), value: 110, label: 'Jan 1 dup' },
        { timestamp: new Date('2024-01-02'), value: 120, label: 'Jan 2' }
      ];

      // Should not throw, but handle gracefully
      const result = calculateTrend(duplicateData);
      expect(result).toBeDefined();
    });

    it('should handle data with out-of-order timestamps', () => {
      const unorderedData: TrendData[] = [
        { timestamp: new Date('2024-01-03'), value: 120, label: 'Jan 3' },
        { timestamp: new Date('2024-01-01'), value: 100, label: 'Jan 1' },
        { timestamp: new Date('2024-01-02'), value: 110, label: 'Jan 2' }
      ];

      const result = calculateTrend(unorderedData);
      // Should sort by timestamp before calculating
      expect(result.startValue).toBe(100);
      expect(result.endValue).toBe(120);
    });

    it('should handle negative values', () => {
      const negativeData: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: -100, label: 'Jan 1' },
        { timestamp: new Date('2024-01-02'), value: -50, label: 'Jan 2' }
      ];

      const result = calculateTrend(negativeData);
      expect(result.direction).toBe(TrendDirection.UP);
      expect(result.percentageChange).toBe(50); // 50% improvement (less negative)
    });

    it('should handle crossing zero', () => {
      const crossingZeroData: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: -10, label: 'Jan 1' },
        { timestamp: new Date('2024-01-02'), value: 10, label: 'Jan 2' }
      ];

      const result = calculateTrend(crossingZeroData);
      expect(result.direction).toBe(TrendDirection.UP);
      // Percentage change from negative to positive is tricky
      expect(result.absoluteChange).toBe(20);
    });

    it('should handle very large datasets efficiently', () => {
      const largeDataset: TrendData[] = [];
      for (let i = 0; i < 10000; i++) {
        largeDataset.push({
          timestamp: new Date(2024, 0, i + 1),
          value: Math.sin(i / 100) * 100 + 100,
          label: `Day ${i + 1}`
        });
      }

      const startTime = Date.now();
      const result = calculateTrend(largeDataset);
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle NaN and Infinity values gracefully', () => {
      const invalidData: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: 100, label: 'Jan 1' },
        { timestamp: new Date('2024-01-02'), value: NaN, label: 'Jan 2' },
        { timestamp: new Date('2024-01-03'), value: 120, label: 'Jan 3' }
      ];

      expect(() => calculateTrend(invalidData)).toThrow('Invalid value detected in trend data');
    });

    it('should handle null timestamps', () => {
      const nullTimestampData: TrendData[] = [
        { timestamp: new Date('2024-01-01'), value: 100, label: 'Jan 1' },
        { timestamp: null as any, value: 110, label: 'Invalid' },
        { timestamp: new Date('2024-01-03'), value: 120, label: 'Jan 3' }
      ];

      expect(() => calculateTrend(nullTimestampData)).toThrow('Invalid timestamp detected');
    });

    it('should handle timezone boundaries correctly', () => {
      // Data spanning DST transition
      const dstData: TrendData[] = [
        { timestamp: new Date('2024-03-09T23:00:00'), value: 100, label: 'Before DST' },
        { timestamp: new Date('2024-03-10T03:00:00'), value: 110, label: 'After DST' }
      ];

      const result = calculateTrend(dstData);
      expect(result).toBeDefined();
    });
  });
});