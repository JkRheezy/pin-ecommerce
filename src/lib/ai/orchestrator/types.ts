/**
 * Types module for AI Orchestrator
 * 
 * This module defines the core types and interfaces for the orchestrator layer,
 * following the six-layer architecture (Types → Config → Repo → Service → Runtime → UI).
 * 
 * Layer: Types (Layer 1)
 * Responsibility: Define pure data structures, interfaces, and type guards
 */

import type { Logger } from '$lib/logging/types';
import type { Result } from '$lib/functional/types';

// ============================================================================
// Core Orchestrator Types
// ============================================================================

/**
 * Unique identifier for an orchestrator instance
 */
export type OrchestratorId = string & { readonly __brand: 'OrchestratorId' };

/**
 * Unique identifier for a workflow execution
 */
export type WorkflowExecutionId = string & { readonly __brand: 'WorkflowExecutionId' };

/**
 * Unique identifier for a step within a workflow
 */
export type StepId = string & { readonly __brand: 'StepId' };

/**
 * Unique identifier for a task execution
 */
export type TaskId = string & { readonly __brand: 'TaskId' };

/**
 * Branded string types for type safety
 */
export function createOrchestratorId(id: string): OrchestratorId {
	return id as OrchestratorId;
}

export function createWorkflowExecutionId(id: string): WorkflowExecutionId {
	return id as WorkflowExecutionId;
}

export function createStepId(id: string): StepId {
	return id as StepId;
}

export function createTaskId(id: string): TaskId {
	return id as TaskId;
}

// ============================================================================
// Workflow Definition Types
// ============================================================================

/**
 * Supported workflow types
 */
export enum WorkflowType {
	SEQUENTIAL = 'sequential',
	PARALLEL = 'parallel',
	CONDITIONAL = 'conditional',
	LOOP = 'loop',
	EVENT_DRIVEN = 'event_driven'
}

/**
 * Execution strategy for handling step failures
 */
export enum FailureStrategy {
	FAIL_FAST = 'fail_fast',           // Stop on first failure
	CONTINUE_ON_ERROR = 'continue_on_error', // Continue executing remaining steps
	RETRY = 'retry',                   // Retry failed steps
	CIRCUIT_BREAKER = 'circuit_breaker' // Use circuit breaker pattern
}

/**
 * Retry configuration for resilient execution
 */
export interface RetryConfig {
	/** Maximum number of retry attempts */
	readonly maxAttempts: number;
	/** Initial delay between retries in milliseconds */
	readonly initialDelayMs: number;
	/** Backoff multiplier for exponential backoff */
	readonly backoffMultiplier: number;
	/** Maximum delay between retries in milliseconds */
	readonly maxDelayMs: number;
	/** Jitter factor (0-1) to add randomness to delays */
	readonly jitterFactor: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxAttempts: 3,
	initialDelayMs: 1000,
	backoffMultiplier: 2,
	maxDelayMs: 30000,
	jitterFactor: 0.1
} as const;

/**
 * Step definition within a workflow
 */
export interface StepDefinition<TInput = unknown, TOutput = unknown> {
	readonly id: StepId;
	readonly name: string;
	readonly description?: string;
	readonly dependencies: readonly StepId[];
	readonly retryConfig: RetryConfig;
	readonly timeoutMs: number;
	readonly execute: (input: TInput, context: StepContext) => Promise<TOutput>;
}

/**
 * Context provided to each step during execution
 */
export interface StepContext {
	readonly executionId: WorkflowExecutionId;
	readonly stepId: StepId;
	readonly logger: Logger;
	readonly metadata: Readonly<Record<string, unknown>>;
	/** Access outputs from previously executed steps */
	getStepOutput: <T>(stepId: StepId) => Result<T, StepOutputNotFoundError>;
}

/**
 * Error thrown when step output is not found
 */
export class StepOutputNotFoundError extends Error {
	constructor(stepId: StepId) {
		super(`Output for step ${stepId} not found`);
		this.name = 'StepOutputNotFoundError';
	}
}

/**
 * Workflow definition composed of steps
 */
export interface WorkflowDefinition<TInput = unknown, TOutput = unknown> {
	readonly id: string;
	readonly name: string;
	readonly version: string;
	readonly type: WorkflowType;
	readonly failureStrategy: FailureStrategy;
	readonly steps: readonly StepDefinition[];
	readonly inputValidator?: (input: unknown) => input is TInput;
	readonly outputTransformer?: (stepOutputs: Map<StepId, unknown>) => TOutput;
}

// ============================================================================
// Execution State Types
// ============================================================================

/**
 * Possible states of a workflow execution
 */
export enum ExecutionStatus {
	PENDING = 'pending',
	RUNNING = 'running',
	PAUSED = 'paused',
	COMPLETED = 'completed',
	FAILED = 'failed',
	CANCELLED = 'cancelled',
	TIMEOUT = 'timeout'
}

