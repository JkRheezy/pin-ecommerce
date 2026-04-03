/**
 * Workflow Types Module
 * 
 * Layer: Types (Layer 1 of 6)
 * Purpose: Define core type definitions for AI workflow orchestration
 * 
 * Following Harness-Engineering six-layer architecture:
 * Types → Config → Repo → Service → Runtime → UI
 */

import { z } from 'zod';

// =============================================================================
// Core Domain Types
// =============================================================================

/**
 * Unique identifier for workflow entities
 * Format: wf_{uuid} for workflows, wfi_{uuid} for instances
 */
export type WorkflowId = `wf_${string}`;
export type WorkflowInstanceId = `wfi_${string}`;
export type StepId = `step_${string}`;

/**
 * Timestamp types for audit trails
 */
export type ISOTimestamp = string;
export type UnixTimestamp = number;

// =============================================================================
// Workflow Status Enum
// =============================================================================

export const WorkflowStatusSchema = z.enum([
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'timeout',
]);

export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

// =============================================================================
// Step Types and Configuration
// =============================================================================

export const StepTypeSchema = z.enum([
  'llm_call',           // Direct LLM invocation
  'tool_execution',     // External tool execution
  'conditional',        // Branching logic
  'parallel',           // Parallel execution
  'sequential',         // Sequential execution
  'human_review',       // Human-in-the-loop checkpoint
  'sub_workflow',       // Nested workflow invocation
  'wait',               // Delay or event-based wait
]);

export type StepType = z.infer<typeof StepTypeSchema>;

/**
 * Base configuration shared by all step types
 */
export interface BaseStepConfig {
  readonly id: StepId;
  readonly name: string;
  readonly description?: string;
  readonly timeoutMs: number;
  readonly retryPolicy?: RetryPolicy;
  readonly onError?: ErrorHandlingStrategy;
}

/**
 * Retry policy for failed step executions
 */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffType: 'fixed' | 'exponential' | 'linear';
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly retryableErrors?: string[]; // Specific error codes to retry
}

/**
 * Error handling strategies for step failures
 */
export type ErrorHandlingStrategy =
  | { type: 'fail_workflow' }
  | { type: 'continue'; nextStepId: StepId }
  | { type: 'retry_with_fallback'; fallbackStepId: StepId }
  | { type: 'compensate'; compensationStepId: StepId };

// =============================================================================
// Specific Step Configurations
// =============================================================================

/**
 * LLM Call Step - Direct interaction with language models
 */
export interface LLMCallStepConfig extends BaseStepConfig {
  readonly type: 'llm_call';
  readonly modelConfig: ModelConfig;
  readonly promptTemplate: PromptTemplate;
  readonly outputSchema?: z.ZodSchema<unknown>;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly tools?: ToolDefinition[];
}

export interface ModelConfig {
  readonly provider: 'openai' | 'anthropic' | 'google' | 'custom';
  readonly modelName: string;
  readonly apiKeyRef: string; // Reference to secret store, not actual key
  readonly baseUrl?: string; // For custom/self-hosted models
}

export interface PromptTemplate {
  readonly id: string;
  readonly version: string;
  readonly variables: string[]; // Variable names expected in context
  readonly systemPrompt?: string;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: z.ZodSchema<unknown>;
  readonly handlerRef: string; // Reference to registered tool handler
}

/**
 * Tool Execution Step - External system integration
 */
export interface ToolExecutionStepConfig extends BaseStepConfig {
  readonly type: 'tool_execution';
  readonly toolRef: string;
  readonly parameters: Record<string, unknown>;
  readonly outputMapping?: Record<string, string>; // Map output to context keys
}

/**
 * Conditional Step - Dynamic branching based on context
 */
export interface ConditionalStepConfig extends BaseStepConfig {
  readonly type: 'conditional';
  readonly condition: ConditionExpression;
  readonly trueBranch: StepId;
  readonly falseBranch: StepId;
}

export type ConditionExpression =
  | { type: 'equals'; path: string; value: unknown }
  | { type: 'exists'; path: string }
  | { type: 'gt' | 'lt' | 'gte' | 'lte'; path: string; value: number }
  | { type: 'and' | 'or'; conditions: ConditionExpression[] }
  | { type: 'not'; condition: ConditionExpression };

/**
 * Parallel Step - Execute multiple branches concurrently
 */
export interface ParallelStepConfig extends BaseStepConfig {
  readonly type: 'parallel';
  readonly branches: StepId[];
  readonly aggregationStrategy: 'all' | 'any' | 'race' | 'merge';
  readonly maxConcurrency: number;
}

/**
 * Sequential Step - Execute steps in order
 */
export interface SequentialStepConfig extends BaseStepConfig {
  readonly type: 'sequential';
  readonly steps: StepId[];
}

