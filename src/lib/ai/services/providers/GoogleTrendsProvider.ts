// Layer: Service
// Path: src/lib/ai/services/providers/GoogleTrendsProvider.ts

import { z } from 'zod';
import { logger } from '@/lib/logging/logger';
import { BaseProvider, ProviderConfig, ProviderResult } from './BaseProvider';
import { TrendData, TrendQuery, TrendRegion, TrendTimeRange } from '@/lib/ai/types/trends';
import { GoogleTrendsConfig } from '@/lib/ai/config/providers';

// ============================================================================
// Types
// ============================================================================

/**
 * Schema for validating Google Trends API responses
 */
const GoogleTrendsResponseSchema = z.object({
  default: z.object({
    timelineData: z.array(
      z.object({
        time: z.string(),
        formattedTime: z.string(),
        formattedAxisTime: z.string(),
        value: z.array(z.number()),
        formattedValue: z.array(z.string()),
      })
    ),
    averages: z.array(z.number()).optional(),
  }),
  comparisonItem: z
    .array(
      z.object({
        keyword: z.string(),
        geo: z.string(),
        time: z.string(),
      })
    )
    .optional(),
});

type GoogleTrendsResponse = z.infer<typeof GoogleTrendsResponseSchema>;

/**
 * Internal representation of a trends query for the Google API
 */
interface GoogleTrendsQuery {
  keyword: string;
  geo: string;
  time: string;
  category?: number;
  property?: string;
}

// ============================================================================
// Constants
// ============================================================================

const GOOGLE_TRENDS_API_BASE = 'https://trends.googleapis.com/trends/api';
const GOOGLE_TRENDS_EXPLORE_URL = `${GOOGLE_TRENDS_API_BASE}/explore`;
const GOOGLE_TRENDS_WIDGET_URL = `${GOOGLE_TRENDS_API_BASE}/widgetdata/multiline`;

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const TIME_RANGE_MAP: Record<TrendTimeRange, string> = {
  '1h': 'now 1-H',
  '4h': 'now 4-H',
  '1d': 'now 1-d',
  '7d': 'now 7-d',
  '30d': 'today 1-m',
  '90d': 'today 3-m',
  '1y': 'today 12-m',
  '5y': 'today 5-y',
  all: 'all',
};

const REGION_MAP: Record<TrendRegion, string> = {
  worldwide: '',
  us: 'US',
  gb: 'GB',
  ca: 'CA',
  au: 'AU',
  de: 'DE',
  fr: 'FR',
  jp: 'JP',
  in: 'IN',
  br: 'BR',
};

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Custom error for Google Trends provider-specific failures
 */
class GoogleTrendsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = 'GoogleTrendsError';
  }
}

// ============================================================================
// Google Trends Provider Implementation
// ============================================================================

/**
 * Google Trends data provider for fetching search trend data.
 *
 * This provider interfaces with the unofficial Google Trends API to retrieve
 * interest over time data for specified keywords. Note that this uses the
 * same endpoints as the Google Trends web interface and may be subject to
 * rate limiting and changes without notice.
 *
 * @example
 *