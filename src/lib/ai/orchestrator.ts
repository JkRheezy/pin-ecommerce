/**
 * Orchestrator.ts
 * 
 * Main orchestrator implementation with LangGraph integration.
 * Provides a workflow-based AI agent system for complex multi-step operations.
 * 
 * Layer: Service (Layer 4)
 */

import { z } from 'zod';
import { Logger } from '@harness/logging';
import { Config } from '../config';
import { Types } from '../types';

// LangGraph imports
import {
  StateGraph,
  END,
  START,
  type StateDefinition,
  type StateType,
  type UpdateType,
} from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

// -----------------------------------------------------------------------------
// Types Layer (Layer 1)
// -----------------------------------------------------------------------------

/**
 * Schema for orchestrator configuration
 */
export const OrchestratorConfigSchema = z.object({
  modelName: z.string().default('gpt-4'),
  temperature: z.number().min(0).max(2).default(0.1),
  maxIterations: z.number().positive().default(10),
  timeoutMs: z.number().positive().default(30000),
  enableTracing: z.boolean().default(false),
});

export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

/**
 * Schema for workflow state
 */
export const WorkflowStateSchema = z.object({
  messages: z.array(z.any()).default([]),
  context: z.record(z.any()).default({}),
  currentStep: z.string().default('start'),
  iterationCount: z.number().default(0),
  isComplete: z.boolean().default(false),
  error: z.string().optional(),
  result: z.any().optional(),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

/**
 * Node function type for workflow steps
 */
export type WorkflowNode = (state: WorkflowState) => Promise<Partial<WorkflowState>>;

/**
 * Edge condition type for workflow routing
 */
export type EdgeCondition = (state: WorkflowState) => string;

/**
 * Workflow definition structure
 */
export interface WorkflowDefinition {
  name: string;
  description: string;
  nodes: Map<string, WorkflowNode>;
  edges: Map<string, EdgeCondition | string>;
  entryPoint: string;
}

// -----------------------------------------------------------------------------
// Config Layer (Layer 2) - Injected via constructor
// -----------------------------------------------------------------------------

// Configuration is passed through constructor, validated at runtime

// -----------------------------------------------------------------------------
// Repository Layer (Layer 3) - Abstractions for external dependencies
// -----------------------------------------------------------------------------

/**
 * Abstract repository for LLM interactions
 */
export interface LLMRepository {
  invoke(messages: Array<SystemMessage | HumanMessage | AIMessage>): Promise<AIMessage>;
  stream(messages: Array<SystemMessage | HumanMessage | AIMessage>): AsyncIterable<AIMessage>;
}

/**
 * LangChain-based LLM repository implementation
 */
export class LangChainLLMRepository implements LLMRepository {
  private readonly model: ChatOpenAI;

  constructor(config: OrchestratorConfig, private readonly logger: Logger) {
    this.model = new ChatOpenAI({
      modelName: config.modelName,
      temperature: config.temperature,
    });
  }

  async invoke(messages: Array<SystemMessage | HumanMessage | AIMessage>): Promise<AIMessage> {
    this.logger.debug('Invoking LLM with messages', { messageCount: messages.length });
    try {
      const response = await this.model.invoke(messages);
      this.logger.debug('LLM response received', { contentLength: response.content.toString().length });
      return response;
    } catch (error) {
      this.logger.error('LLM invocation failed', { error });
      throw new Types.LLMError('Failed to invoke LLM', { cause: error });
    }
  }

  async *stream(messages: Array<SystemMessage | HumanMessage | AIMessage>): AsyncIterable<AIMessage> {
    this.logger.debug('Streaming LLM response', { messageCount: messages.length });
    try {
      const stream = await this.model.stream(messages);
      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error) {
      this.logger.error('LLM streaming failed', { error });
      throw new Types.LLMError('Failed to stream LLM response', { cause: error });
    }
  }
}

// -----------------------------------------------------------------------------
// Service Layer (Layer 4) - Main Orchestrator Implementation
// -----------------------------------------------------------------------------

/**
 * Custom error types for orchestrator operations
 */
export class OrchestratorError extends Types.BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, { ...options, code: 'ORCHESTRATOR_ERROR' });
  }
}

