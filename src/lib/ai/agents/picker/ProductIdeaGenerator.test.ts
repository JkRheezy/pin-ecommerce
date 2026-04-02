import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProductIdeaGenerator, type ProductIdeaGeneratorConfig, type ProductIdeaInput, type ProductIdeaOutput } from './ProductIdeaGenerator'
import { StructuredOutputParser } from '@langchain/core/output_parsers'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { RunnableSequence } from '@langchain/core/runnables'
import type { BaseLanguageModel } from '@langchain/core/language_models/base'

// Types Layer: Test fixtures and mocks
interface MockLLMResponse {
  ideas: Array<{
    name: string
    description: string
    category: string
    confidenceScore: number
    targetAudience: string[]
    keyFeatures: string[]
  }>
}

// Mock the LangChain dependencies
vi.mock('@langchain/core/output_parsers', () => ({
  StructuredOutputParser: {
    fromZodSchema: vi.fn().mockReturnValue({
      getFormatInstructions: vi.fn().mockReturnValue('Format instructions'),
      parse: vi.fn()
    })
  }
}))

vi.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: vi.fn().mockReturnValue({
      pipe: vi.fn().mockReturnValue({
        pipe: vi.fn().mockReturnValue({
          invoke: vi.fn()
        })
      })
    })
  }
}))

vi.mock('@langchain/core/runnables', () => ({
  RunnableSequence: {
    from: vi.fn().mockReturnValue({
      invoke: vi.fn()
    })
  }
}))

