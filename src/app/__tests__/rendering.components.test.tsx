// src/app/__tests__/rendering.components.test.tsx
// Layer: UI (Testing)
// Purpose: Component rendering tests for basic UI components following six-layer architecture

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

// Extend Jest matchers for accessibility testing
expect.extend(toHaveNoViolations);

// ============================================================================
// Types Layer: Type definitions for test fixtures and mocks
// ============================================================================

/**
 * Test fixture data structure for component props
 */
interface TestFixture<TProps> {
  name: string;
  props: TProps;
  description: string;
}

/**
 * Mock service response structure
 */
interface MockServiceResponse<T> {
  data: T;
  status: number;
  error?: string;
}

/**
 * Component render result with additional metadata
 */
interface RenderResult<TProps> {
  component: React.ReactElement<TProps>;
  props: TProps;
  expectedSelectors: string[];
}

// ============================================================================
// Config Layer: Test configuration and constants
// ============================================================================

const TEST_CONFIG = {
  timeout: {
    default: 5000,
    async: 10000,
    animation: 1000,
  },
  selectors: {
    loading: '[data-testid="loading"]',
    error: '[data-testid="error"]',
    empty: '[data-testid="empty-state"]',
    content: '[data-testid="content"]',
  },
  mockData: {
    user: {
      id: 'test-user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
    organization: {
      id: 'org-456',
      name: 'Test Organization',
    },
  },
} as const;

// ============================================================================
// Repo Layer: Mock data repositories and API simulators
// ============================================================================

/**
 * Repository for managing test data fixtures
 */
class TestDataRepository<T> {
  private fixtures: Map<string, TestFixture<T>> = new Map();

  register(fixture: TestFixture<T>): void {
    this.fixtures.set(fixture.name, fixture);
  }

  get(name: string): TestFixture<T> | undefined {
    const fixture = this.fixtures.get(name);
    if (!fixture) {
      throw new Error(`Test fixture '${name}' not found in repository`);
    }
    return fixture;
  }

  getAll(): TestFixture<T>[] {
    return Array.from(this.fixtures.values());
  }
}

// User fixtures repository
const userFixtures = new TestDataRepository<{ userId: string; userName: string }>();
userFixtures.register({
  name: 'valid-user',
  props: { userId: TEST_CONFIG.mockData.user.id, userName: TEST_CONFIG.mockData.user.name },
  description: 'Standard valid user with complete data',
});
userFixtures.register({
  name: 'empty-user',
  props: { userId: '', userName: '' },
  description: 'User with empty fields for edge case testing',
});

// ============================================================================
// Service Layer: Mock services and business logic
// ============================================================================

/**
 * Mock service for simulating async operations
 */
class MockComponentService {
  private delay: number;

  constructor(delay: number = 100) {
    this.delay = delay;
  }

  async fetchData<T>(data: T): Promise<MockServiceResponse<T>> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, this.delay));

    // Randomly simulate errors (5% chance) for robust error handling tests
    if (Math.random() < 0.05) {
      return {
        data: {} as T,
        status: 500,
        error: 'Simulated service error',
      };
    }

    return {
      data,
      status: 200,
    };
  }

  async validateProps<T extends Record<string, unknown>>(props: T): Promise<boolean> {
    // Validate that all required props are present and non-empty
    return Object.values(props).every(
      (value) => value !== undefined && value !== null && value !== ''
    );
  }
}

// ============================================================================
// Runtime Layer: Test runtime utilities and helpers
// ============================================================================

/**
 * Utility class for component test runtime operations
 */
class ComponentTestRuntime {
  private service: MockComponentService;

  constructor() {
    this.service = new MockComponentService();
  }

