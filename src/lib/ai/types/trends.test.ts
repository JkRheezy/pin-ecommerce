/**
 * @file trends.test.ts
 * @description Comprehensive test suite for AI trends types
 * @layer Types
 */

import { describe, it, expect } from 'vitest';
import type {
  TrendDirection,
  TrendSeverity,
  TrendMetric,
  TrendDataPoint,
  TrendSeries,
  TrendAnalysis,
  TrendAlert,
  TrendForecast,
  TrendComparison,
  TrendConfig,
  TrendReport,
  TrendExportFormat,
  TrendFilterOptions,
  TrendAggregationType,
  TrendTimeRange,
  TrendAnomaly,
  TrendInsight,
  CreateTrendMetricRequest,
  UpdateTrendMetricRequest,
  TrendQueryParams,
  TrendApiResponse,
  TrendErrorCode,
} from './trends';

describe('TrendDirection', () => {
  it('should accept valid trend directions', () => {
    const directions: TrendDirection[] = ['up', 'down', 'flat', 'volatile'];
    
    directions.forEach(direction => {
      expect(['up', 'down', 'flat', 'volatile']).toContain(direction);
    });
  });
});

describe('TrendSeverity', () => {
  it('should accept valid severity levels', () => {
    const severities: TrendSeverity[] = ['info', 'warning', 'critical', 'none'];
    
    severities.forEach(severity => {
      expect(['info', 'warning', 'critical', 'none']).toContain(severity);
    });
  });
});