/**
 * Human Review Step - Pause for human approval/input
 */
export interface HumanReviewStepConfig extends BaseStepConfig {
  readonly type: 'human_review';
  readonly reviewType: 'approval' | 'input' | 'correction';
  readonly assigneeRoles: string[];
  readonly instructions: string;
  readonly formSchema?: z.ZodSchema<unknown>; // For input type
  readonly autoResumeTimeoutMs?: number;
}

/**
 * Sub-workflow Step - Invoke another workflow
 */
export interface SubWorkflowStepConfig extends BaseStepConfig {
  readonly type: 'sub_workflow';
  readonly workflowId: WorkflowId;
  readonly inputMapping: Record<string, string>; // Map parent context to sub-workflow input
  readonly outputMapping: Record<string, string>; // Map sub-workflow output to parent context
}

/**
 * Wait Step - Delay or event-based pause
 */
export interface WaitStepConfig extends BaseStepConfig {
  readonly type: 'wait';
  readonly waitType: 'duration' | 'event' | 'datetime';
  readonly durationMs?: number;
  readonly eventType?: string;
  readonly eventFilter?: Record<string, unknown>;
  readonly datetime?: ISOTimestamp;
}

/**
 * Union type for all step configurations
 */
export type StepConfig =
  | LLMCallStepConfig
  | ToolExecutionStepConfig
  | ConditionalStepConfig
  | ParallelStepConfig
  | SequentialStepConfig
  | HumanReviewStepConfig
  | SubWorkflowStepConfig
  | WaitStepConfig;

// =============================================================================
// Workflow Definition
// =============================================================================

/**
 * Complete workflow definition - immutable after creation
 */
export interface WorkflowDefinition {
  readonly id: WorkflowId;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: ISOTimestamp;
  readonly updatedAt: ISOTimestamp;
  readonly createdBy: string;
  
  // Graph structure
  readonly steps: ReadonlyMap<StepId, StepConfig>;
  readonly entryPoint: StepId;
  readonly exitPoints: StepId[];
  
  // Execution constraints
  readonly globalTimeoutMs: number;
  readonly maxConcurrency: number;
  readonly inputSchema: z.ZodSchema<unknown>;
  readonly outputSchema: z.ZodSchema<unknown>;
  
  // Metadata
  readonly tags: string[];
  readonly category?: string;
}

// =============================================================================
// Workflow Instance (Runtime State)
// =============================================================================

/**
 * Runtime instance of a workflow execution
 */
export interface WorkflowInstance {
  readonly id: WorkflowInstanceId;
  readonly workflowId: WorkflowId;
  readonly workflowVersion: string;
  readonly status: WorkflowStatus;
  
  // Timing
  readonly createdAt: ISOTimestamp;
  readonly startedAt?: ISOTimestamp;
  readonly completedAt?: ISOTimestamp;
  readonly expiresAt: ISOTimestamp;
  
  // Execution context
  readonly context: WorkflowContext;
  readonly stepStates: ReadonlyMap<StepId, StepState>;
  readonly currentSteps: StepId[]; // Currently executing steps (supports parallel)
  
  // Audit trail
  readonly triggeredBy: string; // User ID or system trigger
  readonly executionLog: ExecutionEvent[];
}

/**
 * Execution context - shared state across workflow steps
 */
export interface WorkflowContext {
  readonly input: unknown;
  readonly output?: unknown;
  readonly variables: ReadonlyMap<string, unknown>;
  readonly secrets: ReadonlySet<string>; // Keys that are secrets (for redaction)
  readonly metadata: Record<string, unknown>;
}

/**
 * State of an individual step within a workflow instance
 */
export interface StepState {
  readonly stepId: StepId;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  readonly attempts: number;
  readonly startedAt?: ISOTimestamp;
  readonly completedAt?: ISOTimestamp;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly error?: StepError;
}

/**
 * Structured error information for failed steps
 */
export interface StepError {
  readonly code: string;
  readonly message: string;
  readonly stackTrace?: string;
  readonly recoverable: boolean;
  readonly details?: Record<string, unknown>;
}

/**
 * Audit event for workflow execution history
 */
export interface ExecutionEvent {
  readonly timestamp: ISOTimestamp;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly stepId?: StepId;
  readonly eventType: string;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
}

// =============================================================================
// Workflow Operations
// =============================================================================

/**
 * Commands that can be issued to a workflow instance
 */
export type WorkflowCommand =
  | { type: 'start'; initialContext?: Partial<WorkflowContext> }
  | { type: 'pause'; reason?: string }
  | { type: 'resume' }
  | { type: 'cancel'; reason: string }
  | { type: 'retry_step'; stepId: StepId; fromBeginning?: boolean }
  | { type: 'skip_step'; stepId: StepId }
  | { type: 'submit_human_input'; stepId: StepId; input: unknown };

