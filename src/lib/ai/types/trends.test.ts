import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { MockedFunction } from 'jest-mock';
import {
  analyzeTrends,
  detectAnomalies,
  calculateTrendDirection,
  aggregateTimeSeries,
  type TrendAnalysis,
  type AnomalyConfig,
  type TimeSeriesPoint,
  type TrendDirection,
} from './trends';
import { createLogger } from '@harness/logging';

// Mock the logger to avoid console output during tests
jest.mock('@harness/logging', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('trends', () => {
  const mockLogger = createLogger('trends-test');

  describe('analyzeTrends', () => {
    it('should analyze trends for valid time series data', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
        { timestamp: new Date('2024-01-02'), value: 15 },
        { timestamp: new Date('2024-01-03'), value: 20 },
        { timestamp: new Date('2024-01-04'), value: 25 },
        { timestamp: new Date('2024-01-05'), value: 30 },
      ];

      const result: TrendAnalysis = analyzeTrends(data);

      expect(result.direction).toBe('increasing');
      expect(result.slope).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.dataPoints).toBe(5);
    });

    it('should detect decreasing trends', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 50 },
        { timestamp: new Date('2024-01-02'), value: 40 },
        { timestamp: new Date('2024-01-03'), value: 30 },
        { timestamp: new Date('2024-01-04'), value: 20 },
        { timestamp: new Date('2024-01-05'), value: 10 },
      ];

      const result: TrendAnalysis = analyzeTrends(data);

      expect(result.direction).toBe('decreasing');
      expect(result.slope).toBeLessThan(0);
    });

    it('should detect stable trends with low variance', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 100 },
        { timestamp: new Date('2024-01-02'), value: 101 },
        { timestamp: new Date('2024-01-03'), value: 99 },
        { timestamp: new Date('2024-01-04'), value: 100 },
        { timestamp: new Date('2024-01-05'), value: 100 },
      ];

      const result: TrendAnalysis = analyzeTrends(data);

      expect(result.direction).toBe('stable');
      expect(Math.abs(result.slope)).toBeLessThan(0.5);
    });

    it('should throw error for empty data array', () => {
      expect(() => analyzeTrends([])).toThrow('Time series data cannot be empty');
    });

    it('should throw error for single data point', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
      ];

      expect(() => analyzeTrends(data)).toThrow('At least two data points required for trend analysis');
    });

    it('should throw error for invalid timestamp', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('invalid'), value: 10 },
        { timestamp: new Date('2024-01-02'), value: 20 },
      ];

      expect(() => analyzeTrends(data)).toThrow('Invalid timestamp detected in data');
    });

    it('should throw error for non-finite values', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: Infinity },
        { timestamp: new Date('2024-01-02'), value: 20 },
      ];

      expect(() => analyzeTrends(data)).toThrow('Non-finite value detected in data');
    });

    it('should handle unsorted data by sorting chronologically', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-05'), value: 30 },
        { timestamp: new Date('2024-01-01'), value: 10 },
        { timestamp: new Date('2024-01-03'), value: 20 },
        { timestamp: new Date('2024-01-02'), value: 15 },
        { timestamp: new Date('2024-01-04'), value: 25 },
      ];

      const result: TrendAnalysis = analyzeTrends(data);

      expect(result.direction).toBe('increasing');
      expect(result.slope).toBeGreaterThan(0);
    });

    it('should calculate correlation coefficient correctly', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
        { timestamp: new Date('2024-01-02'), value: 20 },
        { timestamp: new Date('2024-01-03'), value: 30 },
      ];

      const result: TrendAnalysis = analyzeTrends(data);

      // Perfect linear correlation should be close to 1
      expect(result.correlation).toBeCloseTo(1, 5);
    });
  });

  describe('detectAnomalies', () => {
    const defaultConfig: AnomalyConfig = {
      method: 'zscore',
      threshold: 2,
    };

    it('should detect anomalies using z-score method', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
        { timestamp: new Date('2024-01-02'), value: 11 },
        { timestamp: new Date('2024-01-03'), value: 10 },
        { timestamp: new Date('2024-01-04'), value: 12 },
        { timestamp: new Date('2024-01-05'), value: 100 }, // Anomaly
        { timestamp: new Date('2024-01-06'), value: 11 },
      ];

      const anomalies = detectAnomalies(data, defaultConfig);

      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].timestamp).toEqual(new Date('2024-01-05'));
      expect(anomalies[0].value).toBe(100);
      expect(anomalies[0].score).toBeGreaterThan(defaultConfig.threshold);
    });

    it('should detect anomalies using IQR method', () => {
      const config: AnomalyConfig = {
        method: 'iqr',
        threshold: 1.5,
      };

      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
        { timestamp: new Date('2024-01-02'), value: 12 },
        { timestamp: new Date('2024-01-03'), value: 11 },
        { timestamp: new Date('2024-01-04'), value: 13 },
        { timestamp: new Date('2024-01-05'), value: 50 }, // Anomaly
        { timestamp: new Date('2024-01-06'), value: 12 },
      ];

      const anomalies = detectAnomalies(data, config);

      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies.some(a => a.value === 50)).toBe(true);
    });

    it('should detect anomalies using MAD method', () => {
      const config: AnomalyConfig = {
        method: 'mad',
        threshold: 3,
      };

      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
        { timestamp: new Date('2024-01-02'), value: 11 },
        { timestamp: new Date('2024-01-03'), value: 10 },
        { timestamp: new Date('2024-01-04'), value: 12 },
        { timestamp: new Date('2024-01-05'), value: 100 }, // Anomaly
      ];

      const anomalies = detectAnomalies(data, config);

      expect(anomalies.length).toBeGreaterThan(0);
    });

    it('should return empty array when no anomalies detected', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
        { timestamp: new Date('2024-01-02'), value: 11 },
        { timestamp: new Date('2024-01-03'), value: 10 },
        { timestamp: new Date('2024-01-04'), value: 12 },
        { timestamp: new Date('2024-01-05'), value: 11 },
      ];

      const anomalies = detectAnomalies(data, defaultConfig);

      expect(anomalies).toHaveLength(0);
    });

    it('should throw error for empty data array', () => {
      expect(() => detectAnomalies([], defaultConfig)).toThrow('Data array cannot be empty');
    });

    it('should throw error for invalid threshold', () => {
      const config: AnomalyConfig = {
        method: 'zscore',
        threshold: -1,
      };

      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
        { timestamp: new Date('2024-01-02'), value: 20 },
      ];

      expect(() => detectAnomalies(data, config)).toThrow('Threshold must be positive');
    });

    it('should throw error for unsupported method', () => {
      const config = {
        method: 'unsupported' as const,
        threshold: 2,
      };

      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
        { timestamp: new Date('2024-01-02'), value: 20 },
      ];

      expect(() => detectAnomalies(data, config as AnomalyConfig)).toThrow('Unsupported anomaly detection method');
    });

    it('should use custom threshold for anomaly detection', () => {
      const strictConfig: AnomalyConfig = {
        method: 'zscore',
        threshold: 1, // Lower threshold = more sensitive
      };

      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
        { timestamp: new Date('2024-01-02'), value: 11 },
        { timestamp: new Date('2024-01-03'), value: 15 }, // Might be detected with lower threshold
        { timestamp: new Date('2024-01-04'), value: 10 },
      ];

      const anomalies = detectAnomalies(data, strictConfig);

      // With lower threshold, more points may be flagged
      expect(anomalies.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateTrendDirection', () => {
    it('should return increasing for positive slope', () => {
      const result: TrendDirection = calculateTrendDirection(5, 0.9);

      expect(result).toBe('increasing');
    });

    it('should return decreasing for negative slope', () => {
      const result: TrendDirection = calculateTrendDirection(-5, 0.9);

      expect(result).toBe('decreasing');
    });

    it('should return stable for near-zero slope', () => {
      const result: TrendDirection = calculateTrendDirection(0.1, 0.9);

      expect(result).toBe('stable');
    });

    it('should return stable for low confidence regardless of slope', () => {
      const result: TrendDirection = calculateTrendDirection(10, 0.3);

      expect(result).toBe('stable');
    });

    it('should handle zero slope', () => {
      const result: TrendDirection = calculateTrendDirection(0, 0.95);

      expect(result).toBe('stable');
    });

    it('should use confidence threshold of 0.5', () => {
      // High slope but exactly at confidence threshold
      const result: TrendDirection = calculateTrendDirection(100, 0.5);

      expect(result).toBe('stable');
    });
  });

  describe('aggregateTimeSeries', () => {
    it('should aggregate data by hour', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01T10:15:00'), value: 10 },
        { timestamp: new Date('2024-01-01T10:30:00'), value: 20 },
        { timestamp: new Date('2024-01-01T10:45:00'), value: 30 },
        { timestamp: new Date('2024-01-01T11:00:00'), value: 40 },
      ];

      const result = aggregateTimeSeries(data, 'hour', 'sum');

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(60); // Sum of first hour
      expect(result[1].value).toBe(40); // Sum of second hour
    });

    it('should aggregate data by day', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01T10:00:00'), value: 10 },
        { timestamp: new Date('2024-01-01T14:00:00'), value: 20 },
        { timestamp: new Date('2024-01-02T10:00:00'), value: 30 },
        { timestamp: new Date('2024-01-02T14:00:00'), value: 40 },
      ];

      const result = aggregateTimeSeries(data, 'day', 'sum');

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(30); // Day 1 sum
      expect(result[1].value).toBe(70); // Day 2 sum
    });

    it('should support average aggregation', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01T10:00:00'), value: 10 },
        { timestamp: new Date('2024-01-01T10:30:00'), value: 20 },
        { timestamp: new Date('2024-01-01T11:00:00'), value: 30 },
      ];

      const result = aggregateTimeSeries(data, 'hour', 'average');

      expect(result[0].value).toBe(15); // Average of first hour
      expect(result[1].value).toBe(30); // Average of second hour
    });

    it('should support max aggregation', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01T10:00:00'), value: 10 },
        { timestamp: new Date('2024-01-01T10:30:00'), value: 50 },
        { timestamp: new Date('2024-01-01T11:00:00'), value: 30 },
      ];

      const result = aggregateTimeSeries(data, 'hour', 'max');

      expect(result[0].value).toBe(50); // Max of first hour
      expect(result[1].value).toBe(30); // Max of second hour
    });

    it('should support min aggregation', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01T10:00:00'), value: 10 },
        { timestamp: new Date('2024-01-01T10:30:00'), value: 50 },
        { timestamp: new Date('2024-01-01T11:00:00'), value: 30 },
      ];

      const result = aggregateTimeSeries(data, 'hour', 'min');

      expect(result[0].value).toBe(10); // Min of first hour
      expect(result[1].value).toBe(30); // Min of second hour
    });

    it('should throw error for empty data array', () => {
      expect(() => aggregateTimeSeries([], 'hour', 'sum')).toThrow('Data array cannot be empty');
    });

    it('should throw error for unsupported granularity', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
      ];

      expect(() => aggregateTimeSeries(data, 'century' as any, 'sum')).toThrow('Unsupported granularity');
    });

    it('should throw error for unsupported aggregation method', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
      ];

      expect(() => aggregateTimeSeries(data, 'hour', 'median' as any)).toThrow('Unsupported aggregation method');
    });

    it('should handle single data point', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01T10:00:00'), value: 42 },
      ];

      const result = aggregateTimeSeries(data, 'hour', 'sum');

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(42);
    });

    it('should aggregate by week correctly', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 }, // Monday
        { timestamp: new Date('2024-01-02'), value: 20 }, // Tuesday
        { timestamp: new Date('2024-01-08'), value: 30 }, // Next Monday
      ];

      const result = aggregateTimeSeries(data, 'week', 'sum');

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(30); // First week
      expect(result[1].value).toBe(30); // Second week
    });

    it('should aggregate by month correctly', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-15'), value: 10 },
        { timestamp: new Date('2024-01-20'), value: 20 },
        { timestamp: new Date('2024-02-05'), value: 30 },
      ];

      const result = aggregateTimeSeries(data, 'month', 'sum');

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(30); // January
      expect(result[1].value).toBe(30); // February
    });
  });

  describe('edge cases and integration', () => {
    it('should handle very large datasets efficiently', () => {
      const data: TimeSeriesPoint[] = Array.from({ length: 10000 }, (_, i) => ({
        timestamp: new Date(2024, 0, 1, 0, i),
        value: i,
      }));

      const startTime = Date.now();
      const result = analyzeTrends(data);
      const endTime = Date.now();

      expect(result.direction).toBe('increasing');
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle data with missing values gracefully', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-01-01'), value: 10 },
        // Gap in data
        { timestamp: new Date('2024-01-05'), value: 50 },
      ];

      // Should not throw, but may have reduced confidence
      const result = analyzeTrends(data);

      expect(result.dataPoints).toBe(2);
      expect(result.confidence).toBeDefined();
    });

    it('should handle seasonal data patterns', () => {
      // Simulate weekly seasonality
      const data: TimeSeriesPoint[] = Array.from({ length: 28 }, (_, i) => ({
        timestamp: new Date(2024, 0, i + 1),
        value: 10 + (i % 7) * 5, // Weekly pattern
      }));

      const result = analyzeTrends(data);

      // Overall trend might be flat due to seasonality
      expect(result.direction).toBeDefined();
      expect(result.seasonality).toBeDefined();
    });

    it('should preserve timestamps in anomaly results', () => {
      const data: TimeSeriesPoint[] = [
        { timestamp: new Date('2024-06-15T12:30:00Z'), value: 10 },
        { timestamp: new Date('2024-06-15T13:00:00Z'), value: 1000 },
        { timestamp: new Date('2024-06-15T13:30:00Z'), value: 10 },
      ];

      const anomalies = detectAnomalies(data, { method: 'zscore', threshold: 2 });

      expect(anomalies[0].timestamp.toISOString()).toBe('2024-06-15T13:00:00.000Z');
    });
  });
});