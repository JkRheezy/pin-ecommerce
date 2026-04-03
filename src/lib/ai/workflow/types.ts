/**
 * Types module for AI Workflow Engine
 * Layer: Types (Layer 1)
 * 
 * This module defines all type definitions, interfaces, and enums
 * used across the AI workflow system.
 */

import { z } from 'zod';

// ============================================================================
// Core Domain Types
// ============================================================================

/**
 * Unique identifier for workflow entities
 */
export type WorkflowId = string & { readonly __brand: 'WorkflowId' };

/**
 * Unique identifier for workflow nodes
 */
export type NodeId = string & { readonly __brand: 'NodeId' };

/**
 * Unique identifier for workflow edges
 */
export type EdgeId = string & { readonly __brand: 'EdgeId' };

/**
 * Unique identifier for execution runs
 */
export type ExecutionId = string & { readonly __brand: 'ExecutionId' };

/**
 * Branded string types for type safety
 */
export function createWorkflowId(id: string): WorkflowId {
  if (!id || typeof id !== 'string') {
    throw new WorkflowValidationError('Invalid workflow ID: must be a non-empty string');
  }
  return id as WorkflowId;
}

export function createNodeId(id: string): NodeId {
  if (!id || typeof id !== 'string') {
    throw new WorkflowValidationError('Invalid node ID: must be a non-empty string');
  }
  return id as NodeId;
}

export function createEdgeId(id: string): EdgeId {
  if (!id || typeof id !== 'string') {
    throw new WorkflowValidationError('Invalid edge ID: must be a non-empty string');
  }
  return id as EdgeId;
}

export function createExecutionId(id: string): ExecutionId {
  if (!id || typeof id !== 'string') {
    throw new WorkflowValidationError('Invalid execution ID: must be a non-empty string');
  }
  return id as ExecutionId;
}

// ============================================================================
// Workflow Status Enums
// ============================================================================

/**
 * Represents the current state of a workflow definition
 */
export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DEPRECATED = 'deprecated',
}

/**
 * Represents the execution state of a workflow run
 */
export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
}

/**
 * Represents the status of an individual node execution
 */
export enum NodeExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  RETRYING = 'retrying',
}

/**
 * Types of nodes supported in the workflow engine
 */
export enum NodeType {
  START = 'start',
  END = 'end',
  TASK = 'task',
  DECISION = 'decision',
  PARALLEL = 'parallel',
  MAP = 'map',
  WAIT = 'wait',
  SUB_WORKFLOW = 'sub_workflow',
  AI_AGENT = 'ai_agent',
  CUSTOM = 'custom',
}

// ============================================================================
// Configuration Types (Layer 2)
// ============================================================================

/**
 * Base configuration interface for all workflow entities
 */
export interface BaseConfig {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Workflow configuration schema
 */
export interface WorkflowConfig extends BaseConfig {
  readonly name: string;
  readonly description?: string;
  readonly status: WorkflowStatus;
  readonly nodes: NodeConfig[];
  readonly edges: EdgeConfig[];
  readonly variables: WorkflowVariable[];
  readonly triggers: TriggerConfig[];
}

/**
 * Node configuration within a workflow
 */
export interface NodeConfig extends BaseConfig {
  readonly workflowId: WorkflowId;
  readonly type: NodeType;
  readonly name: string;
  readonly position: Position;
  readonly config: NodeTypeConfig;
  readonly retryPolicy?: RetryPolicy;
  readonly timeoutMs?: number;
}

/**
 * Edge configuration connecting nodes
 */
export interface EdgeConfig extends BaseConfig {
  readonly workflowId: WorkflowId;
  readonly sourceId: NodeId;
  readonly targetId: NodeId;
  readonly condition?: ConditionConfig;
  readonly label?: string;
}

/**
 * Position for visual representation
 */
export interface Position {
  readonly x: number;
  readonly y: number;
}

/**
 * Retry policy for node execution
 */
export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMultiplier: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  readonly retryableErrors?: string[];
}

/**
 * Workflow variable definition
 */
export interface WorkflowVariable {
  readonly name: string;
  readonly type: VariableType;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly description?: string;
}

/**
 * Supported variable types
 */
export enum VariableType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  OBJECT = 'object',
  ARRAY = 'array',
  DATE = 'date',
  ANY = 'any',
}

/**
 * Trigger configuration for workflow initiation
 */
