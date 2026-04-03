/**
 * test-queries.tsx
 * 
 * Custom Testing Library queries for the Harness Engineering environment.
 * 
 * Layer: Runtime (Testing utilities)
 * Purpose: Provides reusable, type-safe queries for component testing
 *          following Testing Library best practices.
 */

import { screen, within, waitFor } from '@testing-library/react';
import type { BoundFunctions, Queries } from '@testing-library/react';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for custom query functions
 */
interface QueryOptions {
  /** Timeout in milliseconds for async queries */
  timeout?: number;
  /** Container element to search within */
  container?: HTMLElement;
  /** Whether to use exact matching */
  exact?: boolean;
}

/**
 * Result type for queries that may return multiple elements
 */
interface QueryResult<T extends HTMLElement = HTMLElement> {
  elements: T[];
  count: number;
  first: T | null;
  last: T | null;
}

/**
 * Error context for query failures
 */
interface QueryErrorContext {
  queryName: string;
  selector: string;
  options?: QueryOptions;
  cause?: Error;
}

// ============================================================================
// CUSTOM ERROR CLASS
// ============================================================================

/**
 * Custom error for query failures with structured context
 */
class QueryError extends Error {
  public readonly context: QueryErrorContext;

  constructor(message: string, context: QueryErrorContext) {
    super(message);
    this.name = 'QueryError';
    this.context = context;
    
    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, QueryError);
    }
  }
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validates that a value is a non-null HTMLElement
 */
function isValidElement(element: unknown): element is HTMLElement {
  return element instanceof HTMLElement;
}

/**
 * Validates query options and applies defaults
 */
function validateOptions(options: QueryOptions = {}): Required<QueryOptions> {
  return {
    timeout: options.timeout ?? 5000,
    container: options.container ?? document.body,
    exact: options.exact ?? true,
  };
}

// ============================================================================
// CUSTOM QUERIES
// ============================================================================

/**
 * Finds elements by data-testid with Harness-specific prefix
 * 
 * @param testId - The test ID without the 'harness-' prefix
 * @param options - Query options
 * @returns The found element
 * @throws QueryError if element not found
 * 
 * @example
 * const button = getByHarnessTestId('submit-button');
 */
export function getByHarnessTestId(
  testId: string,
  options?: QueryOptions
): HTMLElement {
  const validatedOptions = validateOptions(options);
  const fullTestId = `harness-${testId}`;
  
  try {
    const scope = validatedOptions.container 
      ? within(validatedOptions.container) 
      : screen;
    
    return scope.getByTestId(fullTestId);
  } catch (error) {
    throw new QueryError(
      `Unable to find element with harness test ID: ${testId}`,
      {
        queryName: 'getByHarnessTestId',
        selector: `[data-testid="${fullTestId}"]`,
        options: validatedOptions,
        cause: error instanceof Error ? error : undefined,
      }
    );
  }
}

/**
 * Queries for elements by Harness test ID (returns null if not found)
 * 
 * @param testId - The test ID without the 'harness-' prefix
 * @param options - Query options
 * @returns The found element or null
 */
export function queryByHarnessTestId(
  testId: string,
  options?: QueryOptions
): HTMLElement | null {
  const validatedOptions = validateOptions(options);
  const fullTestId = `harness-${testId}`;
  
  const scope = validatedOptions.container 
    ? within(validatedOptions.container) 
    : screen;
  
  return scope.queryByTestId(fullTestId);
}

/**
 * Async query for elements by Harness test ID
 * 
 * @param testId - The test ID without the 'harness-' prefix
 * @param options - Query options
 * @returns Promise resolving to the found element
 * @throws QueryError if element not found within timeout
 */
export async function findByHarnessTestId(
  testId: string,
  options?: QueryOptions
): Promise<HTMLElement> {
  const validatedOptions = validateOptions(options);
  const fullTestId = `harness-${testId}`;
  
  try {
    const scope = validatedOptions.container 
      ? within(validatedOptions.container) 
      : screen;
    
    return await scope.findByTestId(fullTestId, undefined, {
      timeout: validatedOptions.timeout,
    });
  } catch (error) {
    throw new QueryError(
      `Unable to find element with harness test ID within ${validatedOptions.timeout}ms: ${testId}`,
      {
        queryName: 'findByHarnessTestId',
        selector: `[data-testid="${fullTestId}"]`,
        options: validatedOptions,
        cause: error instanceof Error ? error : undefined,
      }
    );
  }
}

/**
 * Finds form elements by their associated label text
 * 
 * @param labelText - The text of the label
 * @param options - Query options
 * @returns The form element associated with the label
 * @throws QueryError if element not found
 */
export function getByFormLabel(
  labelText: string,
  options?: QueryOptions
): HTMLElement {
  const validatedOptions = validateOptions(options);
  
  try {
    const scope = validatedOptions.container 
      ? within(validatedOptions.container) 
      : screen;
    
    // First find the label, then get the associated form element
    const label = scope.getByText(labelText, {
      selector: 'label',
      exact: validatedOptions.exact,
    });
    
    const htmlFor = label.getAttribute('for');
    if (!htmlFor) {
      throw new QueryError(
        `Label "${labelText}" does not have a 'for' attribute`,
        {
          queryName: 'getByFormLabel',
          selector: `label:has-text("${labelText}")`,
          options: validatedOptions,
        }
      );
    }
    
    const input = validatedOptions.container?.querySelector(`#${CSS.escape(htmlFor)}`) 
      ?? document.getElementById(htmlFor);
    
    if (!isValidElement(input)) {
      throw new QueryError(
        `No form element found with id "${htmlFor}" for label "${labelText}"`,
        {
          queryName: 'getByFormLabel',
          selector: `#${htmlFor}`,
          options: validatedOptions,
        }
      );
    }
    
    return input;
  } catch (error) {
    if (error instanceof QueryError) {
      throw error;
    }
    
    throw new QueryError(
      `Unable to find form element for label: ${labelText}`,
      {
        queryName: 'getByFormLabel',
        selector: `label[for]:has-text("${labelText}")`,
        options: validatedOptions,
        cause: error instanceof Error ? error : undefined,
      }
    );
  }
}

