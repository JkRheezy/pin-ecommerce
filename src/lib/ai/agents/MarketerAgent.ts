/**
 * MarketerAgent - AI-powered marketing automation agent
 * 
 * Handles:
 * - Product description generation
 * - SEO optimization
 * - Social media content creation
 * 
 * @module src/lib/ai/agents/MarketerAgent
 */

import { z } from 'zod';
import { BaseAgent, AgentConfig, AgentResult } from './BaseAgent';
import { StructuredLogger } from '../../logging/StructuredLogger';
import { LLMProvider, LLMRequest, LLMResponse } from '../providers/LLMProvider';
import { SEOAnalyzer, SEOAnalysisResult } from '../seo/SEOAnalyzer';
import { SocialMediaPlatform, ContentFormat } from '../../types/marketing';

// ============================================================================
// TYPES LAYER
// ============================================================================

/**
 * Schema for product information input
 */
export const ProductInfoSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  features: z.array(z.string()).min(1).max(20),
  targetAudience: z.array(z.string()).min(1).max(10),
  pricePoint: z.enum(['budget', 'mid-range', 'premium', 'luxury']).optional(),
  uniqueSellingPoints: z.array(z.string()).max(10).optional(),
  tone: z.enum(['professional', 'casual', 'playful', 'luxury', 'technical']).default('professional'),
});

export type ProductInfo = z.infer<typeof ProductInfoSchema>;

/**
 * Schema for generated product description
 */
export const ProductDescriptionSchema = z.object({
  shortDescription: z.string().max(160), // Meta description length
  fullDescription: z.string().min(100).max(5000),
  keyBenefits: z.array(z.string()).min(3).max(7),
  callToAction: z.string().max(200),
  keywords: z.array(z.string()),
  readabilityScore: z.number().min(0).max(100).optional(),
});

export type ProductDescription = z.infer<typeof ProductDescriptionSchema>;

/**
 * Schema for SEO-optimized content
 */
export const SEOContentSchema = z.object({
  title: z.string().min(10).max(70), // Optimal title length
  metaDescription: z.string().max(160),
  headings: z.object({
    h1: z.string(),
    h2s: z.array(z.string()),
  }),
  content: z.string().min(300),
  internalLinks: z.array(z.object({
    anchorText: z.string(),
    url: z.string().url(),
  })).optional(),
  schemaMarkup: z.record(z.unknown()).optional(),
  seoScore: z.number().min(0).max(100),
});

export type SEOContent = z.infer<typeof SEOContentSchema>;

/**
 * Schema for social media post
 */
export const SocialMediaPostSchema = z.object({
  platform: z.nativeEnum(SocialMediaPlatform),
  content: z.string().min(1),
  hashtags: z.array(z.string()),
  mentions: z.array(z.string()).optional(),
  mediaSuggestions: z.array(z.string()).optional(),
  optimalPostingTime: z.string().datetime().optional(),
  engagementPrediction: z.object({
    estimatedReach: z.number().int().positive(),
    estimatedEngagement: z.number().min(0).max(1),
  }).optional(),
  characterCount: z.number().int().positive(),
  isWithinLimits: z.boolean(),
});

export type SocialMediaPost = z.infer<typeof SocialMediaPostSchema>;

/**
 * Configuration for MarketerAgent
 */
export interface MarketerAgentConfig extends AgentConfig {
  seoAnalyzer?: SEOAnalyzer;
  defaultTone?: ProductInfo['tone'];
  maxRetries?: number;
  enableEngagementPrediction?: boolean;
}

// ============================================================================
// CONFIG LAYER
// ============================================================================

const DEFAULT_MARKETER_CONFIG: Partial<MarketerAgentConfig> = {
  maxRetries: 3,
  defaultTone: 'professional',
  enableEngagementPrediction: true,
  timeoutMs: 30000,
};

