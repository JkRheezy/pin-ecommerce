/**
 * Design Templates Configuration
 * 
 * This module defines the configuration layer for AI-powered design templates.
 * It provides type-safe template definitions and validation for generating
 * UI/UX designs based on user requirements.
 * 
 * Layer: Config (Layer 2 of 6)
 * Dependencies: Types layer (DesignTemplate, TemplateCategory, etc.)
 */

import { z } from 'zod';
import { createLogger } from '@/lib/logging';
import type {
  DesignTemplate,
  TemplateCategory,
  DesignConstraints,
  ColorScheme,
  TypographyScale,
} from '@/lib/ai/types/designTemplates';

// Structured logging instance
const logger = createLogger('DesignTemplatesConfig');

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * Schema for validating color scheme configurations
 */
const ColorSchemeSchema = z.object({
  primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format'),
  secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format'),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format'),
  background: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format'),
  surface: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format'),
  text: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format'),
  textMuted: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format'),
});

/**
 * Schema for validating typography scale configurations
 */
const TypographyScaleSchema = z.object({
  fontFamily: z.string().min(1, 'Font family is required'),
  headingSizes: z.object({
    h1: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Invalid size format'),
    h2: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Invalid size format'),
    h3: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Invalid size format'),
    h4: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Invalid size format'),
  }),
  bodySize: z.string().regex(/^\d+(\.\d+)?(px|rem|em)$/, 'Invalid size format'),
  lineHeight: z.number().positive('Line height must be positive'),
});

/**
 * Schema for validating design constraints
 */
const DesignConstraintsSchema = z.object({
  maxWidth: z.string().regex(/^\d+(\.\d+)?(px|rem|%)$/, 'Invalid width format'),
  gridColumns: z.number().int().min(1).max(24),
  spacingScale: z.array(z.string()).min(2),
  borderRadius: z.string().regex(/^\d+(\.\d+)?(px|rem)$/, 'Invalid radius format'),
  shadowDepth: z.number().int().min(0).max(5),
});

/**
 * Schema for validating complete design templates
 */
const DesignTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  category: z.enum(['dashboard', 'landing', 'form', 'data-display', 'navigation', 'modal']),
  description: z.string().min(10).max(500),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Invalid semantic version'),
  isActive: z.boolean(),
  constraints: DesignConstraintsSchema,
  colorScheme: ColorSchemeSchema,
  typography: TypographyScaleSchema,
  componentPatterns: z.array(z.string()).min(1),
  aiPromptTemplate: z.string().min(50),
  metadata: z.object({
    author: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    tags: z.array(z.string()),
  }),
});

// ============================================================================
// Template Categories Configuration
// ============================================================================

/**
 * Valid template categories with their descriptions
 */
export const TEMPLATE_CATEGORIES: Record<TemplateCategory, string> = {
  dashboard: 'Data visualization and analytics interfaces',
  landing: 'Marketing and conversion-focused pages',
  form: 'Input collection and validation interfaces',
  'data-display': 'Tables, lists, and information presentation',
  navigation: 'Menus, breadcrumbs, and wayfinding elements',
  modal: 'Overlay dialogs and popup interfaces',
} as const;

// ============================================================================
// Default Template Configurations
// ============================================================================

/**
 * Default color scheme following Harness design system
 */
export const DEFAULT_COLOR_SCHEME: ColorScheme = {
  primary: '#0278D5',
  secondary: '#22222A',
  accent: '#00ADE4',
  background: '#F3F3FA',
  surface: '#FFFFFF',
  text: '#22222A',
  textMuted: '#6B6B7B',
};

/**
 * Default typography scale
 */
export const DEFAULT_TYPOGRAPHY: TypographyScale = {
  fontFamily: 'Inter, system-ui, sans-serif',
  headingSizes: {
    h1: '2.5rem',
    h2: '2rem',
    h3: '1.5rem',
    h4: '1.25rem',
  },
  bodySize: '1rem',
  lineHeight: 1.5,
};

/**
 * Default design constraints
 */
export const DEFAULT_CONSTRAINTS: DesignConstraints = {
  maxWidth: '1440px',
  gridColumns: 12,
  spacingScale: ['0.25rem', '0.5rem', '1rem', '1.5rem', '2rem', '3rem', '4rem'],
  borderRadius: '0.5rem',
  shadowDepth: 2,
};

// ============================================================================
// Pre-defined Template Library
// ============================================================================

