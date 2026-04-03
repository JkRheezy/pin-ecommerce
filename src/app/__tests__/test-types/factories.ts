/**
 * Test Data Factories
 * 
 * Layer: Test Types (Layer 1)
 * Purpose: Provide factory functions for creating test data with sensible defaults
 * 
 * Following six-layer architecture: Types → Config → Repo → Service → Runtime → UI
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPE IMPORTS (would come from actual type definitions in production)
// ============================================================================

/**
 * Represents a user entity in the system
 */
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'viewer';
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Represents a project entity
 */
export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  status: 'active' | 'archived' | 'draft';
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  settings: ProjectSettings;
}

/**
 * Project-specific settings
 */
export interface ProjectSettings {
  visibility: 'public' | 'private' | 'internal';
  allowForking: boolean;
  requireApproval: boolean;
  retentionDays: number;
}

/**
 * Represents a pipeline configuration
 */
export interface Pipeline {
  id: string;
  projectId: string;
  name: string;
  yaml: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  isEnabled: boolean;
  triggers: PipelineTrigger[];
}

/**
 * Pipeline trigger configuration
 */
export interface PipelineTrigger {
  id: string;
  type: 'webhook' | 'scheduled' | 'manual' | 'artifact';
  config: Record<string, unknown>;
  isActive: boolean;
}

// ============================================================================
// FACTORY CONFIGURATION
// ============================================================================

/**
 * Configuration options for all factories
 */
export interface FactoryConfig {
  /** Seed for deterministic ID generation (useful for snapshot tests) */
  seed?: string;
  /** Override any default values */
  overrides?: Record<string, unknown>;
}

/**
 * Error thrown when factory configuration is invalid
 */
export class FactoryConfigError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(`Factory configuration error: ${message}`);
    this.name = 'FactoryConfigError';
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generates a deterministic or random UUID based on configuration
 */
function generateId(config?: FactoryConfig): string {
  if (config?.seed) {
    // Deterministic ID generation for reproducible tests
    return `test-${config.seed}-${Math.random().toString(36).substring(2, 9)}`;
  }
  return uuidv4();
}

/**
 * Deep merges objects, handling nested structures
 */
function deepMerge<T extends Record<string, unknown>>(base: T, override?: Partial<T>): T {
  if (!override) return base;
  
  const result = { ...base };
  
  for (const key of Object.keys(override)) {
    const overrideValue = override[key];
    const baseValue = result[key];
    
    if (
      typeof overrideValue === 'object' && 
      overrideValue !== null && 
      !Array.isArray(overrideValue) &&
      typeof baseValue === 'object' && 
      baseValue !== null &&
      !Array.isArray(baseValue)
    ) {
      // Recursively merge nested objects
      result[key] = deepMerge(
        baseValue as Record<string, unknown>, 
        overrideValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else {
      result[key] = overrideValue as T[Extract<keyof T, string>];
    }
  }
  
  return result;
}

/**
 * Validates that required string fields are non-empty
 */
function validateRequiredString(value: unknown, fieldName: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FactoryConfigError(`${fieldName} must be a non-empty string`, fieldName);
  }
}

// ============================================================================
// USER FACTORY
// ============================================================================

/**
 * Default values for User entity
 */
const defaultUser: Omit<User, 'id' | 'createdAt' | 'updatedAt'> = {
  email: 'test@example.com',
  name: 'Test User',
  role: 'user',
  isActive: true,
  metadata: {},
};

/**
 * Creates a test User with sensible defaults
 * 
 * @param overrides - Partial User to override defaults
 * @param config - Factory configuration options
 * @returns A complete User entity
 * @throws FactoryConfigError if validation fails
 */
export function createUser(
  overrides?: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>,
  config?: FactoryConfig
): User {
  const now = new Date();
  const id = generateId(config);
  
  const user = deepMerge(defaultUser, overrides);
  
  // Validate email format if provided
  if (overrides?.email && !overrides.email.includes('@')) {
    throw new FactoryConfigError('Invalid email format', 'email');
  }
  
  return {
    id,
    createdAt: now,
    updatedAt: now,
    ...user,
  } as User;
}

/**
 * Creates multiple User entities
 * 
 * @param count - Number of users to create
 * @param overrides - Overrides applied to all users
 * @param config - Factory configuration
 * @returns Array of User entities
 */
export function createUsers(
  count: number,
  overrides?: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>,
  config?: FactoryConfig
): User[] {
  if (count < 0 || !Number.isInteger(count)) {
    throw new FactoryConfigError('Count must be a non-negative integer', 'count');
  }
  
  return Array.from({ length: count }, (_, index) => 
    createUser(
      {
        ...overrides,
        email: overrides?.email ?? `test${index}@example.com`,
      },
      config ? { ...config, seed: `${config.seed}-${index}` } : undefined
    )
  );
}

// ============================================================================
// PROJECT FACTORY
// ============================================================================

/**
 * Default values for ProjectSettings
 */
const defaultProjectSettings: ProjectSettings = {
  visibility: 'private',
  allowForking: true,
  requireApproval: false,
  retentionDays: 30,
};

/**
 * Default values for Project entity
 */
const defaultProject: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'> = {
  name: 'Test Project',
  description: 'A project created for testing purposes',
  status: 'active',
  tags: [],
  settings: defaultProjectSettings,
};