/**
 * Possible states of an individual step execution
 */
export enum StepStatus {
	PENDING = 'pending',
	RUNNING = 'running',
	COMPLETED = 'completed',
	FAILED = 'failed',
	SKIPPED = 'skipped',
	CANCELLED = 'cancelled',
	TIMEOUT = 'timeout'
}

/**
 * Execution state for a single step
 */
export interface StepExecutionState {
	readonly stepId: StepId;
	readonly status: StepStatus;
	readonly startedAt?: Date;
	readonly completedAt?: Date;
	readonly attempts: number;
	readonly error?: ExecutionError;
	readonly output?: unknown;
}

/**
 * Structured error information for execution failures
 */
export interface ExecutionError {
	readonly code: string;
	readonly message: string;
	readonly stack?: string;
	readonly cause?: ExecutionError;
	readonly metadata?: Record<string, unknown>;
}

/**
 * Complete workflow execution state
 */
export interface WorkflowExecutionState {
	readonly executionId: WorkflowExecutionId;
	readonly workflowId: string;
	readonly status: ExecutionStatus;
	readonly input: unknown;
	readonly stepStates: ReadonlyMap<StepId, StepExecutionState>;
	readonly startedAt: Date;
	readonly completedAt?: Date;
	readonly error?: ExecutionError;
}

// ============================================================================
// Orchestrator Configuration Types
// ============================================================================

/**
 * Configuration for the orchestrator runtime
 */
export interface OrchestratorConfig {
	readonly maxConcurrentExecutions: number;
	readonly defaultTimeoutMs: number;
	readonly defaultRetryConfig: RetryConfig;
	readonly enableMetrics: boolean;
	readonly enableTracing: boolean;
	readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
	maxConcurrentExecutions: 10,
	defaultTimeoutMs: 300000, // 5 minutes
	defaultRetryConfig: DEFAULT_RETRY_CONFIG,
	enableMetrics: true,
	enableTracing: true,
	logLevel: 'info'
} as const;

// ============================================================================
// Event Types for Event-Driven Workflows
// ============================================================================

/**
 * Event types emitted by the orchestrator
 */
export enum OrchestratorEventType {
	EXECUTION_STARTED = 'execution:started',
	EXECUTION_COMPLETED = 'execution:completed',
	EXECUTION_FAILED = 'execution:failed',
	EXECUTION_CANCELLED = 'execution:cancelled',
	STEP_STARTED = 'step:started',
	STEP_COMPLETED = 'step:completed',
	STEP_FAILED = 'step:failed',
	STEP_RETRY_SCHEDULED = 'step:retry:scheduled'
}

/**
 * Base interface for orchestrator events
 */
export interface OrchestratorEvent {
	readonly type: OrchestratorEventType;
	readonly timestamp: Date;
	readonly executionId: WorkflowExecutionId;
}

/**
 * Execution started event
 */
export interface ExecutionStartedEvent extends OrchestratorEvent {
	readonly type: OrchestratorEventType.EXECUTION_STARTED;
	readonly workflowId: string;
	readonly input: unknown;
}

/**
 * Execution completed event
 */
export interface ExecutionCompletedEvent extends OrchestratorEvent {
	readonly type: OrchestratorEventType.EXECUTION_COMPLETED;
	readonly output: unknown;
	readonly durationMs: number;
}

/**
 * Execution failed event
 */
export interface ExecutionFailedEvent extends OrchestratorEvent {
	readonly type: OrchestratorEventType.EXECUTION_FAILED;
	readonly error: ExecutionError;
	readonly durationMs: number;
}

/**
 * Step started event
 */
export interface StepStartedEvent extends OrchestratorEvent {
	readonly type: OrchestratorEventType.STEP_STARTED;
	readonly stepId: StepId;
	readonly attempt: number;
}

/**
 * Step completed event
 */
export interface StepCompletedEvent extends OrchestratorEvent {
	readonly type: OrchestratorEventType.STEP_COMPLETED;
	readonly stepId: StepId;
	readonly output: unknown;
	readonly durationMs: number;
}

/**
 * Step failed event
 */
export interface StepFailedEvent extends OrchestratorEvent {
	readonly type: OrchestratorEventType.STEP_FAILED;
	readonly stepId: StepId;
	readonly error: ExecutionError;
	readonly willRetry: boolean;
}

/**
 * Union type of all orchestrator events
 */
export type OrchestratorEvents =
	| ExecutionStartedEvent
	| ExecutionCompletedEvent
	| ExecutionFailedEvent
	| ExecutionCancelledEvent
	| StepStartedEvent
	| StepCompletedEvent
	| StepFailedEvent
	| StepRetryScheduledEvent;

/**
 * Execution cancelled event
 */
