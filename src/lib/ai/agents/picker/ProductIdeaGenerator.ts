/**
 * ProductIdeaGenerator.ts
 * 
 * Service-layer agent for generating product ideas based on market trends,
 * user pain points, and innovation opportunities.
 * 
 * Layer: Service (Layer 4)
 */

import { z } from 'zod';
import { structuredLogger } from '@/lib/logging/structuredLogger';
import { OpenAIClient } from '@/lib/ai/clients/OpenAIClient';
import { PromptTemplate } from '@/lib/ai/prompts/PromptTemplate';
import { Result, ok, err } from '@/lib/types/Result';
import { ProductIdea, ProductIdeaSchema } from '@/lib/types/ai/ProductIdea';
import { AgentConfig, AgentConfigSchema } from '@/lib/types/ai/AgentConfig';

// ============================================================================
// Types (Layer 1)
// ============================================================================

/**
 * Input parameters for product idea generation
 */
export interface ProductIdeaGeneratorInput {
  /** Target market or industry vertical */
  marketVertical: string;
  /** Specific pain points to address (optional) */
  painPoints?: string[];
  /** Innovation constraints (budget, timeline, tech stack) */
  constraints?: InnovationConstraints;
  /** Number of ideas to generate */
  count?: number;
  /** Desired innovation level (incremental to disruptive) */
  innovationLevel?: 'incremental' | 'adjacent' | 'disruptive';
}

/**
 * Constraints that bound the innovation search space
 */
export interface InnovationConstraints {
  maxBudgetUsd?: number;
  timelineMonths?: number;
  requiredTechStack?: string[];
  regulatoryRequirements?: string[];
}

/**
 * Contextual market data to inform generation
 */
export interface MarketContext {
  trends: MarketTrend[];
  competitorAnalysis: CompetitorInsight[];
  customerSegments: CustomerSegment[];
}

export interface MarketTrend {
  name: string;
  growthRate: number;
  maturity: 'emerging' | 'growing' | 'mature' | 'declining';
}

export interface CompetitorInsight {
  companyName: string;
  productCategory: string;
  marketShare?: number;
  weaknesses: string[];
}

export interface CustomerSegment {
  name: string;
  size: number;
  keyNeeds: string[];
  willingnessToPay: 'low' | 'medium' | 'high';
}

// ============================================================================
// Configuration (Layer 2)
// ============================================================================

const DEFAULT_CONFIG: AgentConfig = {
  name: 'ProductIdeaGenerator',
  model: 'gpt-4-turbo-preview',
  temperature: 0.8, // Higher temperature for creative ideation
  maxTokens: 4000,
  timeoutMs: 30000,
};

const ProductIdeaGeneratorConfigSchema = AgentConfigSchema.extend({
  name: z.literal('ProductIdeaGenerator'),
});

// ============================================================================
// Service Implementation (Layer 4)
// ============================================================================

/**
 * ProductIdeaGenerator generates innovative product concepts using
 * market analysis and creative AI prompting.
 * 
 * @example
 * const generator = new ProductIdeaGenerator(openAIClient);
 * const ideas = await generator.generate({
 *   marketVertical: 'Healthcare',
 *   innovationLevel: 'disruptive',
 *   count: 5
 * });
 */
export class ProductIdeaGenerator {
  private readonly logger = structuredLogger.forComponent('ProductIdeaGenerator');
  private readonly promptTemplate: PromptTemplate;

  constructor(
    private readonly aiClient: OpenAIClient,
    private readonly config: AgentConfig = DEFAULT_CONFIG
  ) {
    // Validate configuration at construction time
    const validation = ProductIdeaGeneratorConfigSchema.safeParse(config);
    if (!validation.success) {
      throw new Error(`Invalid agent config: ${validation.error.message}`);
    }

    this.promptTemplate = new PromptTemplate({
      name: 'product-idea-generation',
      version: '1.0.0',
      template: this.buildPromptTemplate(),
    });

    this.logger.info('ProductIdeaGenerator initialized', {
      model: config.model,
      temperature: config.temperature,
    });
  }

