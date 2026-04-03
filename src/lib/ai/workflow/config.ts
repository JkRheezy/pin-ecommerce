/**
 * Workflow Configuration Module
 * 
 * This module defines configuration constants, validation schemas, and
 * default values for the AI workflow system following the six-layer architecture.
 * 
 * Layer: Config (Layer 2)
 */

import { z } from 'zod';

// ============================================================================
// Types (Layer 1) - Re-exported or extended for config context
// ============================================================================

/**
 * Supported workflow execution strategies
 */
export enum WorkflowExecutionStrategy {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  DAG = 'dag', // Directed Acyclic Graph
}

/**
 * Supported AI model providers
 */
export enum ModelProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  AZURE = 'azure',
  CUSTOM = 'custom',
}

/**
 * Log levels for workflow execution
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  SILENT = 'silent',
}

// ============================================================================
// Configuration Schemas (Layer 2)
// ============================================================================

/**
 * Schema for workflow step configuration
 */
export const WorkflowStepConfigSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, 'Step ID must be alphanumeric with underscores/hyphens'),
  name: z.string().min(1).max(256),
  description: z.string().max(1024).optional(),
  dependsOn: z.array(z.string()).default([]),
  timeoutMs: z.number().int().positive().max(300000).default(30000), // Max 5 minutes
  retries: z.number().int().min(0).max(5).default(0),
  retryDelayMs: z.number().int().min(100).max(60000).default(1000),
  skipOnError: z.boolean().default(false),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema for model configuration
 */
export const ModelConfigSchema = z.object({
  provider: z.nativeEnum(ModelProvider),
  modelId: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().max(128000).default(4096),
  topP: z.number().min(0).max(1).default(1),
  frequencyPenalty: z.number().min(-2).max(2).default(0),
  presencePenalty: z.number().min(-2).max(2).default(0),
  apiKeyEnvVar: z.string().default('AI_API_KEY'),
  baseUrl: z.string().url().optional(),
  customHeaders: z.record(z.string()).optional(),
});

/**
 * Schema for workflow execution configuration
 */
export const WorkflowExecutionConfigSchema = z.object({
  strategy: z.nativeEnum(WorkflowExecutionStrategy).default(WorkflowExecutionStrategy.SEQUENTIAL),
  maxConcurrency: z.number().int().positive().max(100).default(10),
  globalTimeoutMs: z.number().int().positive().max(600000).default(300000), // Max 10 minutes
  logLevel: z.nativeEnum(LogLevel).default(LogLevel.INFO),
  enableMetrics: z.boolean().default(true),
  enableTracing: z.boolean().default(false),
  checkpointIntervalMs: z.number().int().positive().default(5000),
  maxCheckpointSizeBytes: z.number().int().positive().default(10485760), // 10MB
});

/**
 * Schema for complete workflow configuration
 */
export const WorkflowConfigSchema = z.object({
  version: z.literal('1.0.0'),
  name: z.string().min(1).max(256),
  description: z.string().max(2048).optional(),
  steps: z.array(WorkflowStepConfigSchema).min(1).max(100),
  model: ModelConfigSchema,
  execution: WorkflowExecutionConfigSchema,
  environment: z.record(z.string()).default({}),
  secrets: z.array(z.string()).default([]),
});

// ============================================================================
// Inferred Types
// ============================================================================

export type WorkflowStepConfig = z.infer<typeof WorkflowStepConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type WorkflowExecutionConfig = z.infer<typeof WorkflowExecutionConfigSchema>;
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default model configuration
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: ModelProvider.OPENAI,
  modelId: 'gpt-4',
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  apiKeyEnvVar: 'OPENAI_API_KEY',
};

/**
 * Default execution configuration
 */