/**
 * Built-in design templates for common use cases
 */
export const BUILT_IN_TEMPLATES: ReadonlyArray<DesignTemplate> = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'Analytics Dashboard',
    category: 'dashboard',
    description: 'Comprehensive data visualization dashboard with charts, metrics cards, and filtering capabilities.',
    version: '1.0.0',
    isActive: true,
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      gridColumns: 24, // Finer control for dashboard layouts
    },
    colorScheme: DEFAULT_COLOR_SCHEME,
    typography: DEFAULT_TYPOGRAPHY,
    componentPatterns: [
      'metric-card',
      'time-series-chart',
      'data-table',
      'filter-bar',
      'date-range-picker',
    ],
    aiPromptTemplate: `
      Create an analytics dashboard design with the following specifications:
      - Layout: Responsive grid with {gridColumns} columns
      - Primary metric cards in top row (4 cards)
      - Main chart area occupying 2/3 width
      - Side panel with recent activity (1/3 width)
      - Data table below with pagination
      Color scheme: Primary {primary}, Background {background}
      Typography: {fontFamily} with base size {bodySize}
    `.trim(),
    metadata: {
      author: 'Harness Design System',
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z',
      tags: ['analytics', 'data-viz', 'enterprise'],
    },
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
    name: 'Feature Landing Page',
    category: 'landing',
    description: 'High-conversion landing page with hero section, feature grid, testimonials, and CTA.',
    version: '1.0.0',
    isActive: true,
    constraints: DEFAULT_CONSTRAINTS,
    colorScheme: {
      ...DEFAULT_COLOR_SCHEME,
      primary: '#00C853', // Green for positive action
    },
    typography: {
      ...DEFAULT_TYPOGRAPHY,
      headingSizes: {
        h1: '3.5rem',
        h2: '2.5rem',
        h3: '1.75rem',
        h4: '1.5rem',
      },
    },
    componentPatterns: [
      'hero-section',
      'feature-grid',
      'testimonial-carousel',
      'pricing-table',
      'cta-banner',
    ],
    aiPromptTemplate: `
      Design a feature landing page with:
      - Full-width hero with headline, subheadline, and dual CTAs
      - 3-column feature grid with icons
      - Social proof section with testimonials
      - Pricing comparison table
      - Sticky navigation with scroll behavior
      Use vibrant primary color {primary} for CTAs
      Large typography for impact: H1 at {h1}
    `.trim(),
    metadata: {
      author: 'Harness Design System',
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z',
      tags: ['marketing', 'conversion', 'b2b'],
    },
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-345678901234',
    name: 'Multi-Step Form Wizard',
    category: 'form',
    description: 'Progressive disclosure form with validation, step indicators, and save/resume capability.',
    version: '1.0.0',
    isActive: true,
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      maxWidth: '800px', // Narrower for focused form completion
    },
    colorScheme: DEFAULT_COLOR_SCHEME,
    typography: DEFAULT_TYPOGRAPHY,
    componentPatterns: [
      'step-indicator',
      'form-section',
      'input-field',
      'validation-message',
      'progress-bar',
      'action-buttons',
    ],
    aiPromptTemplate: `
      Create a multi-step form wizard with:
      - Horizontal step indicator at top
      - Current step highlighted, completed steps checkmarked
      - Form sections with clear headings
      - Real-time validation with inline errors
      - Primary action right-aligned, secondary left
      - Progress save indicator
      Max width: {maxWidth} for focused attention
    `.trim(),
    metadata: {
      author: 'Harness Design System',
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z',
      tags: ['forms', 'onboarding', 'validation'],
    },
  },
] as const;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a complete design template against the schema
 * 
 * @param template - The template object to validate
 * @returns Validated template or throws validation error
 * @throws Error if validation fails with detailed message
 */
export function validateDesignTemplate(template: unknown): DesignTemplate {
  try {
    const result = DesignTemplateSchema.parse(template);
    logger.info('Design template validated successfully', { templateId: result.id });
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      logger.error('Design template validation failed', { issues });
      throw new Error(`Template validation failed: ${issues}`);
    }
    logger.error('Unexpected validation error', { error });
    throw error;
  }
}

/**
 * Validates partial template updates
 * 
 * @param partial - Partial template data to validate
 * @returns Safe partial object or throws
 */