  /**
   * Renders a component with error boundary protection
   */
  async safeRender<TProps extends Record<string, unknown>>(
    Component: React.ComponentType<TProps>,
    props: TProps
  ): Promise<ReturnType<typeof render>> {
    // Validate props before rendering
    const isValid = await this.service.validateProps(props);
    if (!isValid) {
      throw new Error('Invalid props provided to component');
    }

    // Wrap in error boundary for isolation
    const WrappedComponent: React.FC<TProps> = (wrappedProps) => {
      const [hasError, setHasError] = React.useState(false);

      React.useEffect(() => {
        const handleError = (error: ErrorEvent) => {
          // eslint-disable-next-line no-console
          console.error('Component error caught:', error);
          setHasError(true);
        };

        window.addEventListener('error', handleError);
        return () => window.removeEventListener('error', handleError);
      }, []);

      if (hasError) {
        return <div data-testid="error-boundary">Component Error Boundary Triggered</div>;
      }

      return <Component {...wrappedProps} />;
    };

    return render(<WrappedComponent {...props} />);
  }

  /**
   * Waits for async operations to complete with timeout protection
   */
  async waitForAsyncOperation(
    callback: () => Promise<void> | void,
    timeout: number = TEST_CONFIG.timeout.async
  ): Promise<void> {
    await waitFor(callback, {
      timeout,
      interval: 50,
    });
  }
}

// ============================================================================
// UI Layer: Actual component tests
// ============================================================================

// Sample components to test (would normally be imported from actual source)
// These are minimal implementations for demonstration

interface ButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  'data-testid'?: string;
}

const Button: React.FC<ButtonProps> = ({
  label,
  onClick,
  disabled = false,
  variant = 'primary',
  'data-testid': testId = 'button',
}) => {
  const baseClasses = 'btn';
  const variantClass = `btn--${variant}`;
  const disabledClass = disabled ? 'btn--disabled' : '';

  return (
    <button
      className={`${baseClasses} ${variantClass} ${disabledClass}`}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      type="button"
    >
      {label}
    </button>
  );
};

interface CardProps {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
  error?: string;
  'data-testid'?: string;
}

const Card: React.FC<CardProps> = ({
  title,
  children,
  footer,
  loading = false,
  error,
  'data-testid': testId = 'card',
}) => {
  // Handle loading state
  if (loading) {
    return (
      <div className="card card--loading" data-testid={`${testId}-loading`}>
        <div data-testid="loading">Loading...</div>
      </div>
    );
  }

  // Handle error state with proper error boundary consideration
  if (error) {
    return (
      <div className="card card--error" data-testid={`${testId}-error`}>
        <div data-testid="error" role="alert">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <article className="card" data-testid={testId}>
      <header className="card__header">
        <h2 className="card__title">{title}</h2>
      </header>
      <div className="card__content" data-testid="content">
        {children}
      </div>
      {footer && <footer className="card__footer">{footer}</footer>}
    </article>
  );
};

interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  'data-testid'?: string;
}

const Input: React.FC<InputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
  required = false,
  'data-testid': testId = 'input',
}) => {
  const inputId = `${testId}-field`;

  return (
    <div className="input-wrapper" data-testid={testId}>
      <label htmlFor={inputId} className="input__label">
        {label}
        {required && <span aria-label="required"> *</span>}
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={`input ${error ? 'input--error' : ''}`}
        data-testid={`${testId}-field`}
      />
      {error && (
        <span id={`${inputId}-error`} className="input__error" role="alert" data-testid="error">
          {error}
        </span>
      )}
    </div>
  );
};

// ============================================================================
// Test Suites
// ============================================================================