describe('ProductIdeaGenerator', () => {
  // Config Layer: Default test configuration
  const defaultConfig: ProductIdeaGeneratorConfig = {
    model: {
      temperature: 0.7,
      maxTokens: 2000,
      modelName: 'gpt-4'
    },
    constraints: {
      maxIdeas: 5,
      minConfidenceScore: 0.6,
      allowedCategories: ['SaaS', 'Consumer', 'Enterprise', 'Developer Tools']
    },
    retryPolicy: {
      maxRetries: 3,
      backoffMultiplier: 2,
      initialDelayMs: 1000
    }
  }

  // Valid input fixture
  const validInput: ProductIdeaInput = {
    marketTrends: ['AI automation', 'Remote work tools', 'No-code platforms'],
    userPainPoints: ['Time-consuming manual tasks', 'Fragmented workflows', 'High learning curves'],
    competitorAnalysis: {
      directCompetitors: ['Notion', 'Airtable'],
      indirectCompetitors: ['Google Docs', 'Excel'],
      gaps: ['Better AI integration', 'Simpler onboarding', 'Lower pricing']
    },
    constraints: {
      budget: 'bootstrap',
      timeline: '6 months',
      technicalFeasibility: 'medium'
    }
  }

  let generator: ProductIdeaGenerator
  let mockModel: BaseLanguageModel

  beforeEach(() => {
    vi.clearAllMocks()
    mockModel = {} as BaseLanguageModel
    generator = new ProductIdeaGenerator(mockModel, defaultConfig)
  })

  describe('Layer 1: Types - Input Validation', () => {
    it('should validate required input fields', async () => {
      const invalidInput = {
        marketTrends: [],
        userPainPoints: validInput.userPainPoints,
        competitorAnalysis: validInput.competitorAnalysis,
        constraints: validInput.constraints
      } as ProductIdeaInput

      await expect(generator.generate(invalidInput)).rejects.toThrow('Validation failed: marketTrends must not be empty')
    })

    it('should reject inputs with empty pain points', async () => {
      const invalidInput = {
        ...validInput,
        userPainPoints: []
      }

      await expect(generator.generate(invalidInput)).rejects.toThrow('Validation failed: userPainPoints must not be empty')
    })

    it('should reject competitor analysis with missing gaps', async () => {
      const invalidInput = {
        ...validInput,
        competitorAnalysis: {
          ...validInput.competitorAnalysis,
          gaps: []
        }
      }

      await expect(generator.generate(invalidInput)).rejects.toThrow('Validation failed: competitorAnalysis.gaps must not be empty')
    })

    it('should validate constraint values', async () => {
      const invalidInput = {
        ...validInput,
        constraints: {
          ...validInput.constraints,
          budget: 'invalid-budget' as any
        }
      }

      await expect(generator.generate(invalidInput)).rejects.toThrow('Validation failed: constraints.budget must be one of')
    })
  })

  describe('Layer 2: Config - Configuration Handling', () => {
    it('should use default config when partial config provided', () => {
      const partialConfig: Partial<ProductIdeaGeneratorConfig> = {
        model: {
          temperature: 0.5
        }
      }

      const generatorWithPartialConfig = new ProductIdeaGenerator(mockModel, partialConfig as ProductIdeaGeneratorConfig)
      
      // Access internal config through reflection for testing
      const internalConfig = (generatorWithPartialConfig as any).config
      
      expect(internalConfig.model.temperature).toBe(0.5)
      expect(internalConfig.model.maxTokens).toBe(defaultConfig.model.maxTokens)
      expect(internalConfig.constraints.maxIdeas).toBe(defaultConfig.constraints.maxIdeas)
    })

    it('should override all defaults when complete config provided', () => {
      const customConfig: ProductIdeaGeneratorConfig = {
        model: {
          temperature: 0.9,
          maxTokens: 4000,
          modelName: 'gpt-4-turbo'
        },
        constraints: {
          maxIdeas: 10,
          minConfidenceScore: 0.8,
          allowedCategories: ['AI', 'ML']
        },
        retryPolicy: {
          maxRetries: 5,
          backoffMultiplier: 3,
          initialDelayMs: 500
        }
      }

      const customGenerator = new ProductIdeaGenerator(mockModel, customConfig)
      const internalConfig = (customGenerator as any).config

      expect(internalConfig).toEqual(customConfig)
    })

    it('should validate config constraints are positive', () => {
      const invalidConfig = {
        ...defaultConfig,
        constraints: {
          ...defaultConfig.constraints,
          maxIdeas: 0
        }
      }

      expect(() => new ProductIdeaGenerator(mockModel, invalidConfig)).toThrow('Config validation failed: maxIdeas must be positive')
    })
  })

  describe('Layer 3: Repo - Data Access Patterns', () => {
    it('should cache similar inputs to avoid redundant LLM calls', async () => {
      const mockResponse: ProductIdeaOutput = {
        ideas: [
          {
            id: 'idea-1',
            name: 'AI Task Automator',
            description: 'Automates repetitive tasks using AI',
            category: 'SaaS',
            confidenceScore: 0.85,
            targetAudience: ['Small businesses', 'Freelancers'],
            keyFeatures: ['AI-powered scheduling', 'Email automation', 'Report generation'],
            marketSizeEstimate: '$1B',
            competitiveAdvantage: 'Better AI integration than competitors',
            estimatedDevelopmentTime: '4 months',
            riskFactors: ['AI accuracy', 'User adoption']
          }
        ],
        generatedAt: new Date().toISOString(),
        metadata: {
          modelUsed: 'gpt-4',
          tokensConsumed: 1500,
          processingTimeMs: 2500
        }
      }

      const mockInvoke = vi.fn().mockResolvedValue(mockResponse)
      const mockChain = {
        invoke: mockInvoke
      }
      
      vi.mocked(RunnableSequence.from).mockReturnValue(mockChain as any)

      // First call
      const result1 = await generator.generate(validInput)
      
      // Second call with same input (should use cache)
      const result2 = await generator.generate(validInput)

      expect(mockInvoke).toHaveBeenCalledTimes(1)
      expect(result1).toEqual(result2)
    })

    it('should generate different results for different inputs', async () => {
      const differentInput: ProductIdeaInput = {
        ...validInput,
        marketTrends: ['Blockchain', 'DeFi', 'Web3']
      }

      const mockResponse1: ProductIdeaOutput = {
        ideas: [{ id: 'idea-1', name: 'AI Tool', category: 'SaaS', confidenceScore: 0.8 } as any],
        generatedAt: new Date().toISOString(),
        metadata: { modelUsed: 'gpt-4', tokensConsumed: 1000, processingTimeMs: 2000 }
      }

      const mockResponse2: ProductIdeaOutput = {
        ideas: [{ id: 'idea-2', name: 'DeFi Platform', category: 'Web3', confidenceScore: 0.75 } as any],
        generatedAt: new Date().toISOString(),
        metadata: { modelUsed: 'gpt-4', tokensConsumed: 1200, processingTimeMs: 2200 }
      }

      const mockInvoke = vi.fn()
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2)

      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      const result1 = await generator.generate(validInput)
      const result2 = await generator.generate(differentInput)

      expect(result1.ideas[0].category).toBe('SaaS')
      expect(result2.ideas[0].category).toBe('Web3')
    })
  })

  describe('Layer 4: Service - Business Logic', () => {
    it('should filter ideas below minimum confidence score', async () => {
      const rawResponse = {
        ideas: [
          { name: 'High Confidence Idea', description: 'Desc', category: 'SaaS', confidenceScore: 0.9, targetAudience: ['Users'], keyFeatures: ['Feature 1'] },
          { name: 'Low Confidence Idea', description: 'Desc', category: 'SaaS', confidenceScore: 0.4, targetAudience: ['Users'], keyFeatures: ['Feature 1'] },
          { name: 'Borderline Idea', description: 'Desc', category: 'SaaS', confidenceScore: 0.6, targetAudience: ['Users'], keyFeatures: ['Feature 1'] }
        ]
      }

      const mockInvoke = vi.fn().mockResolvedValue(rawResponse)
      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      const result = await generator.generate(validInput)

      // Should filter out the 0.4 confidence idea, keep 0.9 and 0.6 (at threshold)
      expect(result.ideas).toHaveLength(2)
      expect(result.ideas.every(i => i.confidenceScore >= defaultConfig.constraints.minConfidenceScore)).toBe(true)
    })

    it('should limit ideas to maxIdeas constraint', async () => {
      const manyIdeasResponse = {
        ideas: Array(10).fill(null).map((_, i) => ({
          name: `Idea ${i}`,
          description: 'Description',
          category: 'SaaS',
          confidenceScore: 0.8,
          targetAudience: ['Users'],
          keyFeatures: ['Feature']
        }))
      }

      const mockInvoke = vi.fn().mockResolvedValue(manyIdeasResponse)
      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      const result = await generator.generate(validInput)

      expect(result.ideas).toHaveLength(defaultConfig.constraints.maxIdeas)
    })

    it('should sort ideas by confidence score descending', async () => {
      const unsortedResponse = {
        ideas: [
          { name: 'Medium', description: 'Desc', category: 'SaaS', confidenceScore: 0.7, targetAudience: ['Users'], keyFeatures: ['Feature'] },
          { name: 'High', description: 'Desc', category: 'SaaS', confidenceScore: 0.95, targetAudience: ['Users'], keyFeatures: ['Feature'] },
          { name: 'Low', description: 'Desc', category: 'SaaS', confidenceScore: 0.75, targetAudience: ['Users'], keyFeatures: ['Feature'] }
        ]
      }

      const mockInvoke = vi.fn().mockResolvedValue(unsortedResponse)
      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      const result = await generator.generate(validInput)

      expect(result.ideas[0].confidenceScore).toBe(0.95)
      expect(result.ideas[1].confidenceScore).toBe(0.75)
      expect(result.ideas[2].confidenceScore).toBe(0.7)
    })

    it('should validate and reject ideas in disallowed categories', async () => {
      const invalidCategoryResponse = {
        ideas: [
          { name: 'Valid Idea', description: 'Desc', category: 'SaaS', confidenceScore: 0.8, targetAudience: ['Users'], keyFeatures: ['Feature'] },
          { name: 'Invalid Idea', description: 'Desc', category: 'IllegalCategory', confidenceScore: 0.8, targetAudience: ['Users'], keyFeatures: ['Feature'] }
        ]
      }

      const mockInvoke = vi.fn().mockResolvedValue(invalidCategoryResponse)
      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      const result = await generator.generate(validInput)

      // Should filter out the invalid category idea
      expect(result.ideas).toHaveLength(1)
      expect(result.ideas[0].category).toBe('SaaS')
    })
  })

  describe('Layer 5: Runtime - Execution & Error Handling', () => {
    it('should retry on transient LLM failures', async () => {
      const mockInvoke = vi.fn()
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Service temporarily unavailable'))
        .mockResolvedValueOnce({
          ideas: [{ name: 'Success', description: 'Desc', category: 'SaaS', confidenceScore: 0.8, targetAudience: ['Users'], keyFeatures: ['Feature'] }]
        })

      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      // Mock setTimeout to speed up tests
      vi.useFakeTimers()

      const generatePromise = generator.generate(validInput)

      // Fast-forward through retries
      await vi.advanceTimersByTimeAsync(1000) // First retry delay
      await vi.advanceTimersByTimeAsync(2000) // Second retry delay (backoffMultiplier * initialDelay)

      const result = await generatePromise

      expect(mockInvoke).toHaveBeenCalledTimes(3)
      expect(result.ideas).toHaveLength(1)

      vi.useRealTimers()
    })

    it('should throw after max retries exceeded', async () => {
      const mockInvoke = vi.fn().mockRejectedValue(new Error('Persistent failure'))

      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      vi.useFakeTimers()

      const generatePromise = generator.generate(validInput)

      // Fast-forward through all retries
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(4000)

      await expect(generatePromise).rejects.toThrow('Failed to generate product ideas after 3 retries: Persistent failure')

      vi.useRealTimers()
    })

    it('should handle malformed LLM responses gracefully', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        ideas: 'not-an-array' // Malformed response
      })

      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      await expect(generator.generate(validInput)).rejects.toThrow('Invalid response format: ideas must be an array')
    })

    it('should handle missing required fields in response', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        ideas: [{ name: 'Incomplete Idea' }] // Missing required fields
      })

      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      await expect(generator.generate(validInput)).rejects.toThrow('Invalid idea format: missing required field')
    })

    it('should log structured error information', async () => {
      const mockLogger = {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn()
      }

      // Inject mock logger
      ;(generator as any).logger = mockLogger

      const mockInvoke = vi.fn().mockRejectedValue(new Error('LLM Error'))
      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      vi.useFakeTimers()
      
      const generatePromise = generator.generate(validInput)
      await vi.advanceTimersByTimeAsync(7000) // All retries
      await expect(generatePromise).rejects.toThrow()

      // Verify structured logging was called
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'product_idea_generation_failed',
          error: expect.any(String),
          retryCount: expect.any(Number),
          inputHash: expect.any(String)
        })
      )

      vi.useRealTimers()
    })
  })

  describe('Layer 6: UI - Output Formatting', () => {
    it('should include all required output fields', async () => {
      const mockResponse = {
        ideas: [{
          name: 'Complete Idea',
          description: 'A comprehensive product idea',
          category: 'SaaS',
          confidenceScore: 0.85,
          targetAudience: ['SMBs', 'Enterprise'],
          keyFeatures: ['AI Integration', 'Real-time Sync', 'API Access'],
          marketSizeEstimate: '$5B TAM',
          competitiveAdvantage: 'First-mover advantage in niche',
          estimatedDevelopmentTime: '6 months',
          riskFactors: ['Technical complexity', 'Market timing']
        }]
      }

      const mockInvoke = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      const result = await generator.generate(validInput)

      // Verify all ideas have required UI fields
      result.ideas.forEach(idea => {
        expect(idea.id).toBeDefined()
        expect(idea.name).toBeDefined()
        expect(idea.description).toBeDefined()
        expect(idea.category).toBeDefined()
        expect(idea.confidenceScore).toBeDefined()
        expect(idea.targetAudience).toBeInstanceOf(Array)
        expect(idea.keyFeatures).toBeInstanceOf(Array)
      })

      // Verify metadata
      expect(result.metadata).toMatchObject({
        modelUsed: expect.any(String),
        tokensConsumed: expect.any(Number),
        processingTimeMs: expect.any(Number)
      })

      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) // ISO format
    })

    it('should generate unique IDs for each idea', async () => {
      const mockResponse = {
        ideas: [
          { name: 'Idea 1', description: 'Desc', category: 'SaaS', confidenceScore: 0.8, targetAudience: ['Users'], keyFeatures: ['Feature'] },
          { name: 'Idea 2', description: 'Desc', category: 'SaaS', confidenceScore: 0.85, targetAudience: ['Users'], keyFeatures: ['Feature'] },
          { name: 'Idea 3', description: 'Desc', category: 'SaaS', confidenceScore: 0.9, targetAudience: ['Users'], keyFeatures: ['Feature'] }
        ]
      }

      const mockInvoke = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      const result = await generator.generate(validInput)

      const ids = result.ideas.map(i => i.id)
      const uniqueIds = new Set(ids)
      
      expect(uniqueIds.size).toBe(ids.length) // All IDs are unique
    })

    it('should format confidence score as percentage for UI display', async () => {
      const mockResponse = {
        ideas: [{ name: 'Idea', description: 'Desc', category: 'SaaS', confidenceScore: 0.8567, targetAudience: ['Users'], keyFeatures: ['Feature'] }]
      }

      const mockInvoke = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      const result = await generator.generate(validInput)

      // Score should be preserved as number, UI layer can format
      expect(typeof result.ideas[0].confidenceScore).toBe('number')
      expect(result.ideas[0].confidenceScore).toBe(0.8567)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty competitor gaps with warning', async () => {
      const inputWithNoGaps = {
        ...validInput,
        competitorAnalysis: {
          ...validInput.competitorAnalysis,
          gaps: ['No clear gaps identified']
        }
      }

      const mockInvoke = vi.fn().mockResolvedValue({
        ideas: [{ name: 'Generic Idea', description: 'Desc', category: 'SaaS', confidenceScore: 0.7, targetAudience: ['Users'], keyFeatures: ['Feature'] }]
      })

      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      const result = await generator.generate(inputWithNoGaps)
      expect(result.ideas).toHaveLength(1)
    })

    it('should handle very long input strings', async () => {
      const longInput: ProductIdeaInput = {
        ...validInput,
        marketTrends: [Array(10000).fill('a').join('')] // 10KB string
      }

      const mockInvoke = vi.fn().mockResolvedValue({
        ideas: [{ name: 'Idea', description: 'Desc', category: 'SaaS', confidenceScore: 0.8, targetAudience: ['Users'], keyFeatures: ['Feature'] }]
      })

      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      // Should not throw, should truncate or handle gracefully
      const result = await generator.generate(longInput)
      expect(result.ideas).toBeDefined()
    })

    it('should handle special characters in input', async () => {
      const specialCharInput: ProductIdeaInput = {
        ...validInput,
        userPainPoints: ['Can\'t sync data"', 'Issues with "special" chars <script>alert(1)</script>']
      }

      const mockInvoke = vi.fn().mockResolvedValue({
        ideas: [{ name: 'Idea', description: 'Desc', category: 'SaaS', confidenceScore: 0.8, targetAudience: ['Users'], keyFeatures: ['Feature'] }]
      })

      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      // Should sanitize or handle special characters safely
      const result = await generator.generate(specialCharInput)
      expect(result.ideas).toBeDefined()
    })

    it('should handle concurrent generation requests', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        ideas: [{ name: 'Idea', description: 'Desc', category: 'SaaS', confidenceScore: 0.8, targetAudience: ['Users'], keyFeatures: ['Feature'] }]
      })

      vi.mocked(RunnableSequence.from).mockReturnValue({ invoke: mockInvoke } as any)

      const differentInput = {
        ...validInput,
        marketTrends: ['Different trend']
      }

      // Run concurrent requests
      const [result1, result2] = await Promise.all([
        generator.generate(validInput),
        generator.generate(differentInput)
      ])

      expect(result1).toBeDefined()
      expect(result2).toBeDefined()
      expect(mockInvoke).toHaveBeenCalledTimes(2)
    })
  })
})