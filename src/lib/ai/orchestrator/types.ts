/**
 * Orchestrator Types Module
 * 
 * Layer: Types (Layer 1)
 * Purpose: Define core type definitions and interfaces for the AI orchestrator system.
 * This module contains no runtime logic - only type definitions, interfaces, and constants.
 */

// ============================================================================
// Base Types & Enums
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
 * Execution status for orchestrator operations
 */
export enum ExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Priority levels for orchestrator tasks
 */
export enum TaskPriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
  BACKGROUND = 4,
}

// ============================================================================
// Core Entity Interfaces
// ============================================================================

/**
 * Base interface for all orchestrator entities
 * Provides common fields shared across all domain objects
 */
export interface BaseEntity {
  readonly id: OrchestratorId;
  readonly createdAt: ISOTimestamp;
  readonly updatedAt: ISOTimestamp;
  readonly version: number;
}

/**
 * Metadata associated with orchestrator operations
 * Used for tracing, auditing, and debugging
 */
export interface OperationMetadata {
  /** Correlation ID for distributed tracing */
  readonly correlationId: OrchestratorId;
  /** ID of the user or system initiating the operation */
  readonly initiatedBy: OrchestratorId;
  /** Source system or service */
  readonly source: string;
  /** Optional tags for categorization */
  readonly tags?: Record<string, string>;
  /** Optional context for debugging */
  readonly debugContext?: Record<string, unknown>;
}

// ============================================================================
// Task & Workflow Types
// ============================================================================

/**
 * Represents a single unit of work in the orchestrator
 */
export interface Task extends BaseEntity {
  /** Human-readable name for the task */
  readonly name: string;
  /** Detailed description of what the task does */
  readonly description: string;
  /** Current execution status */
  readonly status: ExecutionStatus;
  /** Priority level for scheduling */
  readonly priority: TaskPriority;
  /** Task-specific configuration */
  readonly config: TaskConfig;
  /** Execution results (populated after completion) */
  readonly result?: TaskResult;
  /** Error information (populated on failure) */
  readonly error?: TaskError;
  /** IDs of tasks that must complete before this one */
  readonly dependencies: OrchestratorId[];
  /** Maximum execution time in milliseconds */
  readonly timeoutMs: number;
  /** Number of retry attempts allowed */
  readonly maxRetries: number;
  /** Current retry count */
  readonly retryCount: number;
}

/**
 * Configuration for a task execution
 */
export interface TaskConfig {
  /** Task type identifier for routing to appropriate handler */
  readonly type: string;
  /** Task-specific input parameters */
  readonly parameters: Record<string, unknown>;
  /** Resource requirements for execution */
  readonly resources?: ResourceRequirements;
}

/**
 * Resource requirements for task execution
 */
export interface ResourceRequirements {
  /** Memory requirement in MB */
  readonly memoryMb?: number;
  /** CPU requirement (fractional cores allowed, e.g., 0.5) */
  readonly cpu?: number;
  /** GPU requirement */
  readonly gpu?: boolean;
  /** Required capabilities (e.g., ['python', 'tensorflow']) */
  readonly capabilities?: string[];
}

/**
 * Result of a completed task
 */
export interface TaskResult {
  /** Status of the completed task */
  readonly status: ExecutionStatus.COMPLETED;
  /** Timestamp when task completed */
  readonly completedAt: ISOTimestamp;
  /** Output data from task execution */
  readonly output: unknown;
  /** Execution metrics */
  readonly metrics: ExecutionMetrics;
}

/**
 * Error information for failed tasks
 */
export interface TaskError {
  /** Status indicating failure */
  readonly status: ExecutionStatus.FAILED | ExecutionStatus.TIMEOUT | ExecutionStatus.CANCELLED;
  /** Timestamp when failure occurred */
  readonly failedAt: ISOTimestamp;
  /** Error code for programmatic handling */
  readonly code: string;
  /** Human-readable error message */
  readonly message: string;
  /** Stack trace or additional error details */
  readonly details?: string;
  /** Whether the error is retryable */
  readonly isRetryable: boolean;
}

/**
 * Execution metrics for performance monitoring
 */
export interface ExecutionMetrics {
  /** Time spent in queue waiting to execute (ms) */
  readonly queueTimeMs: number;
  /** Actual execution time (ms) */
  readonly executionTimeMs: number;
  /** Total time from creation to completion (ms) */
  readonly totalTimeMs: number;
  /** Resource utilization during execution */
  readonly resourceUtilization?: ResourceUtilization;
}

/**
 * Resource utilization metrics
 */
