/**
 * PickerAgent - Main implementation for the Picker AI Agent
 * 
 * Layer: Service (Layer 4)
 * Responsibilities:
 * - Orchestrates the picking workflow for AI-driven feature selection
 * - Coordinates between repository layer (data access) and runtime layer (execution)
 * - Handles agent lifecycle, state management, and error recovery
 */

import { z } from 'zod';
import { Logger } from 'winston';

import { Types } from '../../types';
import { Config } from '../../config';
import { Repo } from '../../repo';
import { Runtime } from '../../runtime';

// =============================================================================
// TYPES (Layer 1) - Domain types specific to PickerAgent
// =============================================================================

/**
 * Represents the possible states of a picker agent session
 */
export enum PickerAgentState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SELECTING = 'SELECTING',
  VALIDATING = 'VALIDATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * Configuration for the picker agent behavior
 */
export interface PickerAgentConfig {
  /** Maximum number of options to consider */
  maxOptions: number;
  /** Confidence threshold for automatic selection (0-1) */
  confidenceThreshold: number;
  /** Timeout for analysis phase in milliseconds */
  analysisTimeoutMs: number;
  /** Whether to require human approval for selections */
  requireHumanApproval: boolean;
  /** Strategy for handling ties in scoring */
  tieBreakStrategy: 'first' | 'random' | 'highest-confidence';
}

/**
 * Input context for a picking operation
 */
export interface PickerContext {
  /** Unique identifier for this picking session */
  sessionId: string;
  /** Description of what needs to be picked */
  query: string;
  /** Available options to choose from */
  options: PickerOption[];
  /** Additional constraints or preferences */
  constraints?: PickerConstraint[];
  /** Previous selections for context */
  history?: PickerSelection[];
}

/**
 * An available option for selection
 */
export interface PickerOption {
  /** Unique identifier for this option */
  id: string;
  /** Display label */
  label: string;
  /** Structured data for the option */
  metadata: Record<string, unknown>;
  /** Pre-computed relevance score if available */
  precomputedScore?: number;
}

/**
 * Constraint to apply during selection
 */
export interface PickerConstraint {
  /** Type of constraint */
  type: 'exclude' | 'require' | 'prefer' | 'weight';
  /** Target option ID or pattern */
  target: string;
  /** Constraint value or weight */
  value?: number | string | string[];
}

/**
 * A previous selection for context
 */
export interface PickerSelection {
  optionId: string;
  timestamp: Date;
  confidence: number;
  wasAccepted: boolean;
}

/**
 * Result of the picking operation
 */
export interface PickerResult {
  /** Selected option ID */
  selectedOptionId: string;
  /** Confidence score for the selection (0-1) */
  confidence: number;
  /** Reasoning for the selection */
  reasoning: string;
  /** Scores for all considered options */
  optionScores: Record<string, number>;
  /** Whether human approval is required */
  requiresApproval: boolean;
  /** Alternative options if selection is rejected */
  alternatives: string[];
}

/**
 * Error types specific to picker operations
 */
export class PickerAgentError extends Error {
  constructor(
    message: string,
    public readonly code: PickerErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PickerAgentError';
  }
}

export enum PickerErrorCode {
  INVALID_CONTEXT = 'INVALID_CONTEXT',
  NO_OPTIONS = 'NO_OPTIONS',
  ANALYSIS_TIMEOUT = 'ANALYSIS_TIMEOUT',
  ALL_OPTIONS_EXCLUDED = 'ALL_OPTIONS_EXCLUDED',
  CONFIDENCE_TOO_LOW = 'CONFIDENCE_TOO_LOW',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// =============================================================================
// CONFIG (Layer 2) - Configuration validation and defaults
// =============================================================================

const PickerAgentConfigSchema = z.object({
  maxOptions: z.number().int().min(1).max(100).default(10),
  confidenceThreshold: z.number().min(0).max(1).default(0.85),
  analysisTimeoutMs: z.number().int().min(1000).max(300000).default(30000),
  requireHumanApproval: z.boolean().default(false),
  tieBreakStrategy: z.enum(['first', 'random', 'highest-confidence']).default('highest-confidence'),
});

const PickerContextSchema = z.object({
  sessionId: z.string().uuid(),
  query: z.string().min(1).max(5000),
  options: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    metadata: z.record(z.unknown()),
    precomputedScore: z.number().optional(),
  })).min(1),
  constraints: z.array(z.object({
    type: z.enum(['exclude', 'require', 'prefer', 'weight']),
    target: z.string(),
    value: z.union([z.number(), z.string(), z.array(z.string())]).optional(),
  })).optional(),
  history: z.array(z.object({
    optionId: z.string(),
    timestamp: z.date(),
    confidence: z.number(),
    wasAccepted: z.boolean(),
  })).optional(),
});