  /**
   * Generates product ideas based on input parameters and optional market context.
   * 
   * @param input - Generation parameters
   * @param marketContext - Optional market research data
   * @returns Result containing array of validated ProductIdea objects
   */
  async generate(
    input: ProductIdeaGeneratorInput,
    marketContext?: MarketContext
  ): Promise<Result<ProductIdea[], ProductIdeaGenerationError>> {
    // Validate inputs
    const inputValidation = this.validateInput(input);
    if (inputValidation.isErr()) {
      return err(inputValidation.error);
    }

    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    this.logger.info('Starting product idea generation', {
      requestId,
      marketVertical: input.marketVertical,
      count: input.count,
      innovationLevel: input.innovationLevel,
    });

    try {
      // Build the prompt with all context
      const prompt = this.buildGenerationPrompt(input, marketContext);
      
      // Call AI with structured output expectation
      const response = await this.aiClient.complete({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        response_format: { type: 'json_object' },
      });

      // Parse and validate the structured response
      const parsedIdeas = this.parseAndValidateResponse(
        response.content,
        input.count ?? 3
      );

      if (parsedIdeas.isErr()) {
        this.logger.error('Failed to parse AI response', {
          requestId,
          error: parsedIdeas.error.message,
          rawResponse: response.content.slice(0, 500),
        });
        return err(parsedIdeas.error);
      }

      const durationMs = Date.now() - startTime;
      this.logger.info('Product idea generation completed', {
        requestId,
        ideaCount: parsedIdeas.value.length,
        durationMs,
      });

      return ok(parsedIdeas.value);

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const wrappedError = new ProductIdeaGenerationError(
        'Generation failed',
        error instanceof Error ? error : undefined
      );

      this.logger.error('Product idea generation failed', {
        requestId,
        error: wrappedError.message,
        cause: wrappedError.cause?.message,
        durationMs,
      });

      return err(wrappedError);
    }
  }

  /**
   * Validates input parameters against schema constraints.
   */
  private validateInput(
    input: ProductIdeaGeneratorInput
  ): Result<void, ProductIdeaGenerationError> {
    const schema = z.object({
      marketVertical: z.string().min(1).max(100),
      painPoints: z.array(z.string().max(500)).max(10).optional(),
      constraints: z.object({
        maxBudgetUsd: z.number().positive().optional(),
        timelineMonths: z.number().positive().max(60).optional(),
        requiredTechStack: z.array(z.string()).max(20).optional(),
        regulatoryRequirements: z.array(z.string()).max(10).optional(),
      }).optional(),
      count: z.number().int().min(1).max(20).optional(),
      innovationLevel: z.enum(['incremental', 'adjacent', 'disruptive']).optional(),
    });

    const result = schema.safeParse(input);
    if (!result.success) {
      return err(
        new ProductIdeaGenerationError(
          `Invalid input: ${result.error.issues.map(i => i.message).join(', ')}`
        )
      );
    }

    return ok(undefined);
  }

  /**
   * Builds the generation prompt incorporating all available context.
   */
  private buildGenerationPrompt(
    input: ProductIdeaGeneratorInput,
    marketContext?: MarketContext
  ): string {
    const sections: string[] = [];

    // Core generation request
    sections.push(`Generate ${input.count ?? 3} innovative product ideas for the ${input.marketVertical} market.`);

    // Innovation level guidance
    const innovationDescriptions: Record<string, string> = {
      incremental: 'small improvements to existing solutions',
      adjacent: 'new applications of existing technologies in nearby markets',
      disruptive: 'breakthrough innovations that could redefine the market',
    };
    
    if (input.innovationLevel) {
      sections.push(`Focus on ${innovationDescriptions[input.innovationLevel]}.`);
    }

    // Pain points context
    if (input.painPoints?.length) {
      sections.push('\nAddress these specific pain points:');
      input.painPoints.forEach((point, i) => {
        sections.push(`${i + 1}. ${point}`);
      });
    }

    // Constraints
    if (input.constraints) {
      sections.push('\nConstraints:');
      if (input.constraints.maxBudgetUsd) {
        sections.push(`- Maximum budget: $${input.constraints.maxBudgetUsd.toLocaleString()}`);
      }
      if (input.constraints.timelineMonths) {
        sections.push(`- Timeline: ${input.constraints.timelineMonths} months`);
      }
      if (input.constraints.requiredTechStack?.length) {
        sections.push(`- Required technologies: ${input.constraints.requiredTechStack.join(', ')}`);
      }
      if (input.constraints.regulatoryRequirements?.length) {
        sections.push(`- Regulatory requirements: ${input.constraints.regulatoryRequirements.join(', ')}`);
      }
    }

    // Market context integration
    if (marketContext) {
      sections.push('\nMarket Context:');
      
      if (marketContext.trends.length) {
        sections.push('Key Trends:');
        marketContext.trends
          .filter(t => t.maturity !== 'declining')
          .slice(0, 5)
          .forEach(t => {
            sections.push(`- ${t.name} (${t.maturity}, ${t.growthRate}% growth)`);
          });
      }

      if (marketContext.competitorAnalysis.length) {
        sections.push('\nCompetitive Gaps:');
        marketContext.competitorAnalysis
          .flatMap(c => c.weaknesses.map(w => `- ${c.companyName}: ${w}`))
          .slice(0, 5)
          .forEach(w => sections.push(w));
      }

      if (marketContext.customerSegments.length) {
        const highValueSegment = marketContext.customerSegments
          .sort((a, b) => {
            const wtpOrder = { high: 3, medium: 2, low: 1 };
            return wtpOrder[b.willingnessToPay] - wtpOrder[a.willingnessToPay];
          })[0];
        
        sections.push(`\nPriority Segment: ${highValueSegment.name}`);
        sections.push(`Key needs: ${highValueSegment.keyNeeds.join(', ')}`);
      }
    }

    // Output format specification
    sections.push(`
Return a JSON object with this structure:
{
  "ideas": [
    {
      "name": "Product name",
      "tagline": "Compelling one-sentence description",
      "description": "Detailed explanation (2-3 sentences)",
      "targetCustomer": "Primary user segment",
      "keyDifferentiator": "What makes this unique vs. alternatives",
      "estimatedMarketSize": "TAM/SAM/SOM estimate",
      "complexity": "low|medium|high",
      "confidenceScore": 0.0-1.0
    }
  ]
}`);

    return sections.join('\n');
  }