export const DEFAULT_EXECUTION_CONFIG: WorkflowExecutionConfig = {
  strategy: WorkflowExecutionStrategy.SEQUENTIAL,
  maxConcurrency: 10,
  globalTimeoutMs: 300000,
  logLevel: LogLevel.INFO,
  enableMetrics: true,
  enableTracing: false,
  checkpointIntervalMs: 5000,
  maxCheckpointSizeBytes: 10485760,
};

/**
 * Default workflow configuration template
 */
export const DEFAULT_WORKFLOW_CONFIG: Omit<WorkflowConfig, 'name' | 'steps'> = {
  version: '1.0.0',
  description: '',
  model: DEFAULT_MODEL_CONFIG,
  execution: DEFAULT_EXECUTION_CONFIG,
  environment: {},
  secrets: [],
};

// ============================================================================
// Constants
// ============================================================================

/**
 * Workflow engine constants
 */
export const WORKFLOW_CONSTANTS = {
  // Timing
  MIN_STEP_TIMEOUT_MS: 1000,
  MAX_STEP_TIMEOUT_MS: 300000,
  MIN_GLOBAL_TIMEOUT_MS: 5000,
  MAX_GLOBAL_TIMEOUT_MS: 600000,
  DEFAULT_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 60000,
  
  // Concurrency
  MIN_CONCURRENCY: 1,
  MAX_CONCURRENCY: 100,
  
  // Steps
  MAX_STEPS_PER_WORKFLOW: 100,
  MAX_STEP_NAME_LENGTH: 256,
  MAX_STEP_DESCRIPTION_LENGTH: 1024,
  
  // Data limits
  MAX_CONTEXT_SIZE_BYTES: 10485760, // 10MB
  MAX_CHECKPOINT_SIZE_BYTES: 10485760, // 10MB
  MAX_OUTPUT_SIZE_BYTES: 5242880, // 5MB
  
  // Retry
  MAX_RETRIES: 5,
  
  // Validation
  VALID_STEP_ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
} as const;

/**
 * Error codes for workflow configuration errors
 */
export const CONFIG_ERROR_CODES = {
  INVALID_SCHEMA: 'CONFIG_INVALID_SCHEMA',
  MISSING_REQUIRED_FIELD: 'CONFIG_MISSING_REQUIRED_FIELD',
  INVALID_STEP_REFERENCE: 'CONFIG_INVALID_STEP_REFERENCE',
  CIRCULAR_DEPENDENCY: 'CONFIG_CIRCULAR_DEPENDENCY',
  DUPLICATE_STEP_ID: 'CONFIG_DUPLICATE_STEP_ID',
  TIMEOUT_TOO_SHORT: 'CONFIG_TIMEOUT_TOO_SHORT',
  CONCURRENCY_OUT_OF_RANGE: 'CONFIG_CONCURRENCY_OUT_OF_RANGE',
} as const;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Custom error class for configuration validation errors
 */
export class WorkflowConfigError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly path?: string[],
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'WorkflowConfigError';
    Object.setPrototypeOf(this, WorkflowConfigError.prototype);
  }
}

/**
 * Validates a complete workflow configuration
 * Performs both schema validation and semantic validation
 * 
 * @param config - The configuration object to validate
 * @returns Validated configuration
 * @throws WorkflowConfigError if validation fails
 */