// =============================================================================
// REPO (Layer 3) - Data access layer for picker operations
// =============================================================================

/**
 * Repository for persisting and retrieving picker agent state
 */
export interface PickerAgentRepository {
  /** Save the current state of a picker session */
  saveSession(sessionId: string, state: PickerAgentState, data: unknown): Promise<void>;
  /** Load a previously saved picker session */
  loadSession(sessionId: string): Promise<{ state: PickerAgentState; data: unknown } | null>;
  /** Record a selection result for analytics and learning */
  recordSelection(result: PickerResult & { sessionId: string; context: PickerContext }): Promise<void>;
  /** Get historical performance metrics */
  getPerformanceMetrics(sessionId: string): Promise<{ avgConfidence: number; acceptanceRate: number }>;
}

/**
 * In-memory implementation for testing and development
 */
export class InMemoryPickerRepository implements PickerAgentRepository {
  private sessions = new Map<string, { state: PickerAgentState; data: unknown }>();
  private selections: Array<PickerResult & { sessionId: string; context: PickerContext }> = [];

  async saveSession(sessionId: string, state: PickerAgentState, data: unknown): Promise<void> {
    this.sessions.set(sessionId, { state, data });
  }

  async loadSession(sessionId: string): Promise<{ state: PickerAgentState; data: unknown } | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async recordSelection(result: PickerResult & { sessionId: string; context: PickerContext }): Promise<void> {
    this.selections.push(result);
  }

  async getPerformanceMetrics(sessionId: string): Promise<{ avgConfidence: number; acceptanceRate: number }> {
    const relevant = this.selections.filter(s => s.sessionId === sessionId);
    if (relevant.length === 0) {
      return { avgConfidence: 0, acceptanceRate: 0 };
    }
    const avgConfidence = relevant.reduce((sum, s) => sum + s.confidence, 0) / relevant.length;
    // For in-memory, we don't track acceptance, so return 1.0 as optimistic default
    return { avgConfidence, acceptanceRate: 1.0 };
  }
}

// =============================================================================
// SERVICE (Layer 4) - Main PickerAgent implementation
// =============================================================================

/**
 * PickerAgent - Service layer implementation for AI-driven feature selection
 * 
 * This agent analyzes available options against a query and constraints to make
 * intelligent selections with confidence scoring and explainability.
 */
