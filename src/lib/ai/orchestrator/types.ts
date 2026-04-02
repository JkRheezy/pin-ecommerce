/**
 * Orchestrator Types Layer
 * 
 * This module defines the core types and interfaces for the AI Orchestrator system.
 * It follows the six-layer architecture pattern where Types are the foundational layer.
 */

// ============================================================================
// Base Types
// ============================================================================

/**
 * Unique identifier for orchestrator entities
 */
export type OrchestratorId = string;

/**
 * Timestamp in ISO 8601 format
 */
export type ISOTimestamp = string;

/**
 * Execution status for workflow steps and overall orchestration
 */
export enum ExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT',
  RETRYING = 'RETRYING',
}

/**
 * Priority levels for orchestration tasks
 */
export enum TaskPriority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
  BACKGROUND = 4,
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Retry policy configuration for failed operations
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  readonly maxAttempts: number;
  /** Initial delay between retries in milliseconds */
  readonly initialDelayMs: number;
  /** Multiplier for exponential backoff */
  readonly backoffMultiplier: number;
  /** Maximum delay between retries in milliseconds */
  readonly maxDelayMs: number;
  /** Jitter factor to prevent thundering herd (0-1) */
  readonly jitterFactor?: number;
}

/**
 * Timeout configuration for operations
 */
export interface TimeoutConfig {
  /** Total operation timeout in milliseconds */
  readonly operationTimeoutMs: number;
  /** Individual step timeout in milliseconds */
  readonly stepTimeoutMs: number;
  /** Cleanup timeout in milliseconds */
  readonly cleanupTimeoutMs: number;
}

/**
 * Orchestrator configuration options
 */