export class WorkflowError extends Types.BaseError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, { ...options, code: 'WORKFLOW_ERROR' });
  }
}

/**
 * Main Orchestrator class with LangGraph integration
 * 
 * This class provides a workflow-based system for coordinating
 * multi-step AI operations using LangGraph for state management
 * and flow control.
 */
export class Orchestrator {
  private readonly config: OrchestratorConfig;
  private readonly logger: Logger;
  private readonly llmRepository: LLMRepository;
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private compiledGraphs: Map<string, ReturnType<StateGraph<any, any, any, any>['compile']>> = new Map();

  constructor(
    config: unknown,
    logger: Logger,
    llmRepository?: LLMRepository
  ) {
    // Validate configuration using Zod schema
    const parseResult = OrchestratorConfigSchema.safeParse(config);
    if (!parseResult.success) {
      throw new OrchestratorError(
        `Invalid orchestrator configuration: ${parseResult.error.message}`
      );
    }
    
    this.config = parseResult.data;
    this.logger = logger.child({ component: 'Orchestrator' });
    
    // Initialize LLM repository (can be injected for testing)
    this.llmRepository = llmRepository ?? new LangChainLLMRepository(this.config, this.logger);
    
    this.logger.info('Orchestrator initialized', {
      modelName: this.config.modelName,
      maxIterations: this.config.maxIterations,
    });
  }

  /**
   * Register a new workflow definition
   * 
   * @param workflow - The workflow definition to register
   * @throws {OrchestratorError} If workflow with same name already exists
   */
  registerWorkflow(workflow: WorkflowDefinition): void {
    // Validate workflow definition
    if (this.workflows.has(workflow.name)) {
      throw new OrchestratorError(`Workflow '${workflow.name}' already registered`);
    }

    if (!workflow.nodes.has(workflow.entryPoint)) {
      throw new OrchestratorError(
        `Entry point '${workflow.entryPoint}' not found in workflow nodes`
      );
    }

    // Validate all edge targets exist as nodes
    for (const [source, target] of workflow.edges.entries()) {
      if (typeof target === 'string' && target !== END && !workflow.nodes.has(target)) {
        throw new OrchestratorError(
          `Edge from '${source}' targets unknown node '${target}'`
        );
      }
    }

    this.workflows.set(workflow.name, workflow);
    this.logger.info('Workflow registered', { name: workflow.name });

    // Compile the workflow into a LangGraph
    this.compileWorkflow(workflow);
  }

