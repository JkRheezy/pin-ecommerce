import { logger } from '$lib/utils/logger';
import type { GoogleTrendsConfig, TrendingSearch, TrendingTopic } from '$lib/ai/types/GoogleTrendsTypes';
import { GOOGLE_TRENDS_CONFIG } from '$lib/ai/config/GoogleTrendsConfig';

/**
 * Service layer for Google Trends API interactions
 * Handles fetching and processing of trending search data
 * 
 * Architecture: Service Layer (Layer 4)
 * - Depends on: Config (Layer 2), Types (Layer 1)
 * - Used by: Runtime (Layer 5), UI (Layer 6)
 */
export class GoogleTrendsService {
  private readonly config: GoogleTrendsConfig;
  private readonly baseUrl: string;

  constructor(config: GoogleTrendsConfig = GOOGLE_TRENDS_CONFIG) {
    this.config = config;
    this.baseUrl = config.apiBaseUrl;
    
    logger.info('GoogleTrendsService initialized', { 
      geo: config.defaultGeo,
      category: config.defaultCategory 
    });
  }

  /**
   * Fetches daily trending searches for a specific region
   * @param geo - Geographic region code (e.g., 'US', 'GB', 'IN')
   * @param date - Optional date for historical data (YYYY-MM-DD format)
   * @returns Promise<TrendingSearch[]> - Array of trending searches
   * @throws Error when API request fails or response is invalid
   */
  async getDailyTrends(
    geo: string = this.config.defaultGeo,
    date?: string
  ): Promise<TrendingSearch[]> {
    // Validate inputs
    if (!this.isValidGeoCode(geo)) {
      logger.error('Invalid geo code provided', { geo });
      throw new Error(`Invalid geo code: ${geo}`);
    }

    if (date && !this.isValidDateFormat(date)) {
      logger.error('Invalid date format provided', { date });
      throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
    }

    const url = this.buildTrendsUrl('dailytrends', { geo, date });

    try {
      logger.debug('Fetching daily trends', { geo, date, url });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}, message: ${response.statusText}`);
      }

      const rawData = await response.json();
      const trends = this.parseDailyTrendsResponse(rawData);

      logger.info('Successfully fetched daily trends', { 
        geo, 
        count: trends.length,
        date: date || 'today' 
      });

      return trends;

    } catch (error) {
      logger.error('Failed to fetch daily trends', { 
        geo, 
        date, 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      throw new GoogleTrendsError(
        `Failed to fetch daily trends for ${geo}`,
        'FETCH_DAILY_TRENDS_ERROR',
        { geo, date, originalError: error }
      );
    }
  }

  /**
   * Fetches real-time trending topics
   * @param geo - Geographic region code
   * @param category - Topic category (e.g., 'b', 'e', 'm' for business, entertainment, health)
   * @returns Promise<TrendingTopic[]> - Array of real-time trending topics
   */
  async getRealtimeTrends(
    geo: string = this.config.defaultGeo,
    category: string = this.config.defaultCategory
  ): Promise<TrendingTopic[]> {
    if (!this.isValidGeoCode(geo)) {
      logger.error('Invalid geo code for realtime trends', { geo });
      throw new Error(`Invalid geo code: ${geo}`);
    }

    const url = this.buildTrendsUrl('realtimetrends', { geo, category });

    try {
      logger.debug('Fetching realtime trends', { geo, category });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const rawData = await response.json();
      const topics = this.parseRealtimeTrendsResponse(rawData);

      logger.info('Successfully fetched realtime trends', { 
        geo, 
        category, 
        count: topics.length 
      });

      return topics;

    } catch (error) {
      logger.error('Failed to fetch realtime trends', { 
        geo, 
        category, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      throw new GoogleTrendsError(
        `Failed to fetch realtime trends for ${geo}`,
        'FETCH_REALTIME_TRENDS_ERROR',
        { geo, category, originalError: error }
      );
    }
  }

  /**
   * Searches for interest over time data for specific keywords
   * @param keywords - Array of search terms to compare
   * @param geo - Geographic region
   * @param timeframe - Time range (e.g., 'today 5-y', 'today 12-m', 'now 7-d')
   * @returns Promise<Record<string, number[]>> - Interest data by keyword
   */
  async getInterestOverTime(
    keywords: string[],
    geo: string = this.config.defaultGeo,
    timeframe: string = 'today 12-m'
  ): Promise<Record<string, number[]>> {
    // Validate inputs
    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('Keywords must be a non-empty array');
    }

    if (keywords.length > 5) {
      logger.warn('Too many keywords, Google Trends limits to 5', { count: keywords.length });
      keywords = keywords.slice(0, 5);
    }

    const sanitizedKeywords = keywords.map(k => this.sanitizeKeyword(k));

    const url = this.buildTrendsUrl('interestOverTime', {
      keywords: sanitizedKeywords,
      geo,
      timeframe,
    });

    try {
      logger.debug('Fetching interest over time', { keywords: sanitizedKeywords, geo, timeframe });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const rawData = await response.json();
      const interestData = this.parseInterestOverTimeResponse(rawData, sanitizedKeywords);

      logger.info('Successfully fetched interest over time', { 
        keywords: sanitizedKeywords, 
        dataPoints: Object.values(interestData)[0]?.length || 0 
      });

      return interestData;

    } catch (error) {
      logger.error('Failed to fetch interest over time', { 
        keywords, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      throw new GoogleTrendsError(
        'Failed to fetch interest over time data',
        'FETCH_INTEREST_ERROR',
        { keywords, geo, timeframe, originalError: error }
      );
    }
  }

  /**
   * Builds the complete API URL with query parameters
   * @param endpoint - API endpoint name
   * @param params - Query parameters
   * @returns string - Complete URL
   */
  private buildTrendsUrl(
    endpoint: string,
    params: Record<string, string | string[] | undefined>
  ): string {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined) return;
      
      if (Array.isArray(value)) {
        value.forEach(v => url.searchParams.append(key, v));
      } else {
        url.searchParams.set(key, value);
      }
    });

    // Add API key if configured
    if (this.config.apiKey) {
      url.searchParams.set('key', this.config.apiKey);
    }

    return url.toString();
  }

  /**
   * Parses the daily trends API response into typed TrendingSearch objects
   * @param rawData - Raw API response
   * @returns TrendingSearch[] - Parsed trending searches
   */
  private parseDailyTrendsResponse(rawData: unknown): TrendingSearch[] {
    if (!rawData || typeof rawData !== 'object') {
      throw new Error('Invalid response format: expected object');
    }

    const data = rawData as Record<string, unknown>;
    const trendingDays = data.default?.trendingSearchesDays as Array<Record<string, unknown>> | undefined;

    if (!Array.isArray(trendingDays) || trendingDays.length === 0) {
      logger.warn('No trending days found in response');
      return [];
    }

    // Flatten all trending searches from all days, most recent first
    const allSearches: TrendingSearch[] = [];

    trendingDays.forEach(day => {
      const searches = day.trendingSearches as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(searches)) return;

      searches.forEach((search, index) => {
        const parsed = this.parseSingleTrendingSearch(search, index);
        if (parsed) {
          allSearches.push(parsed);
        }
      });
    });

    return allSearches.slice(0, this.config.maxResults);
  }

  /**
   * Parses a single trending search item from API response
   */
  private parseSingleTrendingSearch(
    search: Record<string, unknown>,
    rank: number
  ): TrendingSearch | null {
    try {
      const title = this.extractTitle(search);
      const traffic = this.extractTraffic(search);

      return {
        title,
        rank: rank + 1,
        traffic: traffic || undefined,
        relatedQueries: this.extractRelatedQueries(search),
        articles: this.extractArticles(search),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.warn('Failed to parse trending search item', { search, error });
      return null;
    }
  }

  /**
   * Parses realtime trends response
   */
  private parseRealtimeTrendsResponse(rawData: unknown): TrendingTopic[] {
    if (!rawData || typeof rawData !== 'object') {
      throw new Error('Invalid realtime trends response format');
    }

    const data = rawData as Record<string, unknown>;
    const storySummaries = data.storySummaries?.trendingStories as Array<Record<string, unknown>> | undefined;

    if (!Array.isArray(storySummaries)) {
      return [];
    }

    return storySummaries
      .map((story, index) => this.parseSingleTrendingTopic(story, index))
      .filter((topic): topic is TrendingTopic => topic !== null)
      .slice(0, this.config.maxResults);
  }

  /**
   * Parses a single trending topic from realtime data
   */
  private parseSingleTrendingTopic(
    story: Record<string, unknown>,
    rank: number
  ): TrendingTopic | null {
    try {
      const title = story.title as string | undefined;
      if (!title) return null;

      return {
        title,
        rank: rank + 1,
        entityNames: (story.entityNames as string[]) || [],
        imageUrl: (story.image?.imageUrl as string) || undefined,
        articles: this.extractArticles(story),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.warn('Failed to parse trending topic', { story, error });
      return null;
    }
  }

  /**
   * Parses interest over time response
   */
  private parseInterestOverTimeResponse(
    rawData: unknown,
    keywords: string[]
  ): Record<string, number[]> {
    if (!rawData || typeof rawData !== 'object') {
      throw new Error('Invalid interest over time response format');
    }

    const data = rawData as Record<string, unknown>;
    const timelineData = data.default?.timelineData as Array<Record<string, unknown>> | undefined;

    if (!Array.isArray(timelineData)) {
      return {};
    }

    // Initialize result with empty arrays for each keyword
    const result: Record<string, number[]> = {};
    keywords.forEach(k => result[k] = []);

    timelineData.forEach(point => {
      const values = point.value as number[] | undefined;
      if (!Array.isArray(values)) return;

      values.forEach((val, idx) => {
        const keyword = keywords[idx];
        if (keyword && typeof val === 'number') {
          result[keyword].push(val);
        }
      });
    });

    return result;
  }

  // Helper extraction methods

  private extractTitle(search: Record<string, unknown>): string {
    const titleObj = search.title as Record<string, unknown> | undefined;
    return (titleObj?.query as string) || 'Unknown';
  }

  private extractTraffic(search: Record<string, unknown>): string | null {
    const formattedTraffic = search.formattedTraffic as string | undefined;
    return formattedTraffic || null;
  }

  private extractRelatedQueries(search: Record<string, unknown>): string[] {
    const queries = search.relatedQueries as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(queries)) return [];
    
    return queries
      .map(q => q.query as string)
      .filter((q): q is string => typeof q === 'string');
  }

  private extractArticles(search: Record<string, unknown>): Array<{ title: string; url: string; source: string }> {
    const articles = search.articles as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(articles)) return [];

    return articles
      .map(article => ({
        title: (article.title as string) || 'Untitled',
        url: (article.url as string) || '',
        source: (article.source as string) || 'Unknown',
      }))
      .filter(a => a.url); // Only include articles with valid URLs
  }

  // Validation helpers

  private isValidGeoCode(geo: string): boolean {
    // Basic validation: 2-letter country codes or special codes like 'US-CA-123'
    return /^[A-Z]{2}(-[A-Z]{2}(-\d+)?)?$/.test(geo);
  }

  private isValidDateFormat(date: string): boolean {
    // YYYY-MM-DD format
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date));
  }

  private sanitizeKeyword(keyword: string): string {
    // Remove potentially harmful characters, limit length
    return keyword
      .trim()
      .replace(/[<>\"']/g, '')
      .slice(0, 100);
  }
}

/**
 * Custom error class for Google Trends specific errors
 * Provides structured error information for better debugging
 */
export class GoogleTrendsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GoogleTrendsError';
    
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GoogleTrendsError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack,
    };
  }
}

// Export singleton instance for common use case
export const googleTrendsService = new GoogleTrendsService();