export interface TriggerConfig {
  readonly type: TriggerType;
  readonly config: Record<string, unknown>;
  readonly enabled: boolean;
}

export enum TriggerType {
  SCHEDULE = 'schedule',
  WEBHOOK = 'webhook',
  EVENT = 'event',
  MANUAL = 'manual',
}

// ============================================================================
// Node Type Specific Configurations
// ============================================================================

/**
 * Discriminated union for node type configurations
 */
export type NodeTypeConfig =
  | StartNodeConfig
  | EndNodeConfig
  | TaskNodeConfig
  | DecisionNodeConfig
  | ParallelNodeConfig
  | MapNodeConfig
  | WaitNodeConfig
  | SubWorkflowNodeConfig
  | AIAgentNodeConfig
  | CustomNodeConfig;

export interface StartNodeConfig {
  readonly type: NodeType.START;
  readonly outputMapping?: Record<string, string>;
}

export interface EndNodeConfig {
  readonly type: NodeType.END;
  readonly outputMapping?: Record<string, string>;
}

export interface TaskNodeConfig {
  readonly type: NodeType.TASK;
  readonly action: string;
  readonly inputs: Record<string, unknown>;
  readonly outputs: Record<string, string>;
}

export interface DecisionNodeConfig {
  readonly type: NodeType.DECISION;
  readonly conditions: ConditionBranch[];
  readonly defaultBranch?: string;
}

export interface ConditionBranch {
  readonly id: string;
  readonly name: string;
  readonly condition: ConditionConfig;
}

export interface ConditionConfig {
  readonly operator: ConditionOperator;
  readonly left: unknown;
  readonly right?: unknown;
  readonly conditions?: ConditionConfig[];
}

export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER_THAN = 'greater_than',
  LESS_THAN = 'less_than',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  AND = 'and',
  OR = 'or',
  NOT = 'not',
  EXISTS = 'exists',
}

export interface ParallelNodeConfig {
  readonly type: NodeType.PARALLEL;
  readonly branches: string[];
  readonly joinStrategy: JoinStrategy;
}

export enum JoinStrategy {
  ALL = 'all',
  ANY = 'any',
  FIRST = 'first',
}

export interface MapNodeConfig {
  readonly type: NodeType.MAP;
  readonly inputArray: string;
  readonly maxConcurrency: number;
  readonly subWorkflowId?: WorkflowId;
}

export interface WaitNodeConfig {
  readonly type: NodeType.WAIT;
  readonly durationMs?: number;
  readonly untilTimestamp?: Date;
  readonly condition?: ConditionConfig;
}

export interface SubWorkflowNodeConfig {
  readonly type: NodeType.SUB_WORKFLOW;
  readonly workflowId: WorkflowId;
  readonly inputs: Record<string, unknown>;
  readonly outputs: Record<string, string>;
}

export interface AIAgentNodeConfig {
  readonly type: NodeType.AI_AGENT;
  readonly agentId: string;
  readonly prompt: string;
  readonly contextVariables: string[];
  readonly outputFormat: AIOutputFormat;
  readonly modelConfig?: ModelConfig;
}

export interface AIOutputFormat {
  readonly type: 'text' | 'json' | 'structured';
  readonly schema?: z.ZodType<unknown>;
}

export interface ModelConfig {
  readonly provider: string;
  readonly model: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly topP?: number;
}

export interface CustomNodeConfig {
  readonly type: NodeType.CUSTOM;
  readonly handler: string;
  readonly config: Record<string, unknown>;
}

// ============================================================================
// Runtime Types (Layer 5)
// ============================================================================

/**
 * Workflow execution context
 */
export interface ExecutionContext {
  readonly executionId: ExecutionId;
  readonly workflowId: WorkflowId;
  readonly status: ExecutionStatus;
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly variables: VariableStore;
  readonly nodeResults: Map<NodeId, NodeResult>;
  readonly currentNodeIds: NodeId[];
  readonly executionPath: ExecutionStep[];
}

/**
 * Variable store for workflow execution
 */
export interface VariableStore {
  get<T>(name: string): T | undefined;
  set<T>(name: string, value: T): void;
  has(name: string): boolean;
  delete(name: string): boolean;
  snapshot(): Record<string, unknown>;
}

/**
 * Result of a node execution
 */
