/**
 * Test Object Builders
 * 
 * This module provides factory functions for creating test objects
 * following the Builder pattern. All builders ensure type safety
 * and provide sensible defaults for testing.
 * 
 * Layer: Test Types (Test Support Layer)
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  User,
  UserConfig,
  UserRole,
  Repository,
  RepositoryConfig,
  ServiceDefinition,
  ServiceConfig,
  RuntimeEnvironment,
  RuntimeConfig,
  UIComponent,
  UIConfig,
  Pipeline,
  PipelineStage,
  ExecutionStatus,
  Artifact,
  DeploymentTarget,
} from '../../types';

// ============================================================================
// Type Layer Builders
// ============================================================================

/**
 * Builder for User type objects
 */
export interface UserBuilderOptions {
  id?: string;
  email?: string;
  name?: string;
  role?: UserRole;
  createdAt?: Date;
  updatedAt?: Date;
}

export function buildUser(options: UserBuilderOptions = {}): User {
  const now = new Date();
  
  return {
    id: options.id ?? uuidv4(),
    email: options.email ?? `test-${uuidv4().slice(0, 8)}@example.com`,
    name: options.name ?? 'Test User',
    role: options.role ?? 'developer',
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
  };
}

/**
 * Builder for Artifact type objects
 */
export interface ArtifactBuilderOptions {
  id?: string;
  name?: string;
  version?: string;
  repositoryUrl?: string;
  checksum?: string;
  createdAt?: Date;
  metadata?: Record<string, unknown>;
}

export function buildArtifact(options: ArtifactBuilderOptions = {}): Artifact {
  const id = options.id ?? uuidv4();
  
  return {
    id,
    name: options.name ?? 'test-artifact',
    version: options.version ?? '1.0.0',
    repositoryUrl: options.repositoryUrl ?? `https://registry.example.com/artifacts/${id}`,
    checksum: options.checksum ?? 'sha256:'.padEnd(71, '0'),
    createdAt: options.createdAt ?? new Date(),
    metadata: options.metadata ?? {},
  };
}

// ============================================================================
// Config Layer Builders
// ============================================================================

/**
 * Builder for UserConfig objects
 */
export interface UserConfigBuilderOptions {
  userId?: string;
  preferences?: Record<string, unknown>;
  notificationsEnabled?: boolean;
  theme?: 'light' | 'dark' | 'system';
}

export function buildUserConfig(options: UserConfigBuilderOptions = {}): UserConfig {
  return {
    userId: options.userId ?? uuidv4(),
    preferences: options.preferences ?? {},
    notificationsEnabled: options.notificationsEnabled ?? true,
    theme: options.theme ?? 'system',
  };
}

/**
 * Builder for RepositoryConfig objects
 */
export interface RepositoryConfigBuilderOptions {
  url?: string;
  branch?: string;
  credentialsId?: string;
  cloneDepth?: number;
  fetchTags?: boolean;
}

export function buildRepositoryConfig(
  options: RepositoryConfigBuilderOptions = {}
): RepositoryConfig {
  const id = uuidv4();
  
  return {
    url: options.url ?? `https://github.com/test-org/repo-${id.slice(0, 8)}.git`,
    branch: options.branch ?? 'main',
    credentialsId: options.credentialsId,
    cloneDepth: options.cloneDepth ?? 1,
    fetchTags: options.fetchTags ?? false,
  };
}

// ============================================================================
// Repo Layer Builders
// ============================================================================

/**
 * Builder for Repository objects
 */
export interface RepositoryBuilderOptions {
  id?: string;
  name?: string;
  config?: RepositoryConfig;
  lastSyncAt?: Date;
  syncStatus?: 'pending' | 'syncing' | 'synced' | 'failed';
}

export function buildRepository(options: RepositoryBuilderOptions = {}): Repository {
  const id = options.id ?? uuidv4();
  
  return {
    id,
    name: options.name ?? `test-repo-${id.slice(0, 8)}`,
    config: options.config ?? buildRepositoryConfig(),
    lastSyncAt: options.lastSyncAt ?? new Date(),
    syncStatus: options.syncStatus ?? 'synced',
  };
}

// ============================================================================
// Service Layer Builders
// ============================================================================

/**
 * Builder for ServiceDefinition objects
 */
export interface ServiceDefinitionBuilderOptions {
  id?: string;
  name?: string;
  description?: string;
  config?: ServiceConfig;
  dependencies?: string[];
  healthCheckEndpoint?: string;
}