export interface OrchestratorConfig {
  /** Unique identifier for this orchestrator instance */
  readonly id: OrchestratorId;
  /** Display name for the orchestrator */
  readonly name: string;
  /** Version of the orchestrator schema */
  readonly version: string;
  /** Retry policy for failed operations */
  readonly retryPolicy: RetryPolicy;
  /** Timeout configurations */
  readonly timeouts: TimeoutConfig;
  /** Maximum concurrent executions allowed */
  readonly maxConcurrentExecutions: number;
  /** Whether to enable distributed tracing */
  readonly enableTracing: boolean;
  /** Custom metadata for extensibility */
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * Input parameter definition for workflow steps
 */
export interface WorkflowInput {
  /** Parameter name */
  readonly name: string;
  /** Parameter type */
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Whether the parameter is required */
  readonly required: boolean;
  /** Default value if not provided */
  readonly defaultValue?: unknown;
  /** Validation schema for the input */
  readonly validation?: InputValidation;
}

/**
 * Validation rules for workflow inputs
 */
export interface InputValidation {
  /** Minimum value/length */
  readonly min?: number;
  /** Maximum value/length */
  readonly max?: number;
  /** Regular expression pattern for string validation */
  readonly pattern?: string;
  /** Allowed enum values */
  readonly enum?: readonly unknown[];
  /** Custom validation function reference */
  readonly customValidator?: string;
}

/**
 * Output definition for workflow steps
 */
export interface WorkflowOutput {
  /** Output parameter name */
  readonly name: string;
  /** Output type */
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Description of the output */
  readonly description?: string;
  /** Mapping from step results */
  readonly mapping?: string;
}

/**
 * Definition of a single step in a workflow
 */
export interface WorkflowStep {
  /** Unique identifier for the step */
  readonly id: string;
  /** Human-readable name for the step */
  readonly name: string;
  /** Step type determines the execution behavior */
  readonly type: 'agent' | 'tool' | 'condition' | 'parallel' | 'sequence' | 'loop';
  /** Reference to the agent, tool, or sub-workflow to execute */
  readonly ref: string;
  /** Input parameters for the step */
  readonly inputs: readonly WorkflowInput[];
  /** Expected outputs from the step */
  readonly outputs: readonly WorkflowOutput[];
  /** Steps that must complete before this step can start */
  readonly dependencies: readonly string[];
  /** Priority override for this specific step */
  readonly priority?: TaskPriority;
  /** Condition for executing this step (evaluated at runtime) */
  readonly condition?: string;
  /** Retry policy override for this step */
  readonly retryPolicy?: Partial<RetryPolicy>;
  /** Timeout override for this step */
  readonly timeoutMs?: number;
}

/**
 * Complete workflow definition
 */
export interface WorkflowDefinition {
  /** Unique workflow identifier */
  readonly id: OrchestratorId;
  /** Workflow version */
  readonly version: string;
  /** Human-readable name */
  readonly name: string;
  /** Workflow description */
  readonly description?: string;
  /** Input parameters for the workflow */
  readonly inputs: readonly WorkflowInput[];
  /** Output parameters for the workflow */
  readonly outputs: readonly WorkflowOutput[];
  /** Steps in the workflow */
  readonly steps: readonly WorkflowStep[];
  /** Global variables accessible to all steps */
  readonly variables?: Record<string, unknown>;
  /** Tags for categorization */
  readonly tags?: readonly string[];
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Context passed during workflow execution
 */
export interface ExecutionContext {
  /** Unique execution identifier */
  readonly executionId: OrchestratorId;
  /** Parent execution ID if this is a sub-workflow */
  readonly parentExecutionId?: OrchestratorId;
  /** Workflow being executed */
  readonly workflow: WorkflowDefinition;
  /** Input values for this execution */
  readonly inputs: Record<string, unknown>;
  /** Current variable values */
  readonly variables: Map<string, unknown>;
  /** Results from completed steps */
  readonly stepResults: Map<string, StepResult>;
  /** Execution start time */
  readonly startedAt: ISOTimestamp;
  /** User or system that initiated the execution */
  readonly initiatedBy: string;
  /** Trace ID for distributed tracing */
  readonly traceId: string;
  /** Span ID for the current operation */
  readonly spanId: string;
}

/**
 * Result of a single step execution
 */
export interface StepResult {
  /** Step identifier */
  readonly stepId: string;
  /** Execution status */
  readonly status: ExecutionStatus;
  /** Output values from the step */
  readonly outputs: Record<string, unknown>;
  /** Execution start time */
  readonly startedAt: ISOTimestamp;
  /** Execution end time */
  readonly completedAt?: ISOTimestamp;
  /** Error details if the step failed */
  readonly error?: ExecutionError;
  /** Number of retry attempts made */
  readonly retryCount: number;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
}

/**
 * Complete workflow execution result
 */
export interface WorkflowResult {
  /** Execution identifier */
  readonly executionId: OrchestratorId;
  /** Workflow that was executed */
  readonly workflowId: OrchestratorId;
  /** Final execution status */
  readonly status: ExecutionStatus;
  /** Output values from the workflow */
  readonly outputs: Record<string, unknown>;
  /** Results from all executed steps */
  readonly stepResults: readonly StepResult[];
  /** Execution start time */
  readonly startedAt: ISOTimestamp;
  /** Execution end time */
  readonly completedAt?: ISOTimestamp;
  /** Error details if the workflow failed */
  readonly error?: ExecutionError;
  /** Total execution duration in milliseconds */
  readonly totalDurationMs: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Standardized error structure for orchestrator operations
 */
export interface ExecutionError {
  /** Error code for programmatic handling */
  readonly code: ErrorCode;
  /** Human-readable error message */
  readonly message: string;
  /** Additional error context */
  readonly details?: Record<string, unknown>;
  /** Stack trace for debugging (omitted in production) */
  readonly stack?: string;
  /** Cause of the error if wrapped */
  readonly cause?: ExecutionError;
}

/**
 * Error codes for categorization and handling
 */
export enum ErrorCode {
  // Validation errors (400 range)
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_WORKFLOW = 'INVALID_WORKFLOW',
  INVALID_STEP = 'INVALID_STEP',
  VALIDATION_FAILED = 'VALIDATION_FAILED',

  // Runtime errors (500 range)
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  STEP_FAILED = 'STEP_FAILED',
  AGENT_UNAVAILABLE = 'AGENT_UNAVAILABLE',
  TOOL_ERROR = 'TOOL_ERROR',

  // Timeout errors (408/504 range)
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
  STEP_TIMEOUT = 'STEP_TIMEOUT',

  // Resource errors (409/503 range)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  RESOURCE_UNAVAILABLE = 'RESOURCE_UNAVAILABLE',
  MAX_CONCURRENCY_REACHED = 'MAX_CONCURRENCY_REACHED',

  // State errors (409 range)
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  WORKFLOW_ALREADY_RUNNING = 'WORKFLOW_ALREADY_RUNNING',
  EXECUTION_NOT_FOUND = 'EXECUTION_NOT_FOUND',