export interface NodeResult {
  readonly nodeId: NodeId;
  readonly status: NodeExecutionStatus;
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly outputs?: Record<string, unknown>;
  readonly error?: ExecutionError;
  readonly attemptCount: number;
}

/**
 * Single step in the execution path
 */
export interface ExecutionStep {
  readonly timestamp: Date;
  readonly nodeId: NodeId;
  readonly action: ExecutionAction;
  readonly details?: Record<string, unknown>;
}

export enum ExecutionAction {
  START = 'start',
  COMPLETE = 'complete',
  FAIL = 'fail',
  SKIP = 'skip',
  RETRY = 'retry',
  BRANCH = 'branch',
  JOIN = 'join',
}

/**
 * Execution error with structured information
 */
export interface ExecutionError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly stackTrace?: string;
  readonly recoverable: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error class for workflow-related errors
 */
export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'WorkflowError';
    Object.setPrototypeOf(this, WorkflowError.prototype);
  }
}

/**
 * Error thrown during workflow validation
 */
export class WorkflowValidationError extends WorkflowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WORKFLOW_VALIDATION_ERROR', details);
    this.name = 'WorkflowValidationError';
    Object.setPrototypeOf(this, WorkflowValidationError.prototype);
  }
}

/**
 * Error thrown during workflow execution
 */
export class WorkflowExecutionError extends WorkflowError {
  constructor(
    message: string,
    public readonly nodeId: NodeId,
    public readonly executionId: ExecutionId,
    details?: Record<string, unknown>
  ) {
    super(message, 'WORKFLOW_EXECUTION_ERROR', details);
    this.name = 'WorkflowExecutionError';
    Object.setPrototypeOf(this, WorkflowExecutionError.prototype);
  }
}

/**
 * Error thrown when a node type is not supported
 */
export class UnsupportedNodeTypeError extends WorkflowError {
  constructor(nodeType: NodeType) {
    super(`Unsupported node type: ${nodeType}`, 'UNSUPPORTED_NODE_TYPE', { nodeType });
    this.name = 'UnsupportedNodeTypeError';
    Object.setPrototypeOf(this, UnsupportedNodeTypeError.prototype);
  }
}

// ============================================================================
// Service Layer Types (Layer 4)
// ============================================================================

/**
 * Result type for service operations
 */
export type Result<T, E = WorkflowError> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Repository query options
 */
export interface QueryOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly sortBy?: string;
  readonly sortOrder?: 'asc' | 'desc';
  readonly filters?: Record<string, unknown>;
}

/**
 * Paginated result from repository queries
 */
export interface PaginatedResult<T> {
  readonly items: T[];
  readonly total: number;
  readonly hasMore: boolean;
  readonly nextOffset?: number;
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

export const WorkflowIdSchema = z.string().min(1).brand<'WorkflowId'>();
export const NodeIdSchema = z.string().min(1).brand<'NodeId'>();
export const EdgeIdSchema = z.string().min(1).brand<'EdgeId'>();
export const ExecutionIdSchema = z.string().min(1).brand<'ExecutionId'>();

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10),
  backoffMultiplier: z.number().min(1).max(10),
  initialDelayMs: z.number().int().min(0),
  maxDelayMs: z.number().int().min(0),
  retryableErrors: z.array(z.string()).optional(),
});

export const WorkflowVariableSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid variable name'),
  type: z.nativeEnum(VariableType),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
});

export const NodeConfigSchema = z.object({
  id: z.string(),
  workflowId: WorkflowIdSchema,
  type: z.nativeEnum(NodeType),
  name: z.string().min(1).max(100),
  position: PositionSchema,
  config: z.record(z.unknown()),
  retryPolicy: RetryPolicySchema.optional(),
  timeoutMs: z.number().int().min(0).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export const EdgeConfigSchema = z.object({
  id: z.string(),
  workflowId: WorkflowIdSchema,
  sourceId: NodeIdSchema,
  targetId: NodeIdSchema,
  condition: z.record(z.unknown()).optional(),
  label: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export const WorkflowConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.nativeEnum(WorkflowStatus),
  nodes: z.array(NodeConfigSchema).min(2, 'Workflow must have at least start and end nodes'),
  edges: z.array(EdgeConfigSchema),
  variables: z.array(WorkflowVariableSchema),
  triggers: z.array(z.record(z.unknown())),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().min(1),
  metadata: z.record(z.unknown()).optional(),
});