/**
 * Creates a test Project with sensible defaults
 * 
 * @param ownerId - Required owner ID (must reference a valid user)
 * @param overrides - Partial Project to override defaults
 * @param config - Factory configuration options
 * @returns A complete Project entity
 * @throws FactoryConfigError if validation fails
 */
export function createProject(
  ownerId: string,
  overrides?: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>>,
  config?: FactoryConfig
): Project {
  validateRequiredString(ownerId, 'ownerId');
  
  const now = new Date();
  const id = generateId(config);
  
  // Merge settings deeply
  const settingsOverride = overrides?.settings;
  const baseProject = {
    ...defaultProject,
    ...overrides,
    settings: deepMerge(defaultProjectSettings, settingsOverride),
  };
  
  // Validate retention days is positive
  if (baseProject.settings.retentionDays < 1) {
    throw new FactoryConfigError('retentionDays must be at least 1', 'settings.retentionDays');
  }
  
  return {
    id,
    ownerId,
    createdAt: now,
    updatedAt: now,
    ...baseProject,
  } as Project;
}

/**
 * Creates a Project with an associated User as owner
 * 
 * @param userOverrides - Overrides for the created owner user
 * @param projectOverrides - Overrides for the created project
 * @param config - Factory configuration
 * @returns Tuple of [User, Project]
 */
export function createProjectWithOwner(
  userOverrides?: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>,
  projectOverrides?: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>>,
  config?: FactoryConfig
): [User, Project] {
  const owner = createUser(userOverrides, config);
  const project = createProject(owner.id, projectOverrides, config);
  return [owner, project];
}

// ============================================================================
// PIPELINE FACTORY
// ============================================================================

/**
 * Default values for PipelineTrigger
 */
const defaultTrigger: Omit<PipelineTrigger, 'id'> = {
  type: 'manual',
  config: {},
  isActive: true,
};

/**
 * Default YAML template for pipelines
 */
const defaultPipelineYaml = `
pipeline:
  name: Test Pipeline
  identifier: test_pipeline
  stages:
    - stage:
        name: Build
        identifier: build
        type: CI
        spec:
          execution:
            steps:
              - step:
                  type: Run
                  name: Echo
                  spec:
                    command: echo "Hello World"
`;

/**
 * Default values for Pipeline entity
 */
const defaultPipeline: Omit<Pipeline, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
  name: 'Test Pipeline',
  yaml: defaultPipelineYaml,
  version: 1,
  isEnabled: true,
  triggers: [],
};

/**
 * Creates a test Pipeline with sensible defaults
 * 
 * @param projectId - Required project ID (must reference a valid project)
 * @param createdBy - Required user ID of creator
 * @param overrides - Partial Pipeline to override defaults
 * @param config - Factory configuration options
 * @returns A complete Pipeline entity
 * @throws FactoryConfigError if validation fails
 */
