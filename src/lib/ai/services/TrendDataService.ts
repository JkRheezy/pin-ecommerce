/**
 * TrendDataService.ts
 * 
 * Service layer for fetching and managing trend data for AI-powered insights.
 * Follows the six-layer architecture: Types → Config → Repo → Service → Runtime → UI
 * 
 * Layer: Service (Layer 4)
 */

import { logger } from '$lib/logging/logger';
import type { TrendData, TrendQueryParams, TrendTimeRange } from '$lib/ai/types/TrendDataTypes';
import { TrendDataRepository } from '$lib/ai/repo/TrendDataRepository';
import { TrendServiceConfig } from '$lib/ai/config/TrendServiceConfig';
import { ValidationError, ServiceError } from '$lib/errors/CustomErrors';

/**
 * Interface defining the contract for trend data operations.
 * Implementations should handle data fetching, caching, and transformation.
 */
export interface ITrendDataService {
	/**
	 * Fetches trend data for a given metric and time range.
	 * @param params - Query parameters for trend data
	 * @returns Promise resolving to trend data
	 * @throws ValidationError if params are invalid
	 * @throws ServiceError if data fetching fails
	 */
	getTrendData(params: TrendQueryParams): Promise<TrendData>;

	/**
	 * Fetches aggregated trends across multiple metrics.
	 * @param metricIds - Array of metric identifiers
	 * @param timeRange - Time range for aggregation
	 * @returns Promise resolving to aggregated trend data
	 */
	getAggregatedTrends(metricIds: string[], timeRange: TrendTimeRange): Promise<TrendData[]>;

	/**
	 * Invalidates cached trend data for specified metrics.
	 * @param metricIds - Optional array of metric IDs to invalidate; if omitted, clears all
	 */
	invalidateCache(metricIds?: string[]): void;
}

/**
 * Implementation of ITrendDataService with caching and error handling.
 */
export class TrendDataService implements ITrendDataService {
	private readonly repository: TrendDataRepository;
	private readonly config: TrendServiceConfig;
	private cache: Map<string, { data: TrendData; timestamp: number }>;
	private readonly cacheTtlMs: number;

	constructor(
		repository: TrendDataRepository,
		config: TrendServiceConfig,
		cacheTtlMs: number = 300000 // 5 minutes default
	) {
		this.repository = repository;
		this.config = config;
		this.cache = new Map();
		this.cacheTtlMs = cacheTtlMs;

		logger.info('TrendDataService initialized', { cacheTtlMs });
	}

	/**
	 * @inheritdoc
	 */
	async getTrendData(params: TrendQueryParams): Promise<TrendData> {
		// Validate input parameters
		this.validateQueryParams(params);

		const cacheKey = this.generateCacheKey(params);

		// Check cache for valid entry
		const cached = this.getCachedEntry(cacheKey);
		if (cached) {
			logger.debug('Returning cached trend data', { metricId: params.metricId });
			return cached;
		}

		try {
			// Fetch from repository with timeout protection
			const data = await this.fetchWithTimeout(
				this.repository.fetchTrendData(params),
				this.config.requestTimeoutMs
			);

			// Cache the result
			this.setCacheEntry(cacheKey, data);

			logger.info('Trend data fetched successfully', {
				metricId: params.metricId,
				dataPoints: data.points.length
			});

			return data;
		} catch (error) {
			logger.error('Failed to fetch trend data', {
				metricId: params.metricId,
				error: error instanceof Error ? error.message : 'Unknown error'
			});

			throw new ServiceError(
				`Failed to fetch trend data for metric ${params.metricId}`,
				{ cause: error }
			);
		}
	}

	/**
	 * @inheritdoc
	 */
	async getAggregatedTrends(
		metricIds: string[],
		timeRange: TrendTimeRange
	): Promise<TrendData[]> {
		// Validate inputs
		if (!metricIds?.length) {
			throw new ValidationError('At least one metric ID is required');
		}
		this.validateTimeRange(timeRange);

		// Deduplicate metric IDs to prevent redundant fetches
		const uniqueIds = [...new Set(metricIds)];

		// Fetch all trends in parallel with individual error handling
		const results = await Promise.allSettled(
			uniqueIds.map((id) =>
				this.getTrendData({
					metricId: id,
					timeRange,
					granularity: this.config.defaultGranularity
				})
			)
		);

		// Process results, logging failures but returning successful fetches
		const successful: TrendData[] = [];
		const failures: string[] = [];

		results.forEach((result, index) => {
			const metricId = uniqueIds[index];
			if (result.status === 'fulfilled') {
				successful.push(result.value);
			} else {
				failures.push(metricId);
				logger.warn('Failed to fetch trend for aggregation', {
					metricId,
					reason: result.reason
				});
			}
		});

		// Partial success is acceptable, but log if all failed
		if (successful.length === 0) {
			throw new ServiceError('All trend data fetches failed for aggregation');
		}

		if (failures.length > 0) {
			logger.info('Partial aggregation success', {
				successful: successful.length,
				failed: failures.length
			});
		}

		return successful;
	}