export function validateWorkflowConfig(config: unknown): WorkflowConfig {
  // Schema validation
  const parseResult = WorkflowConfigSchema.safeParse(config);
  
  if (!parseResult.success) {
    const firstError = parseResult.error.errors[0];
    throw new WorkflowConfigError(
      `Configuration validation failed: ${firstError.message}`,
      CONFIG_ERROR_CODES.INVALID_SCHEMA,
      firstError.path.map(String),
      parseResult.error.errors
    );
  }
  
  const validatedConfig = parseResult.data;
  
  // Semantic validation: Check for duplicate step IDs
  const stepIds = new Set<string>();
  const duplicates: string[] = [];
  
  for (const step of validatedConfig.steps) {
    if (stepIds.has(step.id)) {
      duplicates.push(step.id);
    }
    stepIds.add(step.id);
  }
  
  if (duplicates.length > 0) {
    throw new WorkflowConfigError(
      `Duplicate step IDs found: ${duplicates.join(', ')}`,
      CONFIG_ERROR_CODES.DUPLICATE_STEP_ID,
      ['steps'],
      { duplicates }
    );
  }
  
  // Semantic validation: Check dependency references
  const validStepIds = stepIds;
  const invalidDeps: Array<{ stepId: string; invalidDep: string }> = [];
  
  for (const step of validatedConfig.steps) {
    for (const dep of step.dependsOn) {
      if (!validStepIds.has(dep)) {
        invalidDeps.push({ stepId: step.id, invalidDep: dep });
      }
    }
  }
  
  if (invalidDeps.length > 0) {
    throw new WorkflowConfigError(
      `Invalid step dependencies found: ${invalidDeps.map(d => `${d.stepId} -> ${d.invalidDep}`).join(', ')}`,
      CONFIG_ERROR_CODES.INVALID_STEP_REFERENCE,
      ['steps', 'dependsOn'],
      { invalidDependencies: invalidDeps }
    );
  }
  
  // Semantic validation: Check for circular dependencies using DFS
  const circularDeps = detectCircularDependencies(validatedConfig.steps);
  if (circularDeps.length > 0) {
    throw new WorkflowConfigError(
      `Circular dependencies detected: ${circularDeps.map(c => c.join(' -> ')).join('; ')}`,
      CONFIG_ERROR_CODES.CIRCULAR_DEPENDENCY,
      ['steps', 'dependsOn'],
      { cycles: circularDeps }
    );
  }
  
  // Semantic validation: Timeout constraints
  if (validatedConfig.execution.globalTimeoutMs < WORKFLOW_CONSTANTS.MIN_GLOBAL_TIMEOUT_MS) {
    throw new WorkflowConfigError(
      `Global timeout must be at least ${WORKFLOW_CONSTANTS.MIN_GLOBAL_TIMEOUT_MS}ms`,
      CONFIG_ERROR_CODES.TIMEOUT_TOO_SHORT,
      ['execution', 'globalTimeoutMs']
    );
  }
  
  // Check that sum of step timeouts doesn't exceed global timeout (with buffer)
  const totalStepTimeout = validatedConfig.steps.reduce((sum, step) => sum + step.timeoutMs, 0);
  if (totalStepTimeout > validatedConfig.execution.globalTimeoutMs * 2) {
    // Warning: This is logged but not thrown as it's a soft constraint
    // In a real implementation, this would use structured logging
    console.warn(
      `Total step timeouts (${totalStepTimeout}ms) significantly exceed global timeout (${validatedConfig.execution.globalTimeoutMs}ms). ` +
      `Consider adjusting timeouts or execution strategy.`
    );
  }
  
  return validatedConfig;
}

/**
 * Detects circular dependencies in workflow steps using DFS
 * 
 * @param steps - Array of workflow steps
 * @returns Array of detected cycles, each cycle is an array of step IDs
 */
function detectCircularDependencies(steps: WorkflowStepConfig[]): string[][] {
  const adjacencyList = new Map<string, Set<string>>();
  const cycles: string[][] = [];
  
  // Build adjacency list
  for (const step of steps) {
    adjacencyList.set(step.id, new Set(step.dependsOn));
  }
  
  // DFS to detect cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];
  
  function dfs(node: string): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);
    
    const neighbors = adjacencyList.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle - extract it from the path
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart).concat([neighbor]);
        cycles.push(cycle);
      }
    }
    
    path.pop();
    recursionStack.delete(node);
  }
  
  for (const step of steps) {
    if (!visited.has(step.id)) {
      dfs(step.id);
    }
  }
  
  return cycles;
}