/**
 * Result of a workflow operation
 */
export type WorkflowResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: WorkflowError };

/**
 * Domain errors for workflow operations
 */
export interface WorkflowError {
  readonly code: 
    | 'WORKFLOW_NOT_FOUND'
    | 'WORKFLOW_ALREADY_RUNNING'
    | 'WORKFLOW_NOT_RUNNING'
    | 'STEP_NOT_FOUND'
    | 'INVALID_TRANSITION'
    | 'TIMEOUT_EXCEEDED'
    | 'VALIDATION_FAILED'
    | 'PERMISSION_DENIED'
    | 'INTERNAL_ERROR';
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

// =============================================================================
// Event Types (for event-driven architecture)
// =============================================================================

/**
 * Events emitted by the workflow system
 */
export type WorkflowEvent =
  | WorkflowInstanceCreatedEvent
  | WorkflowStatusChangedEvent
  | StepExecutionStartedEvent
  | StepExecutionCompletedEvent
  | StepExecutionFailedEvent
  | HumanReviewRequiredEvent;

export interface BaseWorkflowEvent {
  readonly eventId: string;
  readonly timestamp: ISOTimestamp;
  readonly workflowInstanceId: WorkflowInstanceId;
  readonly workflowId: WorkflowId;
}

export interface WorkflowInstanceCreatedEvent extends BaseWorkflowEvent {
  readonly type: 'workflow_instance_created';
  readonly triggeredBy: string;
}

export interface WorkflowStatusChangedEvent extends BaseWorkflowEvent {
  readonly type: 'workflow_status_changed';
  readonly previousStatus: WorkflowStatus;
  readonly newStatus: WorkflowStatus;
  readonly reason?: string;
}

export interface StepExecutionStartedEvent extends BaseWorkflowEvent {
  readonly type: 'step_execution_started';
  readonly stepId: StepId;
  readonly attemptNumber: number;
}

export interface StepExecutionCompletedEvent extends BaseWorkflowEvent {
  readonly type: 'step_execution_completed';
  readonly stepId: StepId;
  readonly durationMs: number;
  readonly outputSizeBytes: number;
}

export interface StepExecutionFailedEvent extends BaseWorkflowEvent {
  readonly type: 'step_execution_failed';
  readonly stepId: StepId;
  readonly error: StepError;
  readonly willRetry: boolean;
}

export interface HumanReviewRequiredEvent extends BaseWorkflowEvent {
  readonly type: 'human_review_required';
  readonly stepId: StepId;
  readonly reviewType: 'approval' | 'input' | 'correction';
  readonly assigneeRoles: string[];
}

// =============================================================================
// Validation Schemas (for runtime validation)
// =============================================================================

/**
 * Zod schemas for validating workflow definitions at runtime
 */
export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10),
  backoffType: z.enum(['fixed', 'exponential', 'linear']),
  initialDelayMs: z.number().int().min(0),
  maxDelayMs: z.number().int().min(0),
  retryableErrors: z.array(z.string()).optional(),
}) satisfies z.ZodType<RetryPolicy>;

export const BaseStepConfigSchema = z.object({
  id: z.string().startsWith('step_'),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  timeoutMs: z.number().int().min(1000).max(86400000), // 1s to 24h
  retryPolicy: RetryPolicySchema.optional(),
  onError: z.union([
    z.object({ type: z.literal('fail_workflow') }),
    z.object({ type: z.literal('continue'), nextStepId: z.string() }),
    z.object({ type: z.literal('retry_with_fallback'), fallbackStepId: z.string() }),
    z.object({ type: z.literal('compensate'), compensationStepId: z.string() }),
  ]).optional(),
}) satisfies z.ZodType<BaseStepConfig>;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a value is a valid WorkflowId
 */
export function isWorkflowId(value: unknown): value is WorkflowId {
  return typeof value === 'string' && /^wf_[a-zA-Z0-9_-]+$/.test(value);
}

/**
 * Type guard to check if a value is a valid WorkflowInstanceId
 */
export function isWorkflowInstanceId(value: unknown): value is WorkflowInstanceId {
  return typeof value === 'string' && /^wfi_[a-zA-Z0-9_-]+$/.test(value);
}

/**
 * Type guard for step configuration types
 */
export function isLLMCallStep(config: StepConfig): config is LLMCallStepConfig {
  return config.type === 'llm_call';
}

export function isConditionalStep(config: StepConfig): config is ConditionalStepConfig {
  return config.type === 'conditional';
}

export function isHumanReviewStep(config: StepConfig): config is HumanReviewStepConfig {
  return config.type === 'human_review';
}