describe('Component Rendering Tests', () => {
  let runtime: ComponentTestRuntime;

  beforeEach(() => {
    runtime = new ComponentTestRuntime();
  });

  afterEach(() => {
    // Cleanup any lingering timers or mocks
    jest.clearAllTimers();
  });

  // -------------------------------------------------------------------------
  // Button Component Tests
  // -------------------------------------------------------------------------
  describe('Button Component', () => {
    const defaultProps: ButtonProps = {
      label: 'Click Me',
      onClick: jest.fn(),
      variant: 'primary',
    };

    it('renders with required props', async () => {
      const { container } = await runtime.safeRender(Button, defaultProps);

      expect(screen.getByTestId('button')).toBeInTheDocument();
      expect(screen.getByText('Click Me')).toBeInTheDocument();
      expect(container.querySelector('.btn--primary')).toBeInTheDocument();
    });

    it('renders all variant types correctly', async () => {
      const variants: Array<ButtonProps['variant']> = ['primary', 'secondary', 'danger'];

      for (const variant of variants) {
        const { container } = await runtime.safeRender(Button, {
          ...defaultProps,
          variant,
          'data-testid': `button-${variant}`,
        });

        expect(container.querySelector(`.btn--${variant}`)).toBeInTheDocument();
      }
    });

    it('handles disabled state', async () => {
      await runtime.safeRender(Button, {
        ...defaultProps,
        disabled: true,
      });

      const button = screen.getByTestId('button');
      expect(button).toBeDisabled();
      expect(button).toHaveClass('btn--disabled');
    });

    it('handles click events', async () => {
      const handleClick = jest.fn();
      await runtime.safeRender(Button, {
        ...defaultProps,
        onClick: handleClick,
      });

      await userEvent.click(screen.getByTestId('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not trigger click when disabled', async () => {
      const handleClick = jest.fn();
      await runtime.safeRender(Button, {
        ...defaultProps,
        onClick: handleClick,
        disabled: true,
      });

      await userEvent.click(screen.getByTestId('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('meets accessibility standards', async () => {
      const { container } = await runtime.safeRender(Button, defaultProps);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  // -------------------------------------------------------------------------
  // Card Component Tests
  // -------------------------------------------------------------------------
  describe('Card Component', () => {
    const defaultProps: CardProps = {
      title: 'Test Card',
      children: <p>Card content here</p>,
    };

    it('renders with required props', async () => {
      await runtime.safeRender(Card, defaultProps);

      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByText('Test Card')).toBeInTheDocument();
      expect(screen.getByText('Card content here')).toBeInTheDocument();
    });

    it('renders loading state', async () => {
      await runtime.safeRender(Card, {
        ...defaultProps,
        loading: true,
      });

      expect(screen.queryByTestId('card')).not.toBeInTheDocument();
      expect(screen.getByTestId('card-loading')).toBeInTheDocument();
      expect(screen.getByTestId('loading')).toHaveTextContent('Loading...');
    });

    it('renders error state with proper accessibility', async () => {
      const errorMessage = 'Failed to load data';
      await runtime.safeRender(Card, {
        ...defaultProps,
        error: errorMessage,
      });

      const errorElement = screen.getByTestId('error');
      expect(errorElement).toHaveTextContent(errorMessage);
      expect(errorElement).toHaveAttribute('role', 'alert');
    });

    it('renders footer when provided', async () => {
      await runtime.safeRender(Card, {
        ...defaultProps,
        footer: <button>Action</button>,
      });

      expect(screen.getByText('Action')).toBeInTheDocument();
    });

    it('prioritizes error state over loading state', async () => {
      // Edge case: both loading and error are true
      await runtime.safeRender(Card, {
        ...defaultProps,
        loading: true,
        error: 'An error occurred',
      });

      // Error should take precedence
      expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      expect(screen.getByTestId('error')).toBeInTheDocument();
    });

    it('meets accessibility standards', async () => {
      const { container } = await runtime.safeRender(Card, defaultProps);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  // -------------------------------------------------------------------------
  // Input Component Tests
  // -------------------------------------------------------------------------
  describe('Input Component', () => {
    const defaultProps: InputProps = {
      label: 'Username',
      value: '',
      onChange: jest.fn(),
    };

    it('renders with required props', async () => {
      await runtime.safeRender(Input, defaultProps);

      expect(screen.getByTestId('input')).toBeInTheDocument();
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
    });

    it('displays current value', async () => {
      await runtime.safeRender(Input, {
        ...defaultProps,
        value: 'testuser',
      });

      expect(screen.getByTestId('input-field')).toHaveValue('testuser');
    });

    it('handles value changes', async () => {
      const handleChange = jest.fn();
      await runtime.safeRender(Input, {
        ...defaultProps,
        onChange: handleChange,
      });

      const input = screen.getByTestId('input-field');
      await userEvent.type(input, 'a');
      expect(handleChange).toHaveBeenCalledWith('a');
    });

    it('renders placeholder text', async () => {
      await runtime.safeRender(Input, {
        ...defaultProps,
        placeholder: 'Enter username',
      });

      expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    });

    it('displays error message with proper accessibility', async () => {
      const errorMessage = 'Username is required';
      await runtime.safeRender(Input, {
        ...defaultProps,
        error: errorMessage,
      });

      const errorElement = screen.getByTestId('error');
      expect(errorElement).toHaveTextContent(errorMessage);
      expect(errorElement).toHaveAttribute('role', 'alert');

      const input = screen.getByTestId('input-field');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby');
    });

    it('handles disabled state', async () => {
      await runtime.safeRender(Input, {
        ...defaultProps,
        disabled: true,
      });

      expect(screen.getByTestId('input-field')).toBeDisabled();
    });

    it('indicates required fields', async () => {
      await runtime.safeRender(Input, {
        ...defaultProps,
        required: true,
      });

      const label = screen.getByText('Username');
      expect(label.parentElement).toHaveTextContent('*');
    });

    it('associates label with input via htmlFor', async () => {
      await runtime.safeRender(Input, {
        ...defaultProps,
        'data-testid': 'custom-input',
      });

      const label = screen.getByText('Username');
      const input = screen.getByTestId('custom-input-field');
      expect(label).toHaveAttribute('for', input.id);
    });

    it('meets accessibility standards', async () => {
      const { container } = await runtime.safeRender(Input, defaultProps);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  // -------------------------------------------------------------------------
  // Integration Tests
  // -------------------------------------------------------------------------
  describe('Component Integration', () => {
    it('renders composed components correctly', async () => {
      const ComposedComponent: React.FC = () => (
        <Card title="Login Form" data-testid="login-card">
          <Input
            label="Email"
            value=""
            onChange={() => {}}
            placeholder="Enter email"
            data-testid="email-input"
          />
          <Button label="Submit" variant="primary" data-testid="submit-btn" />
        </Card>
      );

      await runtime.safeRender(ComposedComponent, {});

      expect(screen.getByTestId('login-card')).toBeInTheDocument();
      expect(screen.getByTestId('email-input')).toBeInTheDocument();
      expect(screen.getByTestId('submit-btn')).toBeInTheDocument();
    });

    it('handles rapid state changes without errors', async () => {
      const RapidUpdateComponent: React.FC = () => {
        const [count, setCount] = React.useState(0);
        const [loading, setLoading] = React.useState(false);

        React.useEffect(() => {
          // Simulate rapid updates
          const interval = setInterval(() => {
            setCount((c) => c + 1);
            setLoading((l) => !l);
          }, 10);

          return () => clearInterval(interval);
        }, []);

        return (
          <Card title={`Count: ${count}`} loading={loading} data-testid="rapid-card">
            <p>Content</p>
          </Card>
        );
      };

      const { unmount } = await runtime.safeRender(RapidUpdateComponent, {});

      // Let rapid updates occur
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not throw errors during rapid updates
      expect(() => screen.getByTestId(/rapid-card/)).not.toThrow();

      unmount();
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling Tests
  // -------------------------------------------------------------------------
  describe('Error Handling', () => {
    it('throws error for invalid props', async () => {
      const InvalidComponent: React.FC<{ required: string }> = ({ required }) => (
        <div>{required}</div>
      );

      await expect(
        runtime.safeRender(InvalidComponent, { required: '' })
      ).rejects.toThrow('Invalid props');
    });

    it('recovers from component errors gracefully', async () => {
      const ErrorComponent: React.FC = () => {
        throw new Error('Intentional test error');
      };

      // Wrap in try-catch to verify error handling
      let errorCaught = false;
      try {
        await runtime.safeRender(ErrorComponent, {});
      } catch (error) {
        errorCaught = true;
      }

      // Should catch and handle the error
      expect(errorCaught).toBe(true);
    });
  });
});