/**
 * Finds elements within a specific section by role and name
 * 
 * @param sectionRole - The ARIA role of the section
 * @param sectionName - The accessible name of the section
 * @param options - Query options
 * @returns The section element
 * @throws QueryError if section not found
 */
export function getBySection(
  sectionRole: string,
  sectionName: string,
  options?: QueryOptions
): HTMLElement {
  const validatedOptions = validateOptions(options);
  
  try {
    const scope = validatedOptions.container 
      ? within(validatedOptions.container) 
      : screen;
    
    return scope.getByRole(sectionRole as any, {
      name: sectionName,
      exact: validatedOptions.exact,
    });
  } catch (error) {
    throw new QueryError(
      `Unable to find section with role "${sectionRole}" and name "${sectionName}"`,
      {
        queryName: 'getBySection',
        selector: `[role="${sectionRole}"][aria-label="${sectionName}"], [role="${sectionRole}"]:has-text("${sectionName}")`,
        options: validatedOptions,
        cause: error instanceof Error ? error : undefined,
      }
    );
  }
}

/**
 * Gets all elements matching a Harness test ID pattern
 * 
 * @param testIdPattern - Pattern to match test IDs (supports * wildcard)
 * @param options - Query options
 * @returns QueryResult with all matching elements
 */
export function getAllByHarnessTestIdPattern(
  testIdPattern: string,
  options?: QueryOptions
): QueryResult {
  const validatedOptions = validateOptions(options);
  
  // Convert pattern to regex
  const regexPattern = testIdPattern
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^harness-${regexPattern}$`);
  
  const container = validatedOptions.container ?? document.body;
  
  // Query all elements with data-testid
  const allElements = container.querySelectorAll('[data-testid]');
  const matchingElements: HTMLElement[] = [];
  
  for (const element of Array.from(allElements)) {
    if (!isValidElement(element)) continue;
    
    const testId = element.getAttribute('data-testid');
    if (testId && regex.test(testId)) {
      matchingElements.push(element);
    }
  }
  
  return {
    elements: matchingElements,
    count: matchingElements.length,
    first: matchingElements[0] ?? null,
    last: matchingElements[matchingElements.length - 1] ?? null,
  };
}

/**
 * Waits for an element to be removed from the DOM
 * 
 * @param element - The element to wait for removal
 * @param options - Query options
 * @returns Promise that resolves when element is removed
 * @throws QueryError if element is not removed within timeout
 */
export async function waitForElementToBeRemoved(
  element: HTMLElement,
  options?: QueryOptions
): Promise<void> {
  const validatedOptions = validateOptions(options);
  
  try {
    await waitFor(() => {
      if (document.contains(element)) {
        throw new Error('Element still in DOM');
      }
    }, {
      timeout: validatedOptions.timeout,
    });
  } catch (error) {
    throw new QueryError(
      `Element was not removed from DOM within ${validatedOptions.timeout}ms`,
      {
        queryName: 'waitForElementToBeRemoved',
        selector: element.tagName.toLowerCase(),
        options: validatedOptions,
        cause: error instanceof Error ? error : undefined,
      }
    );
  }
}

// ============================================================================
// BOUND QUERIES (for use with within)
// ============================================================================

/**
 * Creates bound query functions scoped to a specific container
 * 
 * @param container - The container element to scope queries to
 * @returns Object with bound query functions
 */
export function createBoundQueries(container: HTMLElement) {
  return {
    getByHarnessTestId: (testId: string, options?: Omit<QueryOptions, 'container'>) =>
      getByHarnessTestId(testId, { ...options, container }),
    
    queryByHarnessTestId: (testId: string, options?: Omit<QueryOptions, 'container'>) =>
      queryByHarnessTestId(testId, { ...options, container }),
    
    findByHarnessTestId: (testId: string, options?: Omit<QueryOptions, 'container'>) =>
      findByHarnessTestId(testId, { ...options, container }),
    
    getByFormLabel: (labelText: string, options?: Omit<QueryOptions, 'container'>) =>
      getByFormLabel(labelText, { ...options, container }),
    
    getBySection: (sectionRole: string, sectionName: string, options?: Omit<QueryOptions, 'container'>) =>
      getBySection(sectionRole, sectionName, { ...options, container }),
    
    getAllByHarnessTestIdPattern: (pattern: string, options?: Omit<QueryOptions, 'container'>) =>
      getAllByHarnessTestIdPattern(pattern, { ...options, container }),
  };
}

// ============================================================================
// EXPORT TYPES
// ============================================================================

export type {
  QueryOptions,
  QueryResult,
  QueryErrorContext,
};

export { QueryError };

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

/**
 * Default export with all custom queries
 */
export default {
  getByHarnessTestId,
  queryByHarnessTestId,
  findByHarnessTestId,
  getByFormLabel,
  getBySection,
  getAllByHarnessTestIdPattern,
  waitForElementToBeRemoved,
  createBoundQueries,
  QueryError,
};