export function buildServiceDefinition(
  options: ServiceDefinitionBuilderOptions = {}
): ServiceDefinition {
  const id = options.id ?? uuidv4();
  
  return {
    id,
    name: options.name ?? `test-service-${id.slice(0, 8)}`,
    description: options.description ?? 'A test service definition',
    config: options.config ?? buildServiceConfig(),
    dependencies: options.dependencies ?? [],
    healthCheckEndpoint: options.healthCheckEndpoint ?? '/health',
  };
}

/**
 * Builder for ServiceConfig objects
 */
export interface ServiceConfigBuilderOptions {
  replicas?: number;
  resources?: {
    cpu: string;
    memory: string;
  };
  environmentVariables?: Record<string, string>;
  ports?: Array<{ containerPort: number; servicePort: number }>;
}

export function buildServiceConfig(options: ServiceConfigBuilderOptions = {}): ServiceConfig {
  return {
    replicas: options.replicas ?? 1,
    resources: options.resources ?? { cpu: '100m', memory: '128Mi' },
    environmentVariables: options.environmentVariables ?? {},
    ports: options.ports ?? [{ containerPort: 8080, servicePort: 80 }],
  };
}

// ============================================================================
// Runtime Layer Builders
// ============================================================================

/**
 * Builder for RuntimeEnvironment objects
 */
export interface RuntimeEnvironmentBuilderOptions {
  id?: string;
  name?: string;
  config?: RuntimeConfig;
  status?: 'provisioning' | 'ready' | 'degraded' | 'unavailable';
  deploymentTarget?: DeploymentTarget;
}

export function buildRuntimeEnvironment(
  options: RuntimeEnvironmentBuilderOptions = {}
): RuntimeEnvironment {
  const id = options.id ?? uuidv4();
  
  return {
    id,
    name: options.name ?? `test-env-${id.slice(0, 8)}`,
    config: options.config ?? buildRuntimeConfig(),
    status: options.status ?? 'ready',
    deploymentTarget: options.deploymentTarget ?? buildDeploymentTarget(),
  };
}

/**
 * Builder for RuntimeConfig objects
 */
export interface RuntimeConfigBuilderOptions {
  clusterName?: string;
  namespace?: string;
  kubeconfigPath?: string;
  autoScalingEnabled?: boolean;
}

export function buildRuntimeConfig(options: RuntimeConfigBuilderOptions = {}): RuntimeConfig {
  return {
    clusterName: options.clusterName ?? 'test-cluster',
    namespace: options.namespace ?? 'default',
    kubeconfigPath: options.kubeconfigPath ?? '~/.kube/config',
    autoScalingEnabled: options.autoScalingEnabled ?? false,
  };
}

/**
 * Builder for DeploymentTarget objects
 */
export interface DeploymentTargetBuilderOptions {
  id?: string;
  type?: 'kubernetes' | 'ecs' | 'lambda' | 'vm';
  region?: string;
  accountId?: string;
}

export function buildDeploymentTarget(
  options: DeploymentTargetBuilderOptions = {}
): DeploymentTarget {
  return {
    id: options.id ?? uuidv4(),
    type: options.type ?? 'kubernetes',
    region: options.region ?? 'us-east-1',
    accountId: options.accountId ?? '123456789012',
  };
}

// ============================================================================
// UI Layer Builders
// ============================================================================

/**
 * Builder for UIComponent objects
 */
export interface UIComponentBuilderOptions {
  id?: string;
  type?: string;
  config?: UIConfig;
  children?: UIComponent[];
  visibility?: 'visible' | 'hidden' | 'conditional';
}

export function buildUIComponent(options: UIComponentBuilderOptions = {}): UIComponent {
  const id = options.id ?? uuidv4();
  
  return {
    id,
    type: options.type ?? 'container',
    config: options.config ?? buildUIConfig(),
    children: options.children ?? [],
    visibility: options.visibility ?? 'visible',
  };
}

/**
 * Builder for UIConfig objects
 */
export interface UIConfigBuilderOptions {
  title?: string;
  description?: string;
  icon?: string;
  route?: string;
  permissions?: string[];
}

export function buildUIConfig(options: UIConfigBuilderOptions = {}): UIConfig {
  return {
    title: options.title ?? 'Test Component',
    description: options.description ?? 'A test UI component',
    icon: options.icon ?? 'default-icon',
    route: options.route ?? '/test',
    permissions: options.permissions ?? [],
  };
}