export class PickerAgent {
  private state: PickerAgentState = PickerAgentState.IDLE;
  private readonly config: PickerAgentConfig;
  private abortController: AbortController | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly repository: PickerAgentRepository,
    private readonly runtime: Runtime.AIEngine,
    config?: Partial<PickerAgentConfig>
  ) {
    // Validate and merge configuration with defaults
    const validationResult = PickerAgentConfigSchema.safeParse(config ?? {});
    if (!validationResult.success) {
      throw new PickerAgentError(
        `Invalid picker agent configuration: ${validationResult.error.message}`,
        PickerErrorCode.INVALID_CONTEXT
      );
    }
    this.config = validationResult.data;
    
    this.logger.info('PickerAgent initialized', {
      maxOptions: this.config.maxOptions,
      confidenceThreshold: this.config.confidenceThreshold,
    });
  }

  /**
   * Get the current state of the agent
   */
  getState(): PickerAgentState {
    return this.state;
  }

  /**
   * Execute a picking operation with the given context
   * 
   * @param context - The picking context including query, options, and constraints
   * @returns The selection result with confidence and reasoning
   * @throws PickerAgentError if the operation cannot complete successfully
   */
  async pick(context: PickerContext): Promise<PickerResult> {
    // Validate input context
    const validationResult = PickerContextSchema.safeParse(context);
    if (!validationResult.success) {
      throw new PickerAgentError(
        `Invalid picker context: ${validationResult.error.message}`,
        PickerErrorCode.INVALID_CONTEXT,
        { errors: validationResult.error.errors }
      );
    }

    // Check for empty options after potential filtering
    if (context.options.length === 0) {
      throw new PickerAgentError(
        'No options provided for selection',
        PickerErrorCode.NO_OPTIONS
      );
    }

    // Limit options to configured maximum for performance
    const limitedOptions = context.options.slice(0, this.config.maxOptions);
    
    this.logger.info('Starting pick operation', {
      sessionId: context.sessionId,
      optionCount: limitedOptions.length,
      constraintCount: context.constraints?.length ?? 0,
    });

    // Create abort controller for timeout handling
    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.config.analysisTimeoutMs);

    try {
      // Phase 1: Analyze options against query and constraints
      this.state = PickerAgentState.ANALYZING;
      await this.repository.saveSession(context.sessionId, this.state, { phase: 'analysis' });

      const analysisResult = await this.analyzeOptions(
        context.query,
        limitedOptions,
        context.constraints ?? [],
        context.history ?? [],
        this.abortController.signal
      );

      // Phase 2: Score and rank options
      this.state = PickerAgentState.SELECTING;
      await this.repository.saveSession(context.sessionId, this.state, { phase: 'selection' });

      const scoredOptions = this.scoreOptions(analysisResult, context.constraints ?? []);
      const rankedOptions = this.rankOptions(scoredOptions);

      // Phase 3: Validate and finalize selection
      this.state = PickerAgentState.VALIDATING;
      await this.repository.saveSession(context.sessionId, this.state, { phase: 'validation' });

      const result = this.finalizeSelection(rankedOptions, context);

      // Record successful selection
      await this.repository.recordSelection({
        ...result,
        sessionId: context.sessionId,
        context,
      });

      this.state = PickerAgentState.COMPLETED;
      await this.repository.saveSession(context.sessionId, this.state, { result });

      this.logger.info('Pick operation completed', {
        sessionId: context.sessionId,
        selectedOption: result.selectedOptionId,
        confidence: result.confidence,
        requiresApproval: result.requiresApproval,
      });

      return result;

    } catch (error) {
      this.state = PickerAgentState.FAILED;
      await this.repository.saveSession(context.sessionId, this.state, { error: String(error) });

      if (error instanceof PickerAgentError) {
        throw error;
      }

      // Handle timeout specifically
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PickerAgentError(
          'Analysis phase exceeded timeout',
          PickerErrorCode.ANALYSIS_TIMEOUT,
          { timeoutMs: this.config.analysisTimeoutMs }
        );
      }

      this.logger.error('Unexpected error in pick operation', {
        sessionId: context.sessionId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw new PickerAgentError(
        'Internal error during pick operation',
        PickerErrorCode.INTERNAL_ERROR,
        { originalError: String(error) }
      );

    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }

  /**
   * Cancel an in-progress picking operation
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.logger.info('Pick operation cancelled by user');
    }
  }

  /**
   * Analyze options using the AI runtime to understand relevance to query
   * 
   * This delegates to the runtime layer for actual AI model interaction while
   * handling the orchestration and context preparation at the service layer.
   */
  private async analyzeOptions(
    query: string,
    options: PickerOption[],
    constraints: PickerConstraint[],
    history: PickerSelection[],
    signal: AbortSignal
  ): Promise<Map<string, Runtime.AnalysisResult>> {
    // Build analysis prompt with constraints and history context
    const prompt = this.buildAnalysisPrompt(query, options, constraints, history);

    try {
      // Delegate to runtime layer for AI processing
      const results = await this.runtime.analyzeBatch(
        options.map(opt => ({
          id: opt.id,
          content: this.serializeOption(opt),
          precomputedScore: opt.precomputedScore,
        })),
        prompt,
        { signal }
      );

      const resultMap = new Map<string, Runtime.AnalysisResult>();
      for (const result of results) {
        resultMap.set(result.id, result);
      }

      return resultMap;

    } catch (error) {
      this.logger.error('Analysis phase failed', { error: String(error) });
      throw error;
    }
  }

  /**
   * Build the analysis prompt incorporating all context
   */
  private buildAnalysisPrompt(
    query: string,
    options: PickerOption[],
    constraints: PickerConstraint[],
    history: PickerSelection[]
  ): string {
    const parts: string[] = [
      `Query: ${query}`,
      '',
      `Available options (${options.length}):`,
      ...options.map(o => `- ${o.id}: ${o.label}`),
    ];

    if (constraints.length > 0) {
      parts.push('', 'Constraints:');
      for (const c of constraints) {
        parts.push(`- ${c.type}: ${c.target}${c.value !== undefined ? ` = ${c.value}` : ''}`);
      }
    }

    if (history.length > 0) {
      parts.push('', 'Previous selections:');
      for (const h of history.slice(-5)) { // Last 5 for context window
        parts.push(`- ${h.optionId} (confidence: ${h.confidence.toFixed(2)}, accepted: ${h.wasAccepted})`);
      }
    }

    parts.push(
      '',
      'Analyze each option for relevance to the query. Consider constraints and history.',
      'Return a relevance score (0-1) and brief reasoning for each option.'
    );

    return parts.join('\n');
  }

  /**
   * Serialize option metadata for AI analysis
   */
  private serializeOption(option: PickerOption): string {
    const metadataStr = Object.entries(option.metadata)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    return `${option.label} [${metadataStr}]`;
  }

  /**
   * Apply constraint-based scoring adjustments to analysis results
   */
  private scoreOptions(
    analysisResults: Map<string, Runtime.AnalysisResult>,
    constraints: PickerConstraint[]
  ): Map<string, number> {
    const scores = new Map<string, number>();

    for (const [optionId, analysis] of analysisResults) {
      let score = analysis.relevanceScore;

      // Apply constraint adjustments
      for (const constraint of constraints) {
        const applies = this.constraintApplies(constraint, optionId, analysis);
        
        switch (constraint.type) {
          case 'exclude':
            if (applies) score = -Infinity;
            break;
          case 'require':
            if (!applies) score = -Infinity;
            break;
          case 'prefer':
            if (applies) score *= 1.2; // 20% boost
            break;
          case 'weight':
            if (applies && typeof constraint.value === 'number') {
              score *= constraint.value;
            }
            break;
        }
      }

      scores.set(optionId, score);
    }

    return scores;
  }

  /**
   * Check if a constraint applies to a given option
   */
  private constraintApplies(
    constraint: PickerConstraint,
    optionId: string,
    analysis: Runtime.AnalysisResult
  ): boolean {
    // Direct ID match
    if (constraint.target === optionId) return true;
    
    // Pattern match (simple substring for now, could be regex)
    if (optionId.includes(constraint.target)) return true;
    
    // Metadata match
    if (analysis.matchedKeywords?.includes(constraint.target)) return true;

    return false;
  }

  /**
   * Rank options by score and apply tie-breaking
   */
  private rankOptions(scores: Map<string, number>): Array<{ id: string; score: number }> {
    // Filter out excluded options (-Infinity)
    const validEntries = Array.from(scores.entries())
      .filter(([, score]) => score > -Infinity)
      .map(([id, score]) => ({ id, score }));

    if (validEntries.length === 0) {
      throw new PickerAgentError(
        'All options were excluded by constraints',
        PickerErrorCode.ALL_OPTIONS_EXCLUDED
      );
    }

    // Sort by score descending
    validEntries.sort((a, b) => b.score - a.score);

    // Apply tie-breaking if needed
    const result: Array<{ id: string; score: number }> = [];
    let i = 0;
    while (i < validEntries.length) {
      const currentScore = validEntries[i].score;
      const tiedGroup: Array<{ id: string; score: number }> = [];
      
      // Collect all entries with the same score
      while (i < validEntries.length && Math.abs(validEntries[i].score - currentScore) < 0.001) {
        tiedGroup.push(validEntries[i]);
        i++;
      }

      // Apply tie-break strategy
      if (tiedGroup.length > 1) {
        this.breakTies(tiedGroup);
      }
      
      result.push(...tiedGroup);
    }

    return result;
  }

  /**
   * Break ties according to configured strategy
   */
  private breakTies(group: Array<{ id: string; score: number }>): void {
    switch (this.config.tieBreakStrategy) {
      case 'first':
        // Already sorted by original order, no change needed
        break;
      case 'random':
        // Fisher-Yates shuffle for the tied group
        for (let i = group.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [group[i], group[j]] = [group[j], group[i]];
        }
        break;
      case 'highest-confidence':
        // Keep original order (already sorted by confidence from runtime)
        break;
    }
  }

  /**
   * Finalize the selection result with validation and approval logic
   */
  private finalizeSelection(
    rankedOptions: Array<{ id: string; score: number }>,
    context: PickerContext
  ): PickerResult {
    const topOption = rankedOptions[0];
    const confidence = Math.min(Math.max(topOption.score, 0), 1); // Clamp to [0, 1]

    // Determine if approval is required
    const requiresApproval = this.config.requireHumanApproval || 
                            confidence < this.config.confidenceThreshold;

    // Build option scores map
    const optionScores: Record<string, number> = {};
    for (const { id, score } of rankedOptions) {
      optionScores[id] = Math.min(Math.max(score, 0), 1);
    }

    // Get alternatives (next best options)
    const alternatives = rankedOptions
      .slice(1, 4) // Up to 3 alternatives
      .map(o => o.id);

    // Generate reasoning
    const reasoning = this.generateReasoning(topOption.id, confidence, context, rankedOptions);

    return {
      selectedOptionId: topOption.id,
      confidence,
      reasoning,
      optionScores,
      requiresApproval,
      alternatives,
    };
  }

  /**
   * Generate human-readable reasoning for the selection
   */
  private generateReasoning(
    selectedId: string,
    confidence: number,
    context: PickerContext,
    rankedOptions: Array<{ id: string; score: number }>
  ): string {
    const selectedOption = context.options.find(o => o.id === selectedId);
    const parts: string[] = [
      `Selected "${selectedOption?.label ?? selectedId}" with ${(confidence * 100).toFixed(1)}% confidence.`,
    ];

    if (rankedOptions.length > 1) {
      const runnerUp = rankedOptions[1];
      const margin = confidence - Math.min(Math.max(runnerUp.score, 0), 1);
      parts.push(`Margin over next best option: ${(margin * 100).toFixed(1)} percentage points.`);
    }

    if (context.constraints && context.constraints.length > 0) {
      const activeConstraints = context.constraints.filter(c => 
        c.type === 'require' || c.type === 'exclude'
      );
      if (activeConstraints.length > 0) {
        parts.push(`Applied ${activeConstraints.length} hard constraint(s).`);
      }
    }

    return parts.join(' ');
  }
}

// =============================================================================
// RUNTIME (Layer 5) - Type definitions for runtime dependencies
// =============================================================================

// Runtime types are imported from the runtime layer
declare namespace Runtime {
  interface AnalysisResult {
    id: string;
    relevanceScore: number;
    reasoning: string;
    matchedKeywords?: string[];
  }

  interface AIEngine {
    analyzeBatch(
      items: Array<{ id: string; content: string; precomputedScore?: number }>,
      prompt: string,
      options: { signal: AbortSignal }
    ): Promise<AnalysisResult[]>;
  }
}

// =============================================================================
// UI (Layer 6) - Export public API
// =============================================================================

export {
  PickerAgentState,
  PickerAgentConfig,
  PickerContext,
  PickerOption,
  PickerConstraint,
  PickerSelection,
  PickerResult,
  PickerAgentError,
  PickerErrorCode,
  PickerAgentRepository,
  InMemoryPickerRepository,
};

// Default export for convenience
export default PickerAgent;