describe('TrendMetric', () => {
  it('should create valid trend metric', () => {
    const metric: TrendMetric = {
      id: 'metric-001',
      name: 'API Response Time',
      description: 'Average API response time in milliseconds',
      unit: 'ms',
      direction: 'down',
      target: 200,
      threshold: {
        warning: 300,
        critical: 500,
      },
      tags: ['performance', 'api'],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-15'),
    };

    expect(metric.id).toBe('metric-001');
    expect(metric.unit).toBe('ms');
    expect(metric.threshold?.warning).toBe(300);
  });

  it('should handle optional fields', () => {
    const minimalMetric: TrendMetric = {
      id: 'metric-002',
      name: 'Simple Metric',
      unit: 'count',
      direction: 'flat',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(minimalMetric.description).toBeUndefined();
    expect(minimalMetric.threshold).toBeUndefined();
  });
});

describe('TrendDataPoint', () => {
  it('should create valid data point with all fields', () => {
    const dataPoint: TrendDataPoint = {
      timestamp: new Date('2024-01-15T10:00:00Z'),
      value: 150.5,
      metadata: {
        source: 'production',
        region: 'us-east-1',
      },
      labels: ['peak-hours'],
    };

    expect(dataPoint.value).toBe(150.5);
    expect(dataPoint.metadata?.source).toBe('production');
  });

  it('should create minimal data point', () => {
    const minimalPoint: TrendDataPoint = {
      timestamp: new Date(),
      value: 42,
    };

    expect(minimalPoint.metadata).toBeUndefined();
    expect(minimalPoint.labels).toBeUndefined();
  });
});

describe('TrendSeries', () => {
  it('should create valid trend series', () => {
    const series: TrendSeries = {
      metricId: 'metric-001',
      name: 'Daily API Latency',
      data: [
        { timestamp: new Date('2024-01-01'), value: 100 },
        { timestamp: new Date('2024-01-02'), value: 105 },
        { timestamp: new Date('2024-01-03'), value: 98 },
      ],
      aggregation: 'avg',
      interval: '1d',
      tags: ['production', 'api'],
    };

    expect(series.data).toHaveLength(3);
    expect(series.aggregation).toBe('avg');
  });

  it('should validate aggregation types', () => {
    const validAggregations: TrendAggregationType[] = [
      'avg', 'sum', 'min', 'max', 'count', 'p50', 'p95', 'p99'
    ];

    validAggregations.forEach(agg => {
      const series: TrendSeries = {
        metricId: 'test',
        name: 'Test',
        data: [],
        aggregation: agg,
        interval: '1h',
      };
      expect(series.aggregation).toBe(agg);
    });
  });
});

describe('TrendAnalysis', () => {
  it('should create complete trend analysis', () => {
    const analysis: TrendAnalysis = {
      metricId: 'metric-001',
      direction: 'down',
      severity: 'info',
      changePercent: -15.5,
      changeAbsolute: -50,
      periodStart: new Date('2024-01-01'),
      periodEnd: new Date('2024-01-31'),
      confidence: 0.95,
      factors: [
        { name: 'Optimization', impact: 0.7 },
        { name: 'Reduced Load', impact: 0.3 },
      ],
      recommendations: ['Continue current optimization strategy'],
    };

    expect(analysis.confidence).toBeGreaterThan(0);
    expect(analysis.confidence).toBeLessThanOrEqual(1);
    expect(analysis.factors).toHaveLength(2);
  });

  it('should handle analysis without factors', () => {
    const simpleAnalysis: TrendAnalysis = {
      metricId: 'metric-002',
      direction: 'flat',
      severity: 'none',
      changePercent: 0,
      changeAbsolute: 0,
      periodStart: new Date(),
      periodEnd: new Date(),
      confidence: 0.8,
    };

    expect(simpleAnalysis.factors).toBeUndefined();
    expect(simpleAnalysis.recommendations).toBeUndefined();
  });
});

describe('TrendAlert', () => {
  it('should create valid trend alert', () => {
    const alert: TrendAlert = {
      id: 'alert-001',
      metricId: 'metric-001',
      severity: 'critical',
      message: 'Response time exceeded critical threshold',
      triggeredAt: new Date('2024-01-15T10:30:00Z'),
      resolvedAt: undefined,
      acknowledgedBy: undefined,
      value: 550,
      threshold: 500,
      context: {
        previousValue: 480,
        trendDirection: 'up',
      },
    };

    expect(alert.severity).toBe('critical');
    expect(alert.resolvedAt).toBeUndefined();
  });

  it('should handle resolved alert', () => {
    const resolvedAlert: TrendAlert = {
      id: 'alert-002',
      metricId: 'metric-001',
      severity: 'warning',
      message: 'Resolved issue',
      triggeredAt: new Date('2024-01-15T10:00:00Z'),
      resolvedAt: new Date('2024-01-15T11:00:00Z'),
      acknowledgedBy: 'user-123',
      value: 320,
      threshold: 300,
    };

    expect(resolvedAlert.resolvedAt).toBeDefined();
    expect(resolvedAlert.acknowledgedBy).toBe('user-123');
  });
});

describe('TrendForecast', () => {
  it('should create valid forecast', () => {
    const forecast: TrendForecast = {
      metricId: 'metric-001',
      horizon: '7d',
      predictions: [
        { timestamp: new Date('2024-01-16'), predicted: 145, lowerBound: 140, upperBound: 150 },
        { timestamp: new Date('2024-01-17'), predicted: 142, lowerBound: 135, upperBound: 149 },
      ],
      confidence: 0.85,
      model: 'arima',
      generatedAt: new Date(),
    };

    expect(forecast.predictions).toHaveLength(2);
    expect(forecast.model).toBe('arima');
  });

  it('should validate horizon formats', () => {
    const validHorizons = ['1h', '6h', '1d', '7d', '30d', '90d'] as const;
    
    validHorizons.forEach(horizon => {
      const forecast: TrendForecast = {
        metricId: 'test',
        horizon,
        predictions: [],
        confidence: 0.8,
        model: 'linear',
        generatedAt: new Date(),
      };
      expect(forecast.horizon).toBe(horizon);
    });
  });
});

describe('TrendComparison', () => {
  it('should create valid comparison', () => {
    const comparison: TrendComparison = {
      baselineMetricId: 'metric-001',
      compareMetricId: 'metric-002',
      baselinePeriod: { start: new Date('2024-01-01'), end: new Date('2024-01-15') },
      comparePeriod: { start: new Date('2024-01-16'), end: new Date('2024-01-31') },
      correlation: 0.75,
      difference: {
        absolute: 25,
        percent: 12.5,
      },
      insights: ['Strong positive correlation detected'],
    };

    expect(comparison.correlation).toBeGreaterThanOrEqual(-1);
    expect(comparison.correlation).toBeLessThanOrEqual(1);
  });
});

describe('TrendConfig', () => {
  it('should create complete config', () => {
    const config: TrendConfig = {
      metricId: 'metric-001',
      enabled: true,
      samplingRate: 0.1,
      retentionDays: 90,
      alertRules: [
        {
          condition: 'above',
          threshold: 500,
          severity: 'critical',
          duration: '5m',
        },
        {
          condition: 'below',
          threshold: 50,
          severity: 'warning',
          duration: '10m',
        },
      ],
      forecastEnabled: true,
      forecastHorizon: '7d',
      anomalyDetection: {
        enabled: true,
        sensitivity: 'medium',
        algorithm: 'isolation-forest',
      },
    };

    expect(config.alertRules).toHaveLength(2);
    expect(config.anomalyDetection?.algorithm).toBe('isolation-forest');
  });

  it('should handle disabled config', () => {
    const disabledConfig: TrendConfig = {
      metricId: 'metric-002',
      enabled: false,
      retentionDays: 30,
    };

    expect(disabledConfig.enabled).toBe(false);
    expect(disabledConfig.alertRules).toBeUndefined();
  });
});

describe('TrendReport', () => {
  it('should create comprehensive report', () => {
    const report: TrendReport = {
      id: 'report-001',
      title: 'Q1 Performance Trends',
      description: 'Quarterly analysis of key performance metrics',
      generatedAt: new Date(),
      generatedBy: 'user-001',
      timeRange: { start: new Date('2024-01-01'), end: new Date('2024-03-31') },
      metrics: ['metric-001', 'metric-002', 'metric-003'],
      analyses: [],
      alerts: [],
      insights: [],
      format: 'pdf',
    };

    expect(report.format).toBe('pdf');
  });

  it('should validate export formats', () => {
    const validFormats: TrendExportFormat[] = ['pdf', 'csv', 'json', 'xlsx', 'html'];
    
    validFormats.forEach(format => {
      const report: TrendReport = {
        id: 'test',
        title: 'Test',
        generatedAt: new Date(),
        generatedBy: 'user',
        timeRange: { start: new Date(), end: new Date() },
        metrics: [],
        format,
      };
      expect(report.format).toBe(format);
    });
  });
});

describe('TrendFilterOptions', () => {
  it('should create filter with all options', () => {
    const filter: TrendFilterOptions = {
      metrics: ['metric-001', 'metric-002'],
      tags: ['production', 'critical'],
      severity: ['warning', 'critical'],
      direction: ['up', 'volatile'],
      timeRange: { start: new Date('2024-01-01'), end: new Date('2024-01-31') },
      search: 'response time',
    };

    expect(filter.metrics).toHaveLength(2);
    expect(filter.search).toBe('response time');
  });

  it('should create empty filter', () => {
    const emptyFilter: TrendFilterOptions = {};
    
    expect(Object.keys(emptyFilter)).toHaveLength(0);
  });
});

describe('TrendAnomaly', () => {
  it('should create valid anomaly detection', () => {
    const anomaly: TrendAnomaly = {
      id: 'anomaly-001',
      metricId: 'metric-001',
      detectedAt: new Date('2024-01-15T10:00:00Z'),
      severity: 'critical',
      score: 0.95,
      expectedValue: 150,
      actualValue: 350,
      deviation: 133.33,
      context: {
        windowStart: new Date('2024-01-15T09:00:00Z'),
        windowEnd: new Date('2024-01-15T11:00:00Z'),
        relatedMetrics: ['metric-002'],
      },
      status: 'open',
    };

    expect(anomaly.score).toBeGreaterThan(0);
    expect(anomaly.status).toBe('open');
  });

  it('should handle resolved anomaly', () => {
    const resolved: TrendAnomaly = {
      id: 'anomaly-002',
      metricId: 'metric-001',
      detectedAt: new Date(),
      severity: 'warning',
      score: 0.75,
      expectedValue: 100,
      actualValue: 150,
      deviation: 50,
      status: 'resolved',
      resolvedAt: new Date(),
      resolution: 'automatic',
    };

    expect(resolved.status).toBe('resolved');
    expect(resolved.resolution).toBe('automatic');
  });
});

describe('TrendInsight', () => {
  it('should create valid insight', () => {
    const insight: TrendInsight = {
      id: 'insight-001',
      metricId: 'metric-001',
      type: 'pattern',
      title: 'Weekly Seasonality Detected',
      description: 'Clear pattern of higher latency during weekday mornings',
      confidence: 0.92,
      generatedAt: new Date(),
      supportingData: {
        correlation: 0.85,
        sampleSize: 1000,
      },
      actions: ['Review morning peak capacity', 'Consider auto-scaling'],
    };

    expect(insight.type).toBe('pattern');
    expect(insight.supportingData).toBeDefined();
  });
});

describe('Request Types', () => {
  describe('CreateTrendMetricRequest', () => {
    it('should validate create request', () => {
      const request: CreateTrendMetricRequest = {
        name: 'New Metric',
        unit: 'requests/sec',
        direction: 'up',
        description: 'Request rate metric',
        target: 1000,
        tags: ['performance'],
      };

      expect(request.name).toBe('New Metric');
      // id, createdAt, updatedAt should not be present in create request
      expect('id' in request).toBe(false);
    });
  });

  describe('UpdateTrendMetricRequest', () => {
    it('should validate partial update', () => {
      const request: UpdateTrendMetricRequest = {
        name: 'Updated Name',
        target: 2000,
      };

      // All fields should be optional
      expect(request.name).toBeDefined();
      expect(request.unit).toBeUndefined();
    });
  });

  describe('TrendQueryParams', () => {
    it('should create query params', () => {
      const params: TrendQueryParams = {
        metricId: 'metric-001',
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
        aggregation: 'avg',
        interval: '1h',
        limit: 1000,
        offset: 0,
      };

      expect(params.limit).toBe(1000);
    });

    it('should handle minimal query', () => {
      const minimal: TrendQueryParams = {
        metricId: 'metric-001',
        start: new Date(),
        end: new Date(),
      };

      expect(minimal.aggregation).toBeUndefined();
    });
  });
});

describe('TrendApiResponse', () => {
  it('should create success response', () => {
    const response: TrendApiResponse<TrendMetric> = {
      success: true,
      data: {
        id: 'metric-001',
        name: 'Test Metric',
        unit: 'ms',
        direction: 'flat',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      meta: {
        requestId: 'req-001',
        timestamp: new Date(),
        duration: 45,
      },
    };

    expect(response.success).toBe(true);
    expect(response.error).toBeUndefined();
  });

  it('should create error response', () => {
    const errorResponse: TrendApiResponse<never> = {
      success: false,
      error: {
        code: 'METRIC_NOT_FOUND',
        message: 'The requested metric does not exist',
        details: { metricId: 'invalid-id' },
      },
      meta: {
        requestId: 'req-002',
        timestamp: new Date(),
        duration: 12,
      },
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.data).toBeUndefined();
  });
});

describe('TrendErrorCode', () => {
  it('should validate error codes', () => {
    const validCodes: TrendErrorCode[] = [
      'METRIC_NOT_FOUND',
      'INVALID_TIME_RANGE',
      'AGGREGATION_ERROR',
      'FORECAST_ERROR',
      'ALERT_CONFIG_ERROR',
      'RATE_LIMIT_EXCEEDED',
      'INTERNAL_ERROR',
    ];

    validCodes.forEach(code => {
      expect([
        'METRIC_NOT_FOUND',
        'INVALID_TIME_RANGE',
        'AGGREGATION_ERROR',
        'FORECAST_ERROR',
        'ALERT_CONFIG_ERROR',
        'RATE_LIMIT_EXCEEDED',
        'INTERNAL_ERROR',
      ]).toContain(code);
    });
  });
});

describe('TrendTimeRange', () => {
  it('should validate time range', () => {
    const range: TrendTimeRange = {
      start: new Date('2024-01-01T00:00:00Z'),
      end: new Date('2024-01-31T23:59:59Z'),
    };

    expect(range.start.getTime()).toBeLessThan(range.end.getTime());
  });

  it('should handle relative time ranges', () => {
    const relativeRange: TrendTimeRange = {
      start: new Date('2024-01-01'),
      end: new Date('2024-01-31'),
      timezone: 'America/New_York',
    };

    expect(relativeRange.timezone).toBe('America/New_York');
  });
});

/**
 * Edge case tests for robustness
 */
describe('Edge Cases', () => {
  it('should handle empty data arrays', () => {
    const emptySeries: TrendSeries = {
      metricId: 'metric-001',
      name: 'Empty Series',
      data: [],
      aggregation: 'avg',
      interval: '1h',
    };

    expect(emptySeries.data).toHaveLength(0);
  });

  it('should handle extreme values', () => {
    const extremePoint: TrendDataPoint = {
      timestamp: new Date(),
      value: Number.MAX_SAFE_INTEGER,
    };

    expect(extremePoint.value).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('should handle special characters in strings', () => {
    const metric: TrendMetric = {
      id: 'metric-special',
      name: 'Metric with "quotes" and \\backslashes\\',
      unit: 'μs', // Unicode character
      direction: 'up',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(metric.name).toContain('"');
    expect(metric.unit).toBe('μs');
  });

  it('should handle null-equivalent optional fields', () => {
    const metric: TrendMetric = {
      id: 'metric-minimal',
      name: 'Minimal',
      unit: 'count',
      direction: 'flat',
      description: undefined,
      target: undefined,
      threshold: undefined,
      tags: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(metric.description).toBeUndefined();
    expect(metric.tags).toBeUndefined();
  });
});