const PLATFORM_LIMITS: Record<SocialMediaPlatform, number> = {
  [SocialMediaPlatform.TWITTER]: 280,
  [SocialMediaPlatform.THREADS]: 500,
  [SocialMediaPlatform.LINKEDIN]: 3000,
  [SocialMediaPlatform.INSTAGRAM]: 2200,
  [SocialMediaPlatform.FACEBOOK]: 63206,
  [SocialMediaPlatform.TIKTOK]: 2200,
};

// ============================================================================
// SERVICE LAYER
// ============================================================================

/**
 * MarketerAgent - AI agent for marketing automation
 * 
 * Implements the six-layer architecture:
 * - Types: Zod schemas for validation
 * - Config: Default configurations and constants
 * - Repo: (Inherited from BaseAgent) LLM provider interactions
 * - Service: Core business logic for marketing tasks
 * - Runtime: Execution and error handling
 * - UI: (Not applicable - backend service)
 */
export class MarketerAgent extends BaseAgent {
  private readonly logger: StructuredLogger;
  private readonly seoAnalyzer: SEOAnalyzer;
  private readonly config: MarketerAgentConfig;

  constructor(
    llmProvider: LLMProvider,
    config: MarketerAgentConfig = {}
  ) {
    const mergedConfig = { ...DEFAULT_MARKETER_CONFIG, ...config };
    super(llmProvider, mergedConfig);
    
    this.config = mergedConfig as MarketerAgentConfig;
    this.logger = new StructuredLogger('MarketerAgent');
    this.seoAnalyzer = config.seoAnalyzer ?? new SEOAnalyzer();
  }