// ============================================================================
// Pipeline Builders (Cross-Layer)
// ============================================================================

/**
 * Builder for PipelineStage objects
 */
export interface PipelineStageBuilderOptions {
  id?: string;
  name?: string;
  type?: 'build' | 'test' | 'deploy' | 'approval' | 'custom';
  config?: Record<string, unknown>;
  dependsOn?: string[];
  timeoutMinutes?: number;
}

export function buildPipelineStage(
  options: PipelineStageBuilderOptions = {}
): PipelineStage {
  const id = options.id ?? uuidv4();
  
  return {
    id,
    name: options.name ?? `stage-${id.slice(0, 8)}`,
    type: options.type ?? 'custom',
    config: options.config ?? {},
    dependsOn: options.dependsOn ?? [],
    timeoutMinutes: options.timeoutMinutes ?? 30,
  };
}

/**
 * Builder for Pipeline objects
 */
export interface PipelineBuilderOptions {
  id?: string;
  name?: string;
  description?: string;
  repositoryId?: string;
  stages?: PipelineStage[];
  trigger?: 'manual' | 'webhook' | 'scheduled' | 'pipeline';
  createdBy?: string;
}

export function buildPipeline(options: PipelineBuilderOptions = {}): Pipeline {
  const id = options.id ?? uuidv4();
  
  return {
    id,
    name: options.name ?? `pipeline-${id.slice(0, 8)}`,
    description: options.description ?? 'A test pipeline',
    repositoryId: options.repositoryId ?? uuidv4(),
    stages: options.stages ?? [buildPipelineStage()],
    trigger: options.trigger ?? 'manual',
    createdBy: options.createdBy ?? uuidv4(),
  };
}

// ============================================================================
// Execution Builders
// ============================================================================

/**
 * Builder for execution status history
 */
export interface ExecutionStatusBuilderOptions {
  status?: ExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  stageResults?: Array<{
    stageId: string;
    status: ExecutionStatus;
    durationMs: number;
  }>;
}

export function buildExecutionStatus(
  options: ExecutionStatusBuilderOptions = {}
): {
  status: ExecutionStatus;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  stageResults: Array<{
    stageId: string;
    status: ExecutionStatus;
    durationMs: number;
  }>;
} {
  const startedAt = options.startedAt ?? new Date();
  
  return {
    status: options.status ?? 'success',
    startedAt,
    completedAt: options.completedAt,
    errorMessage: options.errorMessage,
    stageResults: options.stageResults ?? [],
  };
}

// ============================================================================
// Builder Combinators
// ============================================================================

/**
 * Creates multiple test objects with incremental variations
 */
export function buildMany<T>(
  builder: (options: Record<string, unknown>) => T,
  count: number,
  baseOptions: Record<string, unknown> = {}
): T[] {
  if (count < 0) {
    throw new Error('Count must be non-negative');
  }
  
  return Array.from({ length: count }, (_, index) =>
    builder({
      ...baseOptions,
      // Add index-based variation for unique identifiers
      name: `${baseOptions.name ?? 'item'}-${index}`,
    })
  );
}

/**
 * Merges partial options with defaults for flexible test object creation
 */
export function withDefaults<T, O extends Record<string, unknown>>(
  defaults: O,
  overrides: Partial<O> = {}
): O {
  return {
    ...defaults,
    ...overrides,
    // Deep merge for nested objects
    ...(overrides.config && defaults.config
      ? { config: { ...defaults.config, ...overrides.config } }
      : {}),
  } as O;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates that a built object conforms to expected constraints
 */
export function validateBuiltObject<T extends Record<string, unknown>>(
  obj: T,
  requiredFields: Array<keyof T>
): void {
  const missing = requiredFields.filter(field => {
    const value = obj[field];
    return value === undefined || value === null || value === '';
  });
  
  if (missing.length > 0) {
    throw new Error(
      `Built object missing required fields: ${missing.join(', ')}`
    );
  }
}

/**
 * Asserts that all IDs in a collection are unique
 */
export function assertUniqueIds<T extends { id: string }>(items: T[]): void {
  const ids = items.map(item => item.id);
  const uniqueIds = new Set(ids);
  
  if (uniqueIds.size !== ids.length) {
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    throw new Error(`Duplicate IDs found: ${[...new Set(duplicates)].join(', ')}`);
  }
}