	/**
	 * @inheritdoc
	 */
	invalidateCache(metricIds?: string[]): void {
		if (!metricIds) {
			const size = this.cache.size;
			this.cache.clear();
			logger.info('Cache cleared completely', { entriesCleared: size });
			return;
		}

		let clearedCount = 0;
		for (const id of metricIds) {
			// Remove all cache entries matching this metric ID
			for (const [key, entry] of this.cache.entries()) {
				if (key.includes(`:${id}:`)) {
					this.cache.delete(key);
					clearedCount++;
				}
			}
		}

		logger.info('Cache invalidated for metrics', {
			metricIds,
			entriesCleared: clearedCount
		});
	}

	/**
	 * Validates query parameters according to business rules.
	 * @throws ValidationError if validation fails
	 */
	private validateQueryParams(params: TrendQueryParams): void {
		if (!params?.metricId?.trim()) {
			throw new ValidationError('metricId is required and cannot be empty');
		}

		if (!params.timeRange) {
			throw new ValidationError('timeRange is required');
		}

		this.validateTimeRange(params.timeRange);

		// Validate granularity if provided
		if (params.granularity !== undefined && params.granularity < 1) {
			throw new ValidationError('granularity must be a positive integer');
		}
	}

	/**
	 * Validates time range constraints.
	 * @throws ValidationError if time range is invalid
	 */
	private validateTimeRange(timeRange: TrendTimeRange): void {
		const { start, end } = timeRange;

		if (!start || !end) {
			throw new ValidationError('timeRange must have both start and end dates');
		}

		if (start > end) {
			throw new ValidationError('start date must be before or equal to end date');
		}

		const maxRangeMs = this.config.maxTimeRangeDays * 24 * 60 * 60 * 1000;
		if (end.getTime() - start.getTime() > maxRangeMs) {
			throw new ValidationError(
				`timeRange exceeds maximum of ${this.config.maxTimeRangeDays} days`
			);
		}

		// Prevent future dates beyond reasonable buffer
		const now = new Date();
		const bufferMs = 24 * 60 * 60 * 1000; // 1 day buffer
		if (end.getTime() > now.getTime() + bufferMs) {
			throw new ValidationError('end date cannot be in the future');
		}
	}

	/**
	 * Generates a deterministic cache key from query parameters.
	 */
	private generateCacheKey(params: TrendQueryParams): string {
		const granularity = params.granularity ?? this.config.defaultGranularity;
		return `trend:${params.metricId}:${params.timeRange.start.toISOString()}:${params.timeRange.end.toISOString()}:${granularity}`;
	}

	/**
	 * Retrieves cached entry if it exists and is not expired.
	 */
	private getCachedEntry(key: string): TrendData | null {
		const entry = this.cache.get(key);
		if (!entry) return null;

		const isExpired = Date.now() - entry.timestamp > this.cacheTtlMs;
		if (isExpired) {
			this.cache.delete(key);
			return null;
		}

		return entry.data;
	}

	/**
	 * Stores data in cache with current timestamp.
	 */
	private setCacheEntry(key: string, data: TrendData): void {
		// Enforce maximum cache size with LRU eviction
		if (this.cache.size >= this.config.maxCacheEntries) {
			const oldestKey = this.cache.keys().next().value;
			this.cache.delete(oldestKey);
			logger.debug('Evicted oldest cache entry', { evictedKey: oldestKey });
		}

		this.cache.set(key, { data, timestamp: Date.now() });
	}

	/**
	 * Wraps a promise with a timeout to prevent hanging requests.
	 */
	private async fetchWithTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number
	): Promise<T> {
		return Promise.race([
			promise,
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error(`Request timeout after ${timeoutMs}ms`)),
					timeoutMs
				)
			)
		]);
	}
}

/**
 * Factory function for creating TrendDataService instances.
 * Preferred over direct constructor for dependency injection scenarios.
 */
export function createTrendDataService(
	repository?: TrendDataRepository,
	config?: TrendServiceConfig
): ITrendDataService {
	const repo = repository ?? new TrendDataRepository();
	const cfg = config ?? new TrendServiceConfig();
	return new TrendDataService(repo, cfg);
}