export interface ExecutionCancelledEvent extends OrchestratorEvent {
	readonly type: OrchestratorEventType.EXECUTION_CANCELLED;
	readonly reason: string;
	readonly cancelledBy?: string;
}

/**
 * Step retry scheduled event
 */
export interface StepRetryScheduledEvent extends OrchestratorEvent {
	readonly type: OrchestratorEventType.STEP_RETRY_SCHEDULED;
	readonly stepId: StepId;
	readonly attempt: number;
	readonly nextAttemptAt: Date;
}

// ============================================================================
// Orchestrator Interface (Service Layer Contract)
// ============================================================================

/**
 * Interface for the orchestrator service
 * Implemented at the Service layer (Layer 4)
 */
export interface OrchestratorService {
	/**
	 * Register a workflow definition for execution
	 */
	registerWorkflow<TInput, TOutput>(
		definition: WorkflowDefinition<TInput, TOutput>
	): Result<void, WorkflowRegistrationError>;

	/**
	 * Execute a registered workflow
	 */
	executeWorkflow<TInput, TOutput>(
		workflowId: string,
		input: TInput,
		options?: ExecutionOptions
	): Promise<Result<WorkflowExecutionId, WorkflowExecutionError>>;

	/**
	 * Get the current state of a workflow execution
	 */
	getExecutionState(
		executionId: WorkflowExecutionId
	): Result<WorkflowExecutionState, ExecutionNotFoundError>;

	/**
	 * Cancel a running workflow execution
	 */
	cancelExecution(
		executionId: WorkflowExecutionId,
		reason: string
	): Promise<Result<void, ExecutionNotFoundError | InvalidStateTransitionError>>;

	/**
	 * Subscribe to orchestrator events
	 */
	subscribeToEvents(
		handler: (event: OrchestratorEvents) => void
	): () => void;
}

/**
 * Error thrown when workflow registration fails
 */
export class WorkflowRegistrationError extends Error {
	constructor(message: string, public readonly workflowId: string) {
		super(message);
		this.name = 'WorkflowRegistrationError';
	}
}

/**
 * Error thrown when workflow execution fails to start
 */
export class WorkflowExecutionError extends Error {
	constructor(message: string, public readonly cause?: Error) {
		super(message);
		this.name = 'WorkflowExecutionError';
	}
}

/**
 * Error thrown when execution is not found
 */
export class ExecutionNotFoundError extends Error {
	constructor(public readonly executionId: WorkflowExecutionId) {
		super(`Execution ${executionId} not found`);
		this.name = 'ExecutionNotFoundError';
	}
}

/**
 * Error thrown when invalid state transition is attempted
 */
export class InvalidStateTransitionError extends Error {
	constructor(
		public readonly executionId: WorkflowExecutionId,
		public readonly fromStatus: ExecutionStatus,
		public readonly toStatus: ExecutionStatus
	) {
		super(`Cannot transition from ${fromStatus} to ${toStatus} for execution ${executionId}`);
		this.name = 'InvalidStateTransitionError';
	}
}

// ============================================================================
// Execution Options
// ============================================================================

/**
 * Options for workflow execution
 */
export interface ExecutionOptions {
	readonly executionId?: WorkflowExecutionId;
	readonly timeoutMs?: number;
	readonly priority?: number;
	readonly metadata?: Record<string, unknown>;
	readonly onStepComplete?: (stepId: StepId, output: unknown) => void;
	readonly onStepError?: (stepId: StepId, error: ExecutionError) => void;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for ExecutionError
 */
export function isExecutionError(error: unknown): error is ExecutionError {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		'message' in error &&
		typeof (error as ExecutionError).code === 'string' &&
		typeof (error as ExecutionError).message === 'string'
	);
}

/**
 * Type guard for WorkflowExecutionState
 */
export function isWorkflowExecutionState(state: unknown): state is WorkflowExecutionState {
	return (
		typeof state === 'object' &&
		state !== null &&
		'executionId' in state &&
		'workflowId' in state &&
		'status' in state &&
		'stepStates' in state &&
		'startedAt' in state
	);
}

/**
 * Type guard for StepExecutionState
 */
export function isStepExecutionState(state: unknown): state is StepExecutionState {
	return (
		typeof state === 'object' &&
		state !== null &&
		'stepId' in state &&
		'status' in state &&
		'attempts' in state
	);
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Infer input type from workflow definition
 */
export type InferWorkflowInput<T> = T extends WorkflowDefinition<infer I, unknown> ? I : never;

/**
 * Infer output type from workflow definition
 */
export type InferWorkflowOutput<T> = T extends WorkflowDefinition<unknown, infer O> ? O : never;

/**
 * Async result type for orchestrator operations
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Handler function type for event subscriptions
 */
export type EventHandler<T extends OrchestratorEvents> = (event: T) => void;