export function validatePartialTemplate(partial: unknown): Partial<DesignTemplate> {
  try {
    // Use partial schema for updates
    const PartialSchema = DesignTemplateSchema.partial();
    return PartialSchema.parse(partial);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Partial validation failed: ${issues}`);
    }
    throw error;
  }
}

// ============================================================================
// Template Retrieval Functions
// ============================================================================

/**
 * Retrieves a template by its unique identifier
 * 
 * @param id - UUID of the template
 * @returns Matching template or undefined
 */
export function getTemplateById(id: string): DesignTemplate | undefined {
  if (!id || typeof id !== 'string') {
    logger.warn('Invalid template ID provided', { id });
    return undefined;
  }
  
  const template = BUILT_IN_TEMPLATES.find(t => t.id === id);
  
  if (!template) {
    logger.debug('Template not found', { id });
  }
  
  return template;
}

/**
 * Retrieves all templates for a specific category
 * 
 * @param category - Template category to filter by
 * @returns Array of matching templates
 */
export function getTemplatesByCategory(category: TemplateCategory): ReadonlyArray<DesignTemplate> {
  const templates = BUILT_IN_TEMPLATES.filter(t => t.category === category && t.isActive);
  logger.info('Retrieved templates by category', { category, count: templates.length });
  return templates;
}

/**
 * Retrieves all active templates
 * 
 * @returns Array of all active templates
 */
export function getAllActiveTemplates(): ReadonlyArray<DesignTemplate> {
  return BUILT_IN_TEMPLATES.filter(t => t.isActive);
}

// ============================================================================
// Template Customization Functions
// ============================================================================

/**
 * Creates a customized template based on a base template with overrides
 * 
 * @param baseId - ID of the base template
 * @param overrides - Customization options to apply
 * @returns New customized template with generated ID
 * @throws Error if base template not found or overrides invalid
 */
export function customizeTemplate(
  baseId: string,
  overrides: {
    name?: string;
    colorScheme?: Partial<ColorScheme>;
    constraints?: Partial<DesignConstraints>;
    typography?: Partial<TypographyScale>;
  }
): DesignTemplate {
  const baseTemplate = getTemplateById(baseId);
  
  if (!baseTemplate) {
    logger.error('Base template not found for customization', { baseId });
    throw new Error(`Template not found: ${baseId}`);
  }

  // Validate overrides before merging
  if (overrides.colorScheme) {
    ColorSchemeSchema.partial().parse(overrides.colorScheme);
  }
  if (overrides.constraints) {
    DesignConstraintsSchema.partial().parse(overrides.constraints);
  }
  if (overrides.typography) {
    TypographyScaleSchema.partial().parse(overrides.typography);
  }

  const customized: DesignTemplate = {
    ...baseTemplate,
    id: crypto.randomUUID(), // Generate new ID for customized version
    name: overrides.name || `${baseTemplate.name} (Custom)`,
    version: '1.0.0-custom',
    colorScheme: {
      ...baseTemplate.colorScheme,
      ...overrides.colorScheme,
    },
    constraints: {
      ...baseTemplate.constraints,
      ...overrides.constraints,
    },
    typography: {
      ...baseTemplate.typography,
      ...overrides.typography,
    },
    metadata: {
      ...baseTemplate.metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [...baseTemplate.metadata.tags, 'customized'],
    },
  };

  logger.info('Template customized successfully', { 
    baseId, 
    newId: customized.id,
    name: customized.name,
  });

  return customized;
}

// ============================================================================
// Export Configuration Object
// ============================================================================

/**
 * Complete design templates configuration for dependency injection
 */
export const DesignTemplatesConfig = {
  schemas: {
    colorScheme: ColorSchemeSchema,
    typography: TypographyScaleSchema,
    constraints: DesignConstraintsSchema,
    template: DesignTemplateSchema,
  },
  defaults: {
    colorScheme: DEFAULT_COLOR_SCHEME,
    typography: DEFAULT_TYPOGRAPHY,
    constraints: DEFAULT_CONSTRAINTS,
  },
  templates: BUILT_IN_TEMPLATES,
  categories: TEMPLATE_CATEGORIES,
  validate: validateDesignTemplate,
  validatePartial: validatePartialTemplate,
  getById: getTemplateById,
  getByCategory: getTemplatesByCategory,
  getAllActive: getAllActiveTemplates,
  customize: customizeTemplate,
} as const;

// Type export for configuration
export type DesignTemplatesConfig = typeof DesignTemplatesConfig;