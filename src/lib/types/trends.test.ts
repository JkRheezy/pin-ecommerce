import { describe, it, expect } from 'vitest';
import {
  TrendDirection,
  TrendGranularity,
  type TrendDataPoint,
  type TrendSeries,
  type TrendAnalysis,
  type TrendConfig,
  calculateTrendDirection,
  aggregateTrendData,
  detectAnomalies,
  validateTrendConfig,
  createEmptyTrendSeries,
  mergeTrendSeries,
} from './trends';

describe('trends', () => {
  describe('TrendDirection', () => {
    it('should have correct enum values', () => {
      expect(TrendDirection.UP).toBe('UP');
      expect(TrendDirection.DOWN).toBe('DOWN');
      expect(TrendDirection.FLAT).toBe('FLAT');
      expect(TrendDirection.VOLATILE).toBe('VOLATILE');
    });
  });

  describe('TrendGranularity', () => {
    it('should have correct enum values', () => {
      expect(TrendGranularity.MINUTE).toBe('MINUTE');
      expect(TrendGranularity.HOUR).toBe('HOUR');
      expect(TrendGranularity.DAY).toBe('DAY');
      expect(TrendGranularity.WEEK).toBe('WEEK');
      expect(TrendGranularity.MONTH).toBe('MONTH');
    });
  });

  describe('calculateTrendDirection', () => {
    it('should detect upward trend', () => {
      const dataPoints: TrendDataPoint[] = [
        { timestamp: 1000, value: 10 },
        { timestamp: 2000, value: 20 },
        { timestamp: 3000, value: 30 },
      ];

      const result = calculateTrendDirection(dataPoints);

      expect(result.direction).toBe(TrendDirection.UP);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect downward trend', () => {
      const dataPoints: TrendDataPoint[] = [
        { timestamp: 1000, value: 30 },
        { timestamp: 2000, value: 20 },
        { timestamp: 3000, value: 10 },
      ];

      const result = calculateTrendDirection(dataPoints);

      expect(result.direction).toBe(TrendDirection.DOWN);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect flat trend for stable values', () => {
      const dataPoints: TrendDataPoint[] = [
        { timestamp: 1000, value: 25 },
        { timestamp: 2000, value: 26 },
        { timestamp: 3000, value: 25 },
      ];

      const result = calculateTrendDirection(dataPoints);

      expect(result.direction).toBe(TrendDirection.FLAT);
    });

    it('should detect volatile trend for erratic values', () => {
      const dataPoints: TrendDataPoint[] = [
        { timestamp: 1000, value: 10 },
        { timestamp: 2000, value: 100 },
        { timestamp: 3000, value: 5 },
        { timestamp: 4000, value: 90 },
      ];

      const result = calculateTrendDirection(dataPoints);

      expect(result.direction).toBe(TrendDirection.VOLATILE);
    });

    it('should handle single data point', () => {
      const dataPoints: TrendDataPoint[] = [{ timestamp: 1000, value: 50 }];

      const result = calculateTrendDirection(dataPoints);

      expect(result.direction).toBe(TrendDirection.FLAT);
      expect(result.confidence).toBe(0);
    });

    it('should handle empty array', () => {
      const result = calculateTrendDirection([]);

      expect(result.direction).toBe(TrendDirection.FLAT);
      expect(result.confidence).toBe(0);
    });

    it('should throw error for invalid timestamp', () => {
      const dataPoints: TrendDataPoint[] = [
        { timestamp: -1, value: 10 },
        { timestamp: 2000, value: 20 },
      ];

      expect(() => calculateTrendDirection(dataPoints)).toThrow('Invalid timestamp');
    });

    it('should throw error for NaN value', () => {
      const dataPoints: TrendDataPoint[] = [
        { timestamp: 1000, value: NaN },
        { timestamp: 2000, value: 20 },
      ];

      expect(() => calculateTrendDirection(dataPoints)).toThrow('Invalid value');
    });
  });

  describe('aggregateTrendData', () => {
    it('should aggregate data by hour', () => {
      const dataPoints: TrendDataPoint[] = [
        { timestamp: 3600000, value: 10 }, // 1 hour
        { timestamp: 7200000, value: 20 }, // 2 hours
        { timestamp: 10800000, value: 30 }, // 3 hours
      ];

      const result = aggregateTrendData(dataPoints, TrendGranularity.HOUR);

      expect(result).toHaveLength(3);
      expect(result[0].value).toBe(10);
      expect(result[1].value).toBe(20);
      expect(result[2].value).toBe(30);
    });

    it('should sum values within same aggregation window', () => {
      const dataPoints: TrendDataPoint[] = [
        { timestamp: 3600000, value: 10 },
        { timestamp: 3600001, value: 20 }, // Same hour
        { timestamp: 7200000, value: 30 },
      ];

      const result = aggregateTrendData(dataPoints, TrendGranularity.HOUR);

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(30); // 10 + 20
      expect(result[1].value).toBe(30);
    });

    it('should handle empty array', () => {
      const result = aggregateTrendData([], TrendGranularity.DAY);

      expect(result).toHaveLength(0);
    });

    it('should throw error for unsupported granularity', () => {
      const dataPoints: TrendDataPoint[] = [{ timestamp: 1000, value: 10 }];

      expect(() =>
        aggregateTrendData(dataPoints, 'INVALID' as TrendGranularity)
      ).toThrow('Unsupported granularity');
    });
  });

  describe('detectAnomalies', () => {
    it('should detect values above upper bound', () => {
      const dataPoints: TrendDataPoint[] = [
        { timestamp: 1000, value: 10 },
        { timestamp: 2000, value: 100 }, // Anomaly
        { timestamp: 3000, value: 15 },
      ];

      const result = detectAnomalies(dataPoints, { threshold: 2 });

      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe(2000);
      expect(result[0].severity).toBe('HIGH');
    });

    it('should detect values below lower bound', () => {
      const dataPoints: TrendDataPoint[] = [
        { timestamp: 1000, value: 50 },
        { timestamp: 2000, value: 5 }, // Anomaly
        { timestamp: 3000, value: 55 },
      ];

      const result = detectAnomalies(dataPoints, { threshold: 2 });

      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe(2000);
    });

    it('should return empty array when no anomalies', () => {
      const dataPoints: TrendDataPoint[] = [
        { timestamp: 1000, value: 10 },
        { timestamp: 2000, value: 12 },
        { timestamp: 3000, value: 11 },
      ];

      const result = detectAnomalies(dataPoints, { threshold: 2 });

      expect(result).toHaveLength(0);
    });

    it('should handle insufficient data points', () => {
      const dataPoints: TrendDataPoint[] = [{ timestamp: 1000, value: 10 }];

      const result = detectAnomalies(dataPoints, { threshold: 2 });

      expect(result).toHaveLength(0);
    });

    it('should throw error for invalid threshold', () => {
      const dataPoints: TrendDataPoint[] = [
        { timestamp: 1000, value: 10 },
        { timestamp: 2000, value: 20 },
      ];

      expect(() => detectAnomalies(dataPoints, { threshold: 0 })).toThrow(
        'Threshold must be positive'
      );
      expect(() => detectAnomalies(dataPoints, { threshold: -1 })).toThrow(
        'Threshold must be positive'
      );
    });
  });

  describe('validateTrendConfig', () => {
    it('should validate correct config', () => {
      const config: TrendConfig = {
        metricName: 'cpu_usage',
        granularity: TrendGranularity.HOUR,
        timeRange: { start: 0, end: 3600000 },
      };

      expect(() => validateTrendConfig(config)).not.toThrow();
    });

    it('should throw for missing metric name', () => {
      const config = {
        granularity: TrendGranularity.HOUR,
        timeRange: { start: 0, end: 3600000 },
      } as TrendConfig;

      expect(() => validateTrendConfig(config)).toThrow('Metric name is required');
    });

    it('should throw for empty metric name', () => {
      const config: TrendConfig = {
        metricName: '',
        granularity: TrendGranularity.HOUR,
        timeRange: { start: 0, end: 3600000 },
      };

      expect(() => validateTrendConfig(config)).toThrow('Metric name is required');
    });

    it('should throw for invalid time range', () => {
      const config: TrendConfig = {
        metricName: 'cpu_usage',
        granularity: TrendGranularity.HOUR,
        timeRange: { start: 3600000, end: 0 }, // end < start
      };

      expect(() => validateTrendConfig(config)).toThrow('Invalid time range');
    });

    it('should throw for negative timestamps', () => {
      const config: TrendConfig = {
        metricName: 'cpu_usage',
        granularity: TrendGranularity.HOUR,
        timeRange: { start: -1000, end: 3600000 },
      };

      expect(() => validateTrendConfig(config)).toThrow('Invalid time range');
    });
  });

  describe('createEmptyTrendSeries', () => {
    it('should create empty series with correct structure', () => {
      const series = createEmptyTrendSeries('test_metric');

      expect(series.metricName).toBe('test_metric');
      expect(series.dataPoints).toHaveLength(0);
      expect(series.metadata).toBeDefined();
    });

    it('should include optional metadata', () => {
      const metadata = { unit: 'percentage', source: 'prometheus' };
      const series = createEmptyTrendSeries('cpu_usage', metadata);

      expect(series.metadata).toEqual(metadata);
    });
  });

  describe('mergeTrendSeries', () => {
    it('should merge two series with different timestamps', () => {
      const series1: TrendSeries = {
        metricName: 'cpu',
        dataPoints: [
          { timestamp: 1000, value: 10 },
          { timestamp: 2000, value: 20 },
        ],
        metadata: {},
      };

      const series2: TrendSeries = {
        metricName: 'cpu',
        dataPoints: [
          { timestamp: 3000, value: 30 },
          { timestamp: 4000, value: 40 },
        ],
        metadata: {},
      };

      const result = mergeTrendSeries(series1, series2);

      expect(result.dataPoints).toHaveLength(4);
      expect(result.dataPoints[0].timestamp).toBe(1000);
      expect(result.dataPoints[3].timestamp).toBe(4000);
    });

    it('should deduplicate points with same timestamp', () => {
      const series1: TrendSeries = {
        metricName: 'cpu',
        dataPoints: [{ timestamp: 1000, value: 10 }],
        metadata: {},
      };

      const series2: TrendSeries = {
        metricName: 'cpu',
        dataPoints: [{ timestamp: 1000, value: 20 }],
        metadata: {},
      };

      const result = mergeTrendSeries(series1, series2);

      expect(result.dataPoints).toHaveLength(1);
      // Later value should take precedence
      expect(result.dataPoints[0].value).toBe(20);
    });

    it('should throw for mismatched metric names', () => {
      const series1: TrendSeries = {
        metricName: 'cpu',
        dataPoints: [],
        metadata: {},
      };

      const series2: TrendSeries = {
        metricName: 'memory',
        dataPoints: [],
        metadata: {},
      };

      expect(() => mergeTrendSeries(series1, series2)).toThrow(
        'Cannot merge series with different metric names'
      );
    });

    it('should merge metadata from both series', () => {
      const series1: TrendSeries = {
        metricName: 'cpu',
        dataPoints: [],
        metadata: { source: 'agent1' },
      };

      const series2: TrendSeries = {
        metricName: 'cpu',
        dataPoints: [],
        metadata: { unit: 'percent' },
      };

      const result = mergeTrendSeries(series1, series2);

      expect(result.metadata).toEqual({ source: 'agent1', unit: 'percent' });
    });
  });
});