  /**
   * System prompt establishing the AI's role and constraints.
   */
  private getSystemPrompt(): string {
    return `You are an expert product strategist and innovation consultant with deep experience across multiple industries. 

Your task is to generate viable, creative product ideas that:
- Solve real customer problems with clear value propositions
- Are differentiated from existing market solutions
- Consider technical feasibility and business viability
- Include specific, actionable details rather than vague concepts

Be bold in ideation but grounded in market reality. Avoid generic ideas that could apply to any industry.`;
  }

  /**
   * Parses JSON response and validates against ProductIdea schema.
   */
  private parseAndValidateResponse(
    content: string,
    expectedCount: number
  ): Result<ProductIdea[], ProductIdeaGenerationError> {
    let parsed: unknown;
    
    try {
      parsed = JSON.parse(content);
    } catch {
      return err(
        new ProductIdeaGenerationError('AI response was not valid JSON')
      );
    }

    // Validate structure
    const structureSchema = z.object({
      ideas: z.array(z.unknown()),
    });

    const structureResult = structureSchema.safeParse(parsed);
    if (!structureResult.success) {
      return err(
        new ProductIdeaGenerationError(
          `Invalid response structure: ${structureResult.error.message}`
        )
      );
    }

    const { ideas } = structureResult.data as { ideas: unknown[] };

    // Validate each idea against ProductIdea schema
    const validatedIdeas: ProductIdea[] = [];
    const validationErrors: string[] = [];

    for (let i = 0; i < ideas.length; i++) {
      const result = ProductIdeaSchema.safeParse(ideas[i]);
      if (result.success) {
        validatedIdeas.push(result.data);
      } else {
        validationErrors.push(`Idea ${i + 1}: ${result.error.issues[0]?.message}`);
      }
    }

    // Accept partial results if we got at least one valid idea
    if (validatedIdeas.length === 0) {
      return err(
        new ProductIdeaGenerationError(
          `No valid ideas generated. Errors: ${validationErrors.join('; ')}`
        )
      );
    }

    if (validatedIdeas.length < expectedCount) {
      this.logger.warn('Partial idea generation', {
        expected: expectedCount,
        received: validatedIdeas.length,
        errors: validationErrors,
      });
    }

    return ok(validatedIdeas);
  }

  /**
   * Template builder for the prompt system.
   */
  private buildPromptTemplate(): string {
    return `{{marketContext}}

Generate {{count}} product ideas for {{marketVertical}}.

Innovation focus: {{innovationLevel}}
{{#painPoints}}
Pain points to address:
{{#each}}- {{this}}{{/each}}
{{/painPoints}}

{{#constraints}}
Constraints:
{{#maxBudgetUsd}}- Budget: ${{this}}{{/maxBudgetUsd}}
{{#timelineMonths}}- Timeline: {{this}} months{{/timelineMonths}}
{{/constraints}}

Respond with valid JSON.`;
  }
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Domain-specific error for product idea generation failures.
 */
export class ProductIdeaGenerationError extends Error {
  constructor(
    message: string,
    readonly cause?: Error,
    readonly code: string = 'GENERATION_FAILED'
  ) {
    super(message);
    this.name = 'ProductIdeaGenerationError';
    
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProductIdeaGenerationError);
    }
  }
}