/**
 * Merges partial configuration with defaults
 * 
 * @param partial - Partial configuration provided by user
 * @returns Complete configuration with defaults applied
 */
export function mergeWithDefaults(
  partial: Partial<Omit<WorkflowConfig, 'steps'>> & { steps: WorkflowStepConfig[] }
): WorkflowConfig {
  return {
    ...DEFAULT_WORKFLOW_CONFIG,
    ...partial,
    model: {
      ...DEFAULT_MODEL_CONFIG,
      ...partial.model,
    },
    execution: {
      ...DEFAULT_EXECUTION_CONFIG,
      ...partial.execution,
    },
    environment: {
      ...DEFAULT_WORKFLOW_CONFIG.environment,
      ...partial.environment,
    },
    secrets: partial.secrets || DEFAULT_WORKFLOW_CONFIG.secrets,
  } as WorkflowConfig;
}

/**
 * Creates a step configuration with defaults applied
 * 
 * @param partial - Partial step configuration
 * @returns Complete step configuration
 */
export function createStepConfig(partial: Partial<WorkflowStepConfig> & { id: string; name: string }): WorkflowStepConfig {
  return WorkflowStepConfigSchema.parse({
    dependsOn: [],
    timeoutMs: 30000,
    retries: 0,
    retryDelayMs: 1000,
    skipOnError: false,
    ...partial,
  });
}

// ============================================================================
// Environment-based Configuration
// ============================================================================

/**
 * Loads configuration from environment variables
 * Follows the 12-factor app methodology
 * 
 * @returns Partial configuration from environment
 */
export function loadConfigFromEnv(): Partial<WorkflowConfig> {
  const config: Partial<WorkflowConfig> = {
    model: {},
    execution: {},
  };
  
  // Model configuration
  if (process.env.AI_MODEL_PROVIDER) {
    const provider = Object.values(ModelProvider).find(
      p => p.toLowerCase() === process.env.AI_MODEL_PROVIDER?.toLowerCase()
    );
    if (provider && config.model) {
      config.model.provider = provider;
    }
  }
  
  if (process.env.AI_MODEL_ID && config.model) {
    config.model.modelId = process.env.AI_MODEL_ID;
  }
  
  if (process.env.AI_MODEL_TEMPERATURE && config.model) {
    const temp = parseFloat(process.env.AI_MODEL_TEMPERATURE);
    if (!isNaN(temp)) {
      config.model.temperature = temp;
    }
  }
  
  if (process.env.AI_MODEL_MAX_TOKENS && config.model) {
    const tokens = parseInt(process.env.AI_MODEL_MAX_TOKENS, 10);
    if (!isNaN(tokens)) {
      config.model.maxTokens = tokens;
    }
  }
  
  // Execution configuration
  if (process.env.WORKFLOW_LOG_LEVEL && config.execution) {
    const level = Object.values(LogLevel).find(
      l => l.toLowerCase() === process.env.WORKFLOW_LOG_LEVEL?.toLowerCase()
    );
    if (level) {
      config.execution.logLevel = level;
    }
  }
  
  if (process.env.WORKFLOW_MAX_CONCURRENCY && config.execution) {
    const concurrency = parseInt(process.env.WORKFLOW_MAX_CONCURRENCY, 10);
    if (!isNaN(concurrency)) {
      config.execution.maxConcurrency = Math.min(
        Math.max(concurrency, WORKFLOW_CONSTANTS.MIN_CONCURRENCY),
        WORKFLOW_CONSTANTS.MAX_CONCURRENCY
      );
    }
  }
  
  if (process.env.WORKFLOW_ENABLE_METRICS && config.execution) {
    config.execution.enableMetrics = process.env.WORKFLOW_ENABLE_METRICS === 'true';
  }
  
  if (process.env.WORKFLOW_ENABLE_TRACING && config.execution) {
    config.execution.enableTracing = process.env.WORKFLOW_ENABLE_TRACING === 'true';
  }
  
  return config;
}