  /**
   * Compile a workflow definition into an executable LangGraph
   * 
   * @param workflow - The workflow to compile
   * @private
   */
  private compileWorkflow(workflow: WorkflowDefinition): void {
    this.logger.debug('Compiling workflow', { name: workflow.name });

    // Define state schema for the graph
    const stateDefinition: StateDefinition = {
      messages: {
        value: (x: any[], y: any[]) => x.concat(y),
        default: () => [],
      },
      context: {
        value: (x: Record<string, any>, y: Record<string, any>) => ({ ...x, ...y }),
        default: () => ({}),
      },
      currentStep: {
        value: (_x: string, y: string) => y,
        default: () => workflow.entryPoint,
      },
      iterationCount: {
        value: (x: number, y: number) => y,
        default: () => 0,
      },
      isComplete: {
        value: (_x: boolean, y: boolean) => y,
        default: () => false,
      },
      error: {
        value: (_x: string | undefined, y: string | undefined) => y,
        default: () => undefined,
      },
      result: {
        value: (_x: any, y: any) => y,
        default: () => undefined,
      },
    };

    // Create state graph
    const graph = new StateGraph<WorkflowState>({ channels: stateDefinition });

    // Add nodes to graph
    for (const [nodeName, nodeFn] of workflow.nodes.entries()) {
      // Wrap node function with error handling and logging
      const wrappedNode = async (state: WorkflowState): Promise<Partial<WorkflowState>> => {
        this.logger.debug('Executing workflow node', { 
          workflow: workflow.name, 
          node: nodeName,
          iteration: state.iterationCount 
        });

        try {
          // Check iteration limit
          if (state.iterationCount >= this.config.maxIterations) {
            throw new WorkflowError(
              `Maximum iterations (${this.config.maxIterations}) exceeded`
            );
          }

          const result = await nodeFn(state);
          
          // Increment iteration count
          const updatedResult: Partial<WorkflowState> = {
            ...result,
            iterationCount: state.iterationCount + 1,
            currentStep: nodeName,
          };

          this.logger.debug('Node execution completed', { node: nodeName });
          return updatedResult;
        } catch (error) {
          this.logger.error('Node execution failed', { node: nodeName, error });
          return {
            error: error instanceof Error ? error.message : String(error),
            isComplete: true,
          };
        }
      };

      graph.addNode(nodeName, wrappedNode);
    }

    // Add edges
    for (const [source, target] of workflow.edges.entries()) {
      if (typeof target === 'function') {
        // Conditional edge
        graph.addConditionalEdges(source, (state: WorkflowState) => {
          try {
            const result = target(state);
            this.logger.debug('Conditional edge evaluated', { source, result });
            return result;
          } catch (error) {
            this.logger.error('Conditional edge evaluation failed', { source, error });
            return END;
          }
        });
      } else {
        // Direct edge
        graph.addEdge(source, target);
      }
    }

    // Set entry point
    graph.addEdge(START, workflow.entryPoint);

    // Compile and store
    const compiled = graph.compile();
    this.compiledGraphs.set(workflow.name, compiled);
    
    this.logger.info('Workflow compiled successfully', { name: workflow.name });
  }