export function createPipeline(
  projectId: string,
  createdBy: string,
  overrides?: Partial<Omit<Pipeline, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'createdBy'>>,
  config?: FactoryConfig
): Pipeline {
  validateRequiredString(projectId, 'projectId');
  validateRequiredString(createdBy, 'createdBy');
  
  const now = new Date();
  const id = generateId(config);
  
  // Process triggers if provided
  let triggers: PipelineTrigger[] = overrides?.triggers ?? [];
  if (triggers.length === 0 && !overrides?.triggers) {
    // Add default trigger if none specified
    triggers = [{
      id: generateId(config ? { ...config, seed: `${config.seed}-trigger` } : undefined),
      ...defaultTrigger,
    }];
  } else {
    // Ensure all triggers have IDs
    triggers = triggers.map((t, idx) => ({
      id: t.id ?? generateId(config ? { ...config, seed: `${config.seed}-trigger-${idx}` } : undefined),
      ...defaultTrigger,
      ...t,
    }));
  }
  
  const pipeline = {
    ...defaultPipeline,
    ...overrides,
    triggers,
  };
  
  // Validate YAML is non-empty
  if (!pipeline.yaml || pipeline.yaml.trim().length === 0) {
    throw new FactoryConfigError('Pipeline YAML cannot be empty', 'yaml');
  }
  
  return {
    id,
    projectId,
    createdBy,
    createdAt: now,
    updatedAt: now,
    ...pipeline,
  } as Pipeline;
}

/**
 * Creates a complete hierarchy: User -> Project -> Pipeline
 * 
 * @param overrides - Nested overrides for each entity type
 * @param config - Factory configuration
 * @returns Tuple of [User, Project, Pipeline]
 */
export function createFullHierarchy(
  overrides?: {
    user?: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>;
    project?: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>>;
    pipeline?: Partial<Omit<Pipeline, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'createdBy'>>;
  },
  config?: FactoryConfig
): [User, Project, Pipeline] {
  const [owner, project] = createProjectWithOwner(overrides?.user, overrides?.project, config);
  const pipeline = createPipeline(project.id, owner.id, overrides?.pipeline, config);
  return [owner, project, pipeline];
}

// ============================================================================
// BUILDER PATTERN ALTERNATIVE
// ============================================================================

/**
 * Fluent builder for creating complex test scenarios
 * Useful when you need to build up state across multiple steps
 */
export class TestDataBuilder {
  private users: User[] = [];
  private projects: Project[] = [];
  private pipelines: Pipeline[] = [];
  private config?: FactoryConfig;

  constructor(config?: FactoryConfig) {
    this.config = config;
  }

  /**
   * Add a user to the builder
   */
  withUser(overrides?: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>): this {
    this.users.push(createUser(overrides, this.config));
    return this;
  }

  /**
   * Add multiple users
   */
  withUsers(count: number, overrides?: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>): this {
    this.users.push(...createUsers(count, overrides, this.config));
    return this;
  }

  /**
   * Add a project owned by the last created user, or a new user if none exist
   */
  withProject(overrides?: Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>>): this {
    const owner = this.getLastUserOrCreate();
    this.projects.push(createProject(owner.id, overrides, this.config));
    return this;
  }

  /**
   * Add a pipeline to the last created project
   */
  withPipeline(overrides?: Partial<Omit<Pipeline, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'createdBy'>>): this {
    const project = this.getLastProjectOrThrow();
    const creator = this.users.find(u => u.id === project.ownerId) ?? this.getLastUserOrCreate();
    this.pipelines.push(createPipeline(project.id, creator.id, overrides, this.config));
    return this;
  }

  /**
   * Build and return all created entities
   */
  build(): { users: User[]; projects: Project[]; pipelines: Pipeline[] } {
    return {
      users: [...this.users],
      projects: [...this.projects],
      pipelines: [...this.pipelines],
    };
  }

  private getLastUserOrCreate(): User {
    if (this.users.length === 0) {
      this.users.push(createUser(undefined, this.config));
    }
    return this.users[this.users.length - 1];
  }

  private getLastProjectOrThrow(): Project {
    if (this.projects.length === 0) {
      throw new FactoryConfigError('No projects exist. Call withProject() first.');
    }
    return this.projects[this.projects.length - 1];
  }
}

// ============================================================================
// EXPORT CONVENIENCE
// ============================================================================

/**
 * Factory namespace for organized access to all factory functions
 */
export const factories = {
  user: {
    create: createUser,
    createMany: createUsers,
  },
  project: {
    create: createProject,
    createWithOwner: createProjectWithOwner,
  },
  pipeline: {
    create: createPipeline,
  },
  hierarchy: {
    createFull: createFullHierarchy,
  },
  builder: (config?: FactoryConfig) => new TestDataBuilder(config),
} as const;