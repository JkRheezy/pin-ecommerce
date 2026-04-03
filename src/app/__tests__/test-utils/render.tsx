/**
 * Custom render utilities and wrappers for testing
 * Layer: Repo (Testing Infrastructure)
 * 
 * Provides type-safe wrappers around @testing-library/react with
 * Harness-specific providers and utilities.
 */

import * as React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { render as rtlRender, type RenderOptions, type RenderResult } from '@testing-library/react';
import { configureToMatchImageSnapshot } from 'jest-image-snapshot';
import type { ToMatchImageSnapshotOptions } from 'jest-image-snapshot';
import { TestWrapper } from './TestWrapper';
import type { TestWrapperProps } from './TestWrapper';
import { createLogger } from '@harness/logging';

const logger = createLogger('test:render');

// ============================================================================
// Types
// ============================================================================

/**
 * Extended render options with Harness-specific configuration
 */
export interface HarnessRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Route to initialize the router with */
  initialRoute?: string;
  /** Query parameters to set */
  searchParams?: Record<string, string>;
  /** Feature flags to enable for this render */
  featureFlags?: Record<string, boolean>;
  /** Custom wrapper to compose with TestWrapper */
  wrapper?: React.ComponentType<{ children: ReactNode }>;
  /** Whether to skip automatic TestWrapper injection */
  skipTestWrapper?: boolean;
  /** Mock services to inject */
  mockServices?: TestWrapperProps['mockServices'];
  /** Initial store state */
  initialState?: Record<string, unknown>;
}

/**
 * Extended render result with Harness-specific utilities
 */
export interface HarnessRenderResult extends RenderResult {
  /** Get current URL from memory router */
  getCurrentUrl: () => string;
  /** Assert on feature flag calls */
  assertFeatureFlagCalled: (flagName: string, expectedValue?: boolean) => void;
  /** Wait for loading states to resolve */
  waitForLoadingToFinish: () => Promise<void>;
  /** Get all tracked analytics events */
  getAnalyticsEvents: () => unknown[];
  /** Clear analytics event history */
  clearAnalyticsEvents: () => void;
}

// ============================================================================
// Configuration
// ============================================================================

const toMatchImageSnapshot = configureToMatchImageSnapshot({
  customDiffConfig: { threshold: 0.1 },
  failureThreshold: 0.01,
  failureThresholdType: 'percent',
});

expect.extend({ toMatchImageSnapshot });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates render options to prevent common mistakes
 */
function validateRenderOptions(options: HarnessRenderOptions): void {
  if (options.initialRoute && !options.initialRoute.startsWith('/')) {
    logger.warn('initialRoute should start with /, got: %s', options.initialRoute);
  }

  if (options.featureFlags) {
    const invalidFlags = Object.keys(options.featureFlags).filter(
      key => typeof options.featureFlags![key] !== 'boolean'
    );
    if (invalidFlags.length > 0) {
      throw new Error(`Feature flags must be boolean values. Invalid: ${invalidFlags.join(', ')}`);
    }
  }
}

/**
 * Composes multiple wrappers into a single wrapper component
 */
function composeWrappers(
  wrappers: Array<React.ComponentType<{ children: ReactNode }>>
): React.ComponentType<{ children: ReactNode }> {
  return function ComposedWrapper({ children }: { children: ReactNode }): ReactElement {
    return wrappers.reduceRight(
      (acc, Wrapper) => <Wrapper>{acc}</Wrapper>,
      children as ReactElement
    );
  };
}

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Custom render function that wraps components with Harness testing infrastructure
 * 
 * @example
 *