  // System errors (500 range)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  PERSISTENCE_ERROR = 'PERSISTENCE_ERROR',
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Base event interface for orchestrator events
 */
export interface OrchestratorEvent {
  /** Event type discriminator */
  readonly type: EventType;
  /** Event timestamp */
  readonly timestamp: ISOTimestamp;
  /** Event payload */
  readonly payload: unknown;
  /** Event metadata */
  readonly metadata: EventMetadata;
}

/**
 * Event types for the orchestrator system
 */
export enum EventType {
  WORKFLOW_STARTED = 'WORKFLOW_STARTED',
  WORKFLOW_COMPLETED = 'WORKFLOW_COMPLETED',
  WORKFLOW_FAILED = 'WORKFLOW_FAILED',
  WORKFLOW_CANCELLED = 'WORKFLOW_CANCELLED',

  STEP_STARTED = 'STEP_STARTED',
  STEP_COMPLETED = 'STEP_COMPLETED',
  STEP_FAILED = 'STEP_FAILED',
  STEP_RETRYING = 'STEP_RETRYING',

  AGENT_INVOKED = 'AGENT_INVOKED',
  AGENT_COMPLETED = 'AGENT_COMPLETED',
  AGENT_FAILED = 'AGENT_FAILED',

  TOOL_INVOKED = 'TOOL_INVOKED',
  TOOL_COMPLETED = 'TOOL_COMPLETED',
  TOOL_FAILED = 'TOOL_FAILED',
}

/**
 * Metadata attached to all events
 */
export interface EventMetadata {
  /** Execution ID that generated this event */
  readonly executionId: OrchestratorId;
  /** Trace ID for correlation */
  readonly traceId: string;
  /** Event sequence number */
  readonly sequence: number;
  /** Source component that emitted the event */
  readonly source: string;
  /** Event priority */
  readonly priority: TaskPriority;
}

// ============================================================================
// Agent Integration Types
// ============================================================================

/**
 * Request to invoke an AI agent
 */
export interface AgentInvocationRequest {
  /** Agent identifier */
  readonly agentId: string;
  /** Prompt or instruction for the agent */
  readonly prompt: string;
  /** Context information for the agent */
  readonly context?: Record<string, unknown>;
  /** Tools available to the agent */
  readonly availableTools?: readonly string[];
  /** Maximum tokens for the response */
  readonly maxTokens?: number;
  /** Temperature for response generation */
  readonly temperature?: number;
  /** Timeout for the agent invocation */
  readonly timeoutMs?: number;
}

/**
 * Response from an AI agent invocation
 */
export interface AgentInvocationResponse {
  /** Response content from the agent */
  readonly content: string;
  /** Tool calls made by the agent */
  readonly toolCalls?: readonly ToolCall[];
  /** Token usage statistics */
  readonly tokenUsage: TokenUsage;
  /** Response metadata */
  readonly metadata: Record<string, unknown>;
  /** Finish reason */
  readonly finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
}

/**
 * Tool call made by an agent
 */
export interface ToolCall {
  /** Tool identifier */
  readonly toolId: string;
  /** Tool name */
  readonly name: string;
  /** Arguments passed to the tool */
  readonly arguments: Record<string, unknown>;
  /** Tool execution result */
  readonly result?: unknown;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  /** Prompt tokens consumed */
  readonly promptTokens: number;
  /** Completion tokens generated */
  readonly completionTokens: number;
  /** Total tokens used */
  readonly totalTokens: number;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type guard for checking if a value is a valid ExecutionStatus
 */
export function isExecutionStatus(value: unknown): value is ExecutionStatus {
  return Object.values(ExecutionStatus).includes(value as ExecutionStatus);
}

/**
 * Type guard for checking if a value is a valid ErrorCode
 */
export function isErrorCode(value: unknown): value is ErrorCode {
  return Object.values(ErrorCode).includes(value as ErrorCode);
}

/**
 * Type guard for checking if a value is a valid EventType
 */
export function isEventType(value: unknown): value is EventType {
  return Object.values(EventType).includes(value as EventType);
}

/**
 * Result type for operations that can fail
 * Follows the Result pattern for explicit error handling
 */
export type Result<T, E = ExecutionError> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

/**
 * Async result type for operations that can fail
 */
export type AsyncResult<T, E = ExecutionError> = Promise<Result<T, E>>;

/**
 * Helper function to create a successful result
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Helper function to create a failed result
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}