export interface ResourceUtilization {
  /** Peak memory usage in MB */
  readonly peakMemoryMb: number;
  /** Average CPU utilization (0-1) */
  readonly avgCpuUtilization: number;
}

// ============================================================================
// Workflow Types
// ============================================================================

/**
 * A workflow is a directed acyclic graph (DAG) of tasks
 */
export interface Workflow extends BaseEntity {
  /** Human-readable name */
  readonly name: string;
  /** Workflow description */
  readonly description: string;
  /** Current execution status */
  readonly status: ExecutionStatus;
  /** Tasks in this workflow (flat list, dependencies define structure) */
  readonly tasks: Task[];
  /** Workflow-level configuration */
  readonly config: WorkflowConfig;
  /** Execution metadata */
  readonly metadata: OperationMetadata;
}

/**
 * Workflow configuration options
 */
export interface WorkflowConfig {
  /** Global timeout for entire workflow (ms) */
  readonly globalTimeoutMs: number;
  /** Whether to continue on individual task failures */
  readonly continueOnFailure: boolean;
  /** Maximum parallel task executions */
  readonly maxConcurrency: number;
  /** Retry policy for failed tasks */
  readonly retryPolicy: RetryPolicy;
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  readonly maxAttempts: number;
  /** Backoff strategy */
  readonly backoffStrategy: BackoffStrategy;
  /** Initial delay in milliseconds */
  readonly initialDelayMs: number;
  /** Maximum delay in milliseconds */
  readonly maxDelayMs: number;
}

/**
 * Backoff strategy for retries
 */
export enum BackoffStrategy {
  /** Fixed delay between retries */
  FIXED = 'FIXED',
  /** Linear increase in delay */
  LINEAR = 'LINEAR',
  /** Exponential increase in delay */
  EXPONENTIAL = 'EXPONENTIAL',
}

// ============================================================================
// Orchestrator Service Types
// ============================================================================

/**
 * Request to create a new workflow
 */
export interface CreateWorkflowRequest {
  readonly name: string;
  readonly description: string;
  readonly tasks: CreateTaskRequest[];
  readonly config?: Partial<WorkflowConfig>;
  readonly metadata: OperationMetadata;
}

/**
 * Request to create a new task (used within workflow creation)
 */
export interface CreateTaskRequest {
  readonly name: string;
  readonly description: string;
  readonly config: TaskConfig;
  readonly priority?: TaskPriority;
  readonly dependencies?: OrchestratorId[];
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
}

/**
 * Response from workflow creation
 */
export interface CreateWorkflowResponse {
  readonly workflow: Workflow;
  readonly acceptedAt: ISOTimestamp;
}

/**
 * Request to execute an existing workflow
 */
export interface ExecuteWorkflowRequest {
  readonly workflowId: OrchestratorId;
  /** Override parameters for specific tasks */
  readonly parameterOverrides?: Record<OrchestratorId, Record<string, unknown>>;
  readonly metadata: OperationMetadata;
}

/**
 * Response from workflow execution
 */
export interface ExecuteWorkflowResponse {
  readonly executionId: OrchestratorId;
  readonly status: ExecutionStatus;
  readonly startedAt: ISOTimestamp;
}

/**
 * Query parameters for listing workflows
 */
export interface ListWorkflowsQuery {
  readonly status?: ExecutionStatus;
  readonly createdAfter?: ISOTimestamp;
  readonly createdBefore?: ISOTimestamp;
  readonly initiatedBy?: OrchestratorId;
  readonly limit?: number;
  readonly offset?: number;
}

// ============================================================================
// Event Types (for pub/sub and observability)
// ============================================================================

/**
 * Base event interface for orchestrator events
 */
export interface OrchestratorEvent {
  readonly eventId: OrchestratorId;
  readonly eventType: string;
  readonly timestamp: ISOTimestamp;
  readonly payload: unknown;
  readonly metadata: OperationMetadata;
}

/**
 * Task status change event
 */
export interface TaskStatusChangedEvent extends OrchestratorEvent {
  readonly eventType: 'TASK_STATUS_CHANGED';
  readonly payload: {
    readonly taskId: OrchestratorId;
    readonly workflowId: OrchestratorId;
    readonly previousStatus: ExecutionStatus;
    readonly newStatus: ExecutionStatus;
  };
}

/**
 * Workflow status change event
 */
export interface WorkflowStatusChangedEvent extends OrchestratorEvent {
  readonly eventType: 'WORKFLOW_STATUS_CHANGED';
  readonly payload: {
    readonly workflowId: OrchestratorId;
    readonly previousStatus: ExecutionStatus;
    readonly newStatus: ExecutionStatus;
  };
}

/**
 * Task execution completed event
 */
