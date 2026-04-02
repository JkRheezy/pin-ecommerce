// src/lib/ai/agents/DesignerAgent.ts
// Layer: Service (AI Agent orchestration)

import { z } from 'zod';
import { logger } from '@/lib/logging';
import { ImageGenerationConfig, ImageGenerationResult, ImageSize, ImageStyle } from '@/lib/ai/types';
import { ImageGenerationRepository } from '@/lib/ai/repo/ImageGenerationRepository';
import { AIServiceError, ErrorCode } from '@/lib/ai/errors';

// =============================================================================
// Types Layer: Input/Output Schemas and Type Definitions
// =============================================================================

/**
 * Designer agent configuration options
 */
export interface DesignerAgentConfig {
  /** Default image size for generations */
  defaultSize: ImageSize;
  /** Default style preset */
  defaultStyle: ImageStyle;
  /** Maximum retries for failed generations */
  maxRetries: number;
  /** Quality setting (1-100) */
  quality: number;
}

/**
 * Request to generate a design from a concept
 */
export interface DesignRequest {
  /** The concept or description to visualize */
  concept: string;
  /** Optional context about the use case */
  context?: string;
  /** Target audience for the design */
  targetAudience?: string;
  /** Brand guidelines to follow */
  brandGuidelines?: BrandGuidelines;
  /** Specific size requirement */
  size?: ImageSize;
  /** Style override */
  style?: ImageStyle;
  /** Number of variations to generate */
  variations?: number;
}

/**
 * Brand guidelines for consistent design generation
 */
export interface BrandGuidelines {
  /** Primary brand colors (hex codes) */
  colors: string[];
  /** Brand tone description */
  tone: string;
  /** Visual style keywords */
  keywords: string[];
  /** Things to avoid */
  restrictions?: string[];
}

/**
 * Result of a design generation operation
 */
export interface DesignResult {
  /** Unique identifier for this design session */
  sessionId: string;
  /** Generated designs */
  designs: GeneratedDesign[];
  /** Metadata about the generation */
  metadata: DesignMetadata;
}

/**
 * Individual generated design
 */
export interface GeneratedDesign {
  /** Design ID */
  id: string;
  /** URL to the generated image */
  imageUrl: string;
  /** Prompt used for generation */
  prompt: string;
  /** Size of the generated image */
  size: ImageSize;
  /** Generation parameters */
  parameters: Record<string, unknown>;
}

/**
 * Metadata about the design generation process
 */
export interface DesignMetadata {
  /** Original concept provided */
  originalConcept: string;
  /** Final prompt sent to API */
  finalPrompt: string;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Model used for generation */
  model: string;
  /** Timestamp of generation */
  timestamp: Date;
}

// Zod schemas for runtime validation
const DesignRequestSchema = z.object({
  concept: z.string().min(1).max(5000),
  context: z.string().max(2000).optional(),
  targetAudience: z.string().max(500).optional(),
  brandGuidelines: z.object({
    colors: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)),
    tone: z.string(),
    keywords: z.array(z.string()),
    restrictions: z.array(z.string()).optional(),
  }).optional(),
  size: z.nativeEnum(ImageSize).optional(),
  style: z.nativeEnum(ImageStyle).optional(),
  variations: z.number().int().min(1).max(10).default(1),
});

// =============================================================================
// Config Layer: Default Configurations and Constants
// =============================================================================

const DEFAULT_CONFIG: DesignerAgentConfig = {
  defaultSize: ImageSize.LANDSCAPE_16_9,
  defaultStyle: ImageStyle.PHOTOREALISTIC,
  maxRetries: 3,
  quality: 85,
} as const;

const PROMPT_TEMPLATES = {
  base: `Create a professional, high-quality design based on the following concept. 
Focus on clarity, visual appeal, and effective communication.`,

  context: (ctx: string) => `\n\nContext: This design will be used ${ctx}.`,

  audience: (audience: string) => `\n\nTarget Audience: The design should appeal to ${audience}.`,

  brand: (guidelines: BrandGuidelines) => `
\n\nBrand Guidelines:
- Color Palette: ${guidelines.colors.join(', ')}
- Tone: ${guidelines.tone}
- Style Keywords: ${guidelines.keywords.join(', ')}
${guidelines.restrictions ? `- Avoid: ${guidelines.restrictions.join(', ')}` : ''}`,

  stylePresets: {
    [ImageStyle.PHOTOREALISTIC]: 'Photorealistic, highly detailed, professional photography style',
    [ImageStyle.ILLUSTRATION]: 'Clean vector illustration, modern flat design aesthetic',
    [ImageStyle.MINIMALIST]: 'Minimalist design, generous whitespace, essential elements only',
    [ImageStyle.ABSTRACT]: 'Abstract artistic interpretation, bold shapes and colors',
    [ImageStyle.SKETCH]: 'Hand-drawn sketch style, artistic and expressive',
  },
} as const;

// =============================================================================
// Service Layer: DesignerAgent Implementation
// =============================================================================

/**
 * DesignerAgent handles AI-powered design generation with prompt engineering
 * and image API integration. Follows the six-layer architecture pattern.
 */
export class DesignerAgent {
  private readonly config: DesignerAgentConfig;
  private readonly imageRepo: ImageGenerationRepository;

  constructor(
    imageRepo: ImageGenerationRepository,
    config: Partial<DesignerAgentConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.imageRepo = imageRepo;
    
    logger.info('DesignerAgent initialized', {
      defaultSize: this.config.defaultSize,
      defaultStyle: this.config.defaultStyle,
    });
  }

  /**
   * Generates designs from a concept description
   * 
   * @param request - The design request with concept and options
   * @returns Promise resolving to the design result
   * @throws AIServiceError if generation fails after retries
   */
  async generateDesign(request: DesignRequest): Promise<DesignResult> {
    const startTime = Date.now();
    const sessionId = this.generateSessionId();

    logger.info('Starting design generation', {
      sessionId,
      conceptLength: request.concept.length,
      variations: request.variations ?? 1,
    });

    try {
      // Validate input
      const validatedRequest = this.validateRequest(request);
      
      // Build optimized prompt
      const prompt = this.buildPrompt(validatedRequest);
      
      // Prepare generation config
      const genConfig: ImageGenerationConfig = {
        prompt,
        size: validatedRequest.size ?? this.config.defaultSize,
        style: validatedRequest.style ?? this.config.defaultStyle,
        quality: this.config.quality,
        variations: validatedRequest.variations ?? 1,
      };

      // Generate with retry logic
      const generationResult = await this.generateWithRetry(genConfig, sessionId);
      
      // Transform to design result
      const designs: GeneratedDesign[] = generationResult.images.map((img, idx) => ({
        id: `${sessionId}-${idx}`,
        imageUrl: img.url,
        prompt: prompt,
        size: genConfig.size,
        parameters: {
          seed: img.seed,
          style: genConfig.style,
        },
      }));

      const result: DesignResult = {
        sessionId,
        designs,
        metadata: {
          originalConcept: validatedRequest.concept,
          finalPrompt: prompt,
          processingTimeMs: Date.now() - startTime,
          model: generationResult.model,
          timestamp: new Date(),
        },
      };

      logger.info('Design generation completed', {
        sessionId,
        designCount: designs.length,
        processingTimeMs: result.metadata.processingTimeMs,
      });

      return result;

    } catch (error) {
      logger.error('Design generation failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        concept: request.concept.slice(0, 100),
      });

      throw new AIServiceError(
        'Failed to generate design',
        ErrorCode.GENERATION_FAILED,
        { sessionId, originalError: error }
      );
    }
  }

  /**
   * Validates and sanitizes the design request
   */
  private validateRequest(request: DesignRequest): z.infer<typeof DesignRequestSchema> {
    const result = DesignRequestSchema.safeParse(request);
    
    if (!result.success) {
      logger.warn('Design request validation failed', {
        errors: result.error.errors,
      });
      
      throw new AIServiceError(
        'Invalid design request',
        ErrorCode.VALIDATION_ERROR,
        { validationErrors: result.error.errors }
      );
    }

    return result.data;
  }

  /**
   * Builds an optimized prompt from the design request
   * 
   * This method applies prompt engineering best practices:
   * - Structures information hierarchically
   * - Includes negative constraints
   * - Adds style-specific modifiers
   * - Optimizes for the target image generation model
   */
  private buildPrompt(request: z.infer<typeof DesignRequestSchema>): string {
    const parts: string[] = [PROMPT_TEMPLATES.base];

    // Core concept (always present)
    parts.push(`\n\nConcept: ${request.concept}`);

    // Optional context layers
    if (request.context) {
      parts.push(PROMPT_TEMPLATES.context(request.context));
    }

    if (request.targetAudience) {
      parts.push(PROMPT_TEMPLATES.audience(request.targetAudience));
    }

    if (request.brandGuidelines) {
      parts.push(PROMPT_TEMPLATES.brand(request.brandGuidelines));
    }

    // Style specification
    const style = request.style ?? this.config.defaultStyle;
    parts.push(`\n\nVisual Style: ${PROMPT_TEMPLATES.stylePresets[style]}`);

    // Quality modifiers
    parts.push('\n\nTechnical Requirements: Professional quality, sharp focus, well-composed');

    const finalPrompt = parts.join('');

    logger.debug('Prompt built', {
      promptLength: finalPrompt.length,
      hasContext: !!request.context,
      hasBrandGuidelines: !!request.brandGuidelines,
    });

    return finalPrompt;
  }

  /**
   * Generates images with exponential backoff retry logic
   */
  private async generateWithRetry(
    config: ImageGenerationConfig,
    sessionId: string
  ): Promise<ImageGenerationResult> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        logger.debug('Attempting image generation', { sessionId, attempt });
        
        const result = await this.imageRepo.generate(config);
        
        if (attempt > 1) {
          logger.info('Image generation succeeded after retry', {
            sessionId,
            attempts: attempt,
          });
        }
        
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const isRetryable = this.isRetryableError(error);
        
        if (!isRetryable || attempt === this.config.maxRetries) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        
        logger.warn('Image generation attempt failed, retrying', {
          sessionId,
          attempt,
          maxRetries: this.config.maxRetries,
          delayMs,
          error: lastError.message,
        });

        await this.sleep(delayMs);
      }
    }

    // Should not reach here, but TypeScript needs assurance
    throw lastError ?? new Error('Unknown generation error');
  }

  /**
   * Determines if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    // Retry on rate limits, timeouts, and transient server errors
    if (error instanceof AIServiceError) {
      return [
        ErrorCode.RATE_LIMITED,
        ErrorCode.TIMEOUT,
        ErrorCode.SERVICE_UNAVAILABLE,
      ].includes(error.code);
    }
    
    // Default: don't retry unknown errors
    return false;
  }

  /**
   * Generates a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `design-${timestamp}-${random}`;
  }

  /**
   * Promise-based delay utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}