  /**
   * Execute a registered workflow
   * 
   * @param workflowName - Name of the workflow to execute
   * @param initialState - Optional initial state for the workflow
   * @returns Final workflow state after execution
   * @throws {OrchestratorError} If workflow not found or execution fails
   */
  async executeWorkflow(
    workflowName: string,
    initialState: Partial<WorkflowState> = {}
  ): Promise<WorkflowState> {
    this.logger.info('Starting workflow execution', { workflow: workflowName });

    const compiledGraph = this.compiledGraphs.get(workflowName);
    if (!compiledGraph) {
      throw new OrchestratorError(`Workflow '${workflowName}' not found`);
    }

    // Validate and merge initial state
    const mergedState: WorkflowState = {
      messages: [],
      context: {},
      currentStep: 'start',
      iterationCount: 0,
      isComplete: false,
      error: undefined,
      result: undefined,
      ...initialState,
    };

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(
        () => compiledGraph.invoke(mergedState),
        this.config.timeoutMs
      );

      const finalState = WorkflowStateSchema.parse(result);
      
      this.logger.info('Workflow execution completed', {
        workflow: workflowName,
        iterations: finalState.iterationCount,
        isComplete: finalState.isComplete,
        hasError: !!finalState.error,
      });

      return finalState;
    } catch (error) {
      this.logger.error('Workflow execution failed', { workflow: workflowName, error });
      
      if (error instanceof Types.TimeoutError) {
        throw new WorkflowError(`Workflow '${workflowName}' timed out after ${this.config.timeoutMs}ms`);
      }
      
      throw new WorkflowError(
        `Workflow '${workflowName}' execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Stream workflow execution for real-time updates
   * 
   * @param workflowName - Name of the workflow to stream
   * @param initialState - Optional initial state
   * @yields Partial workflow state updates
   */
  async *streamWorkflow(
    workflowName: string,
    initialState: Partial<WorkflowState> = {}
  ): AsyncGenerator<WorkflowState> {
    this.logger.info('Starting workflow stream', { workflow: workflowName });

    const compiledGraph = this.compiledGraphs.get(workflowName);
    if (!compiledGraph) {
      throw new OrchestratorError(`Workflow '${workflowName}' not found`);
    }

    const mergedState: WorkflowState = {
      messages: [],
      context: {},
      currentStep: 'start',
      iterationCount: 0,
      isComplete: false,
      error: undefined,
      result: undefined,
      ...initialState,
    };

    try {
      const stream = await compiledGraph.stream(mergedState);
      
      for await (const update of stream) {
        const parsedUpdate = WorkflowStateSchema.partial().safeParse(update);
        if (parsedUpdate.success) {
          this.logger.debug('Workflow stream update', {
            workflow: workflowName,
            step: parsedUpdate.data.currentStep,
          });
          yield parsedUpdate.data as WorkflowState;
        } else {
          this.logger.warn('Invalid workflow state update', { error: parsedUpdate.error });
        }
      }

      this.logger.info('Workflow stream completed', { workflow: workflowName });
    } catch (error) {
      this.logger.error('Workflow stream failed', { workflow: workflowName, error });
      throw new WorkflowError(
        `Workflow '${workflowName}' stream failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Execute a function with timeout
   * 
   * @param fn - Function to execute
   * @param timeoutMs - Timeout in milliseconds
   * @returns Result of the function
   * @throws {Types.TimeoutError} If execution exceeds timeout
   * @private
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Types.TimeoutError(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Get list of registered workflows
   */
  getRegisteredWorkflows(): Array<{ name: string; description: string }> {
    return Array.from(this.workflows.values()).map(w => ({
      name: w.name,
      description: w.description,
    }));
  }

  /**
   * Unregister a workflow
   * 
   * @param workflowName - Name of workflow to remove
   * @returns True if workflow was removed, false if not found
   */
  unregisterWorkflow(workflowName: string): boolean {
    const existed = this.workflows.delete(workflowName);
    this.compiledGraphs.delete(workflowName);
    
    if (existed) {
      this.logger.info('Workflow unregistered', { name: workflowName });
    }
    
    return existed;
  }

  /**
   * Create a standard agent node that uses the LLM
   * 
   * @param systemPrompt - System prompt for the agent
   * @param transformResponse - Optional function to transform LLM response
   * @returns Workflow node function
   */
  createAgentNode(
    systemPrompt: string,
    transformResponse?: (response: AIMessage, state: WorkflowState) => Partial<WorkflowState>
  ): WorkflowNode {
    return async (state: WorkflowState): Promise<Partial<WorkflowState>> => {
      const messages: Array<SystemMessage | HumanMessage | AIMessage> = [
        new SystemMessage(systemPrompt),
        ...state.messages.map(m => {
          if (m.role === 'human') return new HumanMessage(m.content);
          if (m.role === 'ai') return new AIMessage(m.content);
          return new SystemMessage(m.content);
        }),
      ];

      // Add latest user message if present in context
      if (state.context.userInput) {
        messages.push(new HumanMessage(state.context.userInput));
      }

      const response = await this.llmRepository.invoke(messages);

      // Default transformation: add AI message and mark complete
      const defaultTransform = (resp: AIMessage): Partial<WorkflowState> => ({
        messages: [...state.messages, { role: 'ai', content: resp.content }],
        result: resp.content,
        isComplete: true,
      });

      return transformResponse 
        ? transformResponse(response, state)
        : defaultTransform(response);
    };
  }

  /**
   * Dispose of resources and clean up
   */
  dispose(): void {
    this.logger.info('Disposing orchestrator');
    this.workflows.clear();
    this.compiledGraphs.clear();
  }
}

// -----------------------------------------------------------------------------
// Runtime Layer (Layer 5) - Factory and initialization
// -----------------------------------------------------------------------------

/**
 * Factory for creating orchestrator instances
 */
export class OrchestratorFactory {
  static create(
    config: unknown,
    logger: Logger,
    llmRepository?: LLMRepository
  ): Orchestrator {
    return new Orchestrator(config, logger, llmRepository);
  }
}

// -----------------------------------------------------------------------------
// UI Layer (Layer 6) - Export types and interfaces for consumers
// -----------------------------------------------------------------------------

export {
  // Re-export types for consumers
  WorkflowState,
  WorkflowDefinition,
  WorkflowNode,
  EdgeCondition,
  OrchestratorConfig,
  LLMRepository,
};