export interface TaskCompletedEvent extends OrchestratorEvent {
  readonly eventType: 'TASK_COMPLETED';
  readonly payload: {
    readonly taskId: OrchestratorId;
    readonly workflowId: OrchestratorId;
    readonly result: TaskResult;
  };
}

/**
 * Task execution failed event
 */
export interface TaskFailedEvent extends OrchestratorEvent {
  readonly eventType: 'TASK_FAILED';
  readonly payload: {
    readonly taskId: OrchestratorId;
    readonly workflowId: OrchestratorId;
    readonly error: TaskError;
  };
}

// Union type of all orchestrator events
export type AllOrchestratorEvents = 
  | TaskStatusChangedEvent 
  | WorkflowStatusChangedEvent 
  | TaskCompletedEvent 
  | TaskFailedEvent;

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for orchestrator-specific errors
 */
export enum OrchestratorErrorCode {
  WORKFLOW_NOT_FOUND = 'WORKFLOW_NOT_FOUND',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  INVALID_WORKFLOW_CONFIG = 'INVALID_WORKFLOW_CONFIG',
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',
  RESOURCE_UNAVAILABLE = 'RESOURCE_UNAVAILABLE',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  DUPLICATE_TASK_ID = 'DUPLICATE_TASK_ID',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

/**
 * Structured error for orchestrator operations
 */
export interface OrchestratorError {
  readonly code: OrchestratorErrorCode;
  readonly message: string;
  /** Original error that caused this error, if any */
  readonly cause?: Error;
  /** Additional context for debugging */
  readonly context?: Record<string, unknown>;
}

// ============================================================================
// Repository Types (Layer 2 interface)
// ============================================================================

/**
 * Interface for workflow persistence operations
 * Implemented by the Repository layer
 */
export interface WorkflowRepository {
  create(workflow: Workflow): Promise<Workflow>;
  findById(id: OrchestratorId): Promise<Workflow | null>;
  findByQuery(query: ListWorkflowsQuery): Promise<Workflow[]>;
  update(workflow: Workflow): Promise<Workflow>;
  delete(id: OrchestratorId): Promise<boolean>;
}

/**
 * Interface for task persistence operations
 * Implemented by the Repository layer
 */
export interface TaskRepository {
  create(task: Task): Promise<Task>;
  findById(id: OrchestratorId): Promise<Task | null>;
  findByWorkflowId(workflowId: OrchestratorId): Promise<Task[]>;
  update(task: Task): Promise<Task>;
  updateStatus(
    id: OrchestratorId, 
    status: ExecutionStatus, 
    error?: TaskError, 
    result?: TaskResult
  ): Promise<Task>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid ExecutionStatus
 */
export function isExecutionStatus(value: unknown): value is ExecutionStatus {
  return typeof value === 'string' && Object.values(ExecutionStatus).includes(value as ExecutionStatus);
}

/**
 * Type guard to check if a value is a valid TaskPriority
 */
export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === 'number' && Object.values(TaskPriority).includes(value as TaskPriority);
}

/**
 * Type guard to check if a value is a valid OrchestratorErrorCode
 */
export function isOrchestratorErrorCode(value: unknown): value is OrchestratorErrorCode {
  return typeof value === 'string' && Object.values(OrchestratorErrorCode).includes(value as OrchestratorErrorCode);
}

/**
 * Type guard to check if a task has failed
 */
export function isFailedTask(task: Task): task is Task & { error: TaskError } {
  return task.status === ExecutionStatus.FAILED && task.error !== undefined;
}

/**
 * Type guard to check if a task has completed successfully
 */
export function isCompletedTask(task: Task): task is Task & { result: TaskResult } {
  return task.status === ExecutionStatus.COMPLETED && task.result !== undefined;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration values
 */
export const DEFAULTS = {
  WORKFLOW_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  TASK_TIMEOUT_MS: 5 * 60 * 1000,      // 5 minutes
  MAX_RETRIES: 3,
  MAX_CONCURRENCY: 10,
  INITIAL_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 60 * 1000,       // 1 minute
  LIST_LIMIT: 50,
} as const;

/**
 * Validation constraints
 */
export const CONSTRAINTS = {
  MAX_WORKFLOW_NAME_LENGTH: 256,
  MAX_TASK_NAME_LENGTH: 256,
  MAX_DESCRIPTION_LENGTH: 4000,
  MAX_TAGS: 20,
  MAX_TAG_KEY_LENGTH: 128,
  MAX_TAG_VALUE_LENGTH: 256,
  MIN_TIMEOUT_MS: 1000,
  MAX_TIMEOUT_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const;