  /**
   * Generate compelling product descriptions with SEO optimization
   */
  async generateProductDescription(
    productInfo: ProductInfo
  ): Promise<AgentResult<ProductDescription>> {
    const operationId = this.generateOperationId();
    
    this.logger.info('Starting product description generation', {
      operationId,
      productName: productInfo.name,
      category: productInfo.category,
    });

    try {
      // Validate input
      const validatedInfo = ProductInfoSchema.parse(productInfo);

      const prompt = this.buildDescriptionPrompt(validatedInfo);
      
      const llmRequest: LLMRequest = {
        prompt,
        temperature: 0.7,
        maxTokens: 1500,
        systemPrompt: this.getDescriptionSystemPrompt(),
      };

      const response = await this.executeWithRetry(
        () => this.llmProvider.complete(llmRequest),
        this.config.maxRetries ?? 3
      );

      const parsed = this.parseDescriptionResponse(response);
      const validated = ProductDescriptionSchema.parse(parsed);

      // Enhance with SEO analysis
      const seoAnalysis = await this.seoAnalyzer.analyze(validated.fullDescription);
      
      this.logger.info('Product description generated successfully', {
        operationId,
        readabilityScore: validated.readabilityScore,
        seoScore: seoAnalysis.score,
      });

      return {
        success: true,
        data: {
          ...validated,
          readabilityScore: seoAnalysis.readabilityScore,
        },
        metadata: {
          operationId,
          tokensUsed: response.usage?.totalTokens,
          seoAnalysis,
        },
      };

    } catch (error) {
      this.logger.error('Failed to generate product description', {
        operationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return this.handleError(error, operationId);
    }
  }

  /**
   * Generate SEO-optimized content for product pages or blog posts
   */
  async generateSEOContent(
    topic: string,
    targetKeywords: string[],
    contentFormat: ContentFormat = ContentFormat.BLOG_POST
  ): Promise<AgentResult<SEOContent>> {
    const operationId = this.generateOperationId();

    this.logger.info('Starting SEO content generation', {
      operationId,
      topic,
      targetKeywords,
      format: contentFormat,
    });

    try {
      // Validate inputs
      if (!topic.trim() || targetKeywords.length === 0) {
        throw new Error('Topic and at least one target keyword are required');
      }

      const prompt = this.buildSEOPrompt(topic, targetKeywords, contentFormat);
      
      const llmRequest: LLMRequest = {
        prompt,
        temperature: 0.6, // Lower temperature for more focused SEO content
        maxTokens: 2500,
        systemPrompt: this.getSEOSystemPrompt(),
      };

      const response = await this.executeWithRetry(
        () => this.llmProvider.complete(llmRequest),
        this.config.maxRetries ?? 3
      );

      const parsed = this.parseSEOResponse(response);
      const validated = SEOContentSchema.parse(parsed);

      // Validate SEO score meets threshold
      if (validated.seoScore < 70) {
        this.logger.warn('Generated content has low SEO score', {
          operationId,
          seoScore: validated.seoScore,
        });
      }

      this.logger.info('SEO content generated successfully', {
        operationId,
        seoScore: validated.seoScore,
        contentLength: validated.content.length,
      });

      return {
        success: true,
        data: validated,
        metadata: {
          operationId,
          tokensUsed: response.usage?.totalTokens,
          targetKeywords,
        },
      };

    } catch (error) {
      this.logger.error('Failed to generate SEO content', {
        operationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return this.handleError(error, operationId);
    }
  }

  /**
   * Generate social media posts optimized for specific platforms
   */
  async generateSocialMediaPost(
    productInfo: ProductInfo,
    platform: SocialMediaPlatform,
    campaignGoal: 'awareness' | 'engagement' | 'conversion' = 'engagement'
  ): Promise<AgentResult<SocialMediaPost>> {
    const operationId = this.generateOperationId();

    this.logger.info('Starting social media post generation', {
      operationId,
      platform,
      campaignGoal,
      productName: productInfo.name,
    });

    try {
      const validatedInfo = ProductInfoSchema.parse(productInfo);
      const platformLimit = PLATFORM_LIMITS[platform];

      const prompt = this.buildSocialPrompt(validatedInfo, platform, campaignGoal, platformLimit);
      
      const llmRequest: LLMRequest = {
        prompt,
        temperature: 0.8, // Higher temperature for creative social content
        maxTokens: 800,
        systemPrompt: this.getSocialSystemPrompt(platform),
      };

      const response = await this.executeWithRetry(
        () => this.llmProvider.complete(llmRequest),
        this.config.maxRetries ?? 3
      );

      const parsed = this.parseSocialResponse(response, platform);
      const validated = SocialMediaPostSchema.parse({
        ...parsed,
        platform,
        characterCount: parsed.content.length,
        isWithinLimits: parsed.content.length <= platformLimit,
      });

      // Add engagement prediction if enabled
      if (this.config.enableEngagementPrediction) {
        validated.engagementPrediction = await this.predictEngagement(validated);
      }

      if (!validated.isWithinLimits) {
        this.logger.warn('Generated post exceeds platform character limit', {
          operationId,
          characterCount: validated.characterCount,
          limit: platformLimit,
        });
      }

      this.logger.info('Social media post generated successfully', {
        operationId,
        platform,
        characterCount: validated.characterCount,
        hashtagCount: validated.hashtags.length,
      });

      return {
        success: true,
        data: validated,
        metadata: {
          operationId,
          tokensUsed: response.usage?.totalTokens,
          platformLimit,
          campaignGoal,
        },
      };

    } catch (error) {
      this.logger.error('Failed to generate social media post', {
        operationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return this.handleError(error, operationId);
    }
  }

  /**
   * Generate a complete marketing campaign across multiple channels
   */
  async generateCampaign(
    productInfo: ProductInfo,
    channels: {
      productPage?: boolean;
      blogSEO?: boolean;
      socialPlatforms?: SocialMediaPlatform[];
    }
  ): Promise<AgentResult<{
    productDescription?: ProductDescription;
    seoContent?: SEOContent;
    socialPosts?: SocialMediaPost[];
  }>> {
    const operationId = this.generateOperationId();

    this.logger.info('Starting multi-channel campaign generation', {
      operationId,
      channels,
      productName: productInfo.name,
    });

    try {
      const results: {
        productDescription?: ProductDescription;
        seoContent?: SEOContent;
        socialPosts?: SocialMediaPost[];
      } = {};

      // Generate product description if requested
      if (channels.productPage) {
        const descResult = await this.generateProductDescription(productInfo);
        if (!descResult.success) {
          throw new Error(`Product description failed: ${descResult.error}`);
        }
        results.productDescription = descResult.data;
      }

      // Generate SEO content if requested
      if (channels.blogSEO && results.productDescription) {
        const seoResult = await this.generateSEOContent(
          `${productInfo.name} - ${productInfo.category}`,
          results.productDescription.keywords,
          ContentFormat.BLOG_POST
        );
        if (!seoResult.success) {
          throw new Error(`SEO content failed: ${seoResult.error}`);
        }
        results.seoContent = seoResult.data;
      }

      // Generate social posts if requested
      if (channels.socialPlatforms && channels.socialPlatforms.length > 0) {
        results.socialPosts = [];
        for (const platform of channels.socialPlatforms) {
          const socialResult = await this.generateSocialMediaPost(
            productInfo,
            platform
          );
          if (!socialResult.success) {
            this.logger.warn(`Social post generation failed for ${platform}`, {
              operationId,
              error: socialResult.error,
            });
            continue;
          }
          results.socialPosts.push(socialResult.data);
        }
      }

      this.logger.info('Campaign generation completed', {
        operationId,
        componentsGenerated: Object.keys(results).length,
        socialPostsCount: results.socialPosts?.length ?? 0,
      });

      return {
        success: true,
        data: results,
        metadata: {
          operationId,
          channels,
        },
      };

    } catch (error) {
      this.logger.error('Campaign generation failed', {
        operationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return this.handleError(error, operationId);
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private buildDescriptionPrompt(info: ProductInfo): string {
    const uspSection = info.uniqueSellingPoints 
      ? `\nUnique Selling Points:\n${info.uniqueSellingPoints.map(usp => `- ${usp}`).join('\n')}`
      : '';

    return `
Create a compelling product description for:

Product Name: ${info.name}
Category: ${info.category}
Target Audience: ${info.targetAudience.join(', ')}
Tone: ${info.tone}
Price Point: ${info.pricePoint ?? 'Not specified'}

Key Features:
${info.features.map(f => `- ${f}`).join('\n')}${uspSection}

Generate:
1. A short description (max 160 chars) for meta descriptions
2. A full description (100-5000 chars) with engaging copy
3. 3-7 key benefits as bullet points
4. A compelling call-to-action
5. Relevant keywords for SEO

Respond in JSON format matching the ProductDescription schema.
`;
  }

  private buildSEOPrompt(
    topic: string,
    keywords: string[],
    format: ContentFormat
  ): string {
    return `
Create SEO-optimized ${format} content for:

Topic: ${topic}
Target Keywords: ${keywords.join(', ')}

Requirements:
- Title: 10-70 characters, compelling and keyword-rich
- Meta Description: Max 160 characters
- H1: Single, primary keyword focused
- H2s: 3-5 subheadings for structure
- Content: Min 300 words, natural keyword integration
- Include internal linking suggestions
- Add appropriate schema markup recommendations

Respond in JSON format matching the SEOContent schema with seoScore (0-100).
`;
  }

  private buildSocialPrompt(
    info: ProductInfo,
    platform: SocialMediaPlatform,
    goal: string,
    charLimit: number
  ): string {
    const platformSpecifics: Record<SocialMediaPlatform, string> = {
      [SocialMediaPlatform.TWITTER]: 'Concise, punchy, thread-friendly if needed',
      [SocialMediaPlatform.THREADS]: 'Conversational, story-driven',
      [SocialMediaPlatform.LINKEDIN]: 'Professional, industry insights, B2B focused',
      [SocialMediaPlatform.INSTAGRAM]: 'Visual-focused, lifestyle, emoji-friendly',
      [SocialMediaPlatform.FACEBOOK]: 'Community-focused, longer form acceptable',
      [SocialMediaPlatform.TIKTOK]: 'Trendy, authentic, hashtag-heavy',
    };

    return `
Create a ${platform} post for:

Product: ${info.name}
Category: ${info.category}
Tone: ${info.tone}
Campaign Goal: ${goal}
Character Limit: ${charLimit}

Key Features to Highlight:
${info.features.slice(0, 3).map(f => `- ${f}`).join('\n')}

Platform Style: ${platformSpecifics[platform]}

Generate:
1. Engaging post content
2. Relevant hashtags (5-10)
3. Media/content suggestions
4. Optimal posting time recommendation

Respond in JSON format with content, hashtags, mediaSuggestions, and optimalPostingTime.
`;
  }

  private getDescriptionSystemPrompt(): string {
    return `You are an expert e-commerce copywriter specializing in product descriptions that convert. 
Create compelling, benefit-driven copy that resonates with the target audience while maintaining SEO best practices.
Always respond with valid JSON.`;
  }

  private getSEOSystemPrompt(): string {
    return `You are an SEO content strategist with expertise in search engine optimization.
Create content that ranks well while providing genuine value to readers.
Follow Google's E-E-A-T guidelines. Always respond with valid JSON.`;
  }

  private getSocialSystemPrompt(platform: SocialMediaPlatform): string {
    return `You are a social media marketing expert specializing in ${platform} content.
Create engaging, platform-native content that drives ${platform === SocialMediaPlatform.LINKEDIN ? 'professional engagement' : 'audience interaction'}.
Understand platform algorithms and best practices. Always respond with valid JSON.`;
  }

  private parseDescriptionResponse(response: LLMResponse): unknown {
    return this.safeJsonParse(response.content);
  }

  private parseSEOResponse(response: LLMResponse): unknown {
    return this.safeJsonParse(response.content);
  }

  private parseSocialResponse(response: LLMResponse, platform: SocialMediaPlatform): {
    content: string;
    hashtags: string[];
    mediaSuggestions?: string[];
    optimalPostingTime?: string;
  } {
    const parsed = this.safeJsonParse(response.content);
    return {
      content: parsed.content ?? parsed.post ?? '',
      hashtags: parsed.hashtags ?? [],
      mediaSuggestions: parsed.mediaSuggestions,
      optimalPostingTime: parsed.optimalPostingTime,
    };
  }

  private async predictEngagement(post: SocialMediaPost): Promise<{
    estimatedReach: number;
    estimatedEngagement: number;
  }> {
    // Simplified engagement prediction based on content analysis
    // In production, this would use a trained model or external API
    
    const baseEngagement: Record<SocialMediaPlatform, number> = {
      [SocialMediaPlatform.TWITTER]: 0.035,
      [SocialMediaPlatform.THREADS]: 0.05,
      [SocialMediaPlatform.LINKEDIN]: 0.025,
      [SocialMediaPlatform.INSTAGRAM]: 0.03,
      [SocialMediaPlatform.FACEBOOK]: 0.015,
      [SocialMediaPlatform.TIKTOK]: 0.08,
    };

    const hashtagBoost = Math.min(post.hashtags.length * 0.005, 0.02);
    const lengthPenalty = post.content.length > 100 ? 0 : 0.01;
    
    const estimatedEngagement = Math.min(
      baseEngagement[post.platform] + hashtagBoost + lengthPenalty,
      0.15
    );

    // Estimate reach based on typical follower assumptions
    const estimatedReach = Math.floor(10000 * estimatedEngagement * 10);

    return {
      estimatedReach,
      estimatedEngagement: Number(estimatedEngagement.toFixed(4)),
    };
  }

  private safeJsonParse(content: string): unknown {
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/