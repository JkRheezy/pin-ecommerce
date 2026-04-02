/**
 * @file layout.test.ts
 * @description Tests for the layout configuration and runtime behavior
 * @module Runtime Layer
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { LayoutConfig, LayoutProps, ViewportConfig } from '../types/layout.types';
import { LayoutService } from '../service/layout.service';
import { LayoutRepo } from '../repo/layout.repo';
import { LayoutConfig as LayoutConfigClass } from '../config/layout.config';
import { RuntimeError, ValidationError } from '../types/error.types';

// ============================================================================
// Test Setup & Mocks
// ============================================================================

const createMockLogger = () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn().mockReturnThis(),
});

// ============================================================================
// Test Data Factories
// ============================================================================

/**
 * Factory for creating valid layout configurations
 */
const createValidLayoutConfig = (overrides?: Partial<LayoutConfig>): LayoutConfig => ({
  viewport: {
    width: 1920,
    height: 1080,
    devicePixelRatio: 1,
    orientation: 'landscape',
  },
  breakpoints: {
    mobile: { max: 768 },
    tablet: { min: 769, max: 1024 },
    desktop: { min: 1025 },
  },
  grid: {
    columns: 12,
    gutter: 24,
    margin: 48,
    maxWidth: 1440,
  },
  regions: {
    header: { height: 64, sticky: true, zIndex: 100 },
    sidebar: { width: 280, collapsible: true, breakpoint: 'tablet' },
    main: { flexible: true, minHeight: 'calc(100vh - 64px)' },
    footer: { height: 48, sticky: false },
  },
  ...overrides,
});

/**
 * Factory for creating viewport configurations
 */
const createViewportConfig = (overrides?: Partial<ViewportConfig>): ViewportConfig => ({
  width: 1920,
  height: 1080,
  devicePixelRatio: 1,
  orientation: 'landscape',
  ...overrides,
});

// ============================================================================
// Core Functionality Tests
// ============================================================================

describe('LayoutConfig', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('initialization', () => {
    it('should create config with valid input', () => {
      const config = createValidLayoutConfig();
      const layoutConfig = new LayoutConfigClass(config, logger);

      expect(layoutConfig.getConfig()).toEqual(expect.objectContaining({
        viewport: config.viewport,
        grid: config.grid,
      }));
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'LAYOUT_CONFIG_INITIALIZED' }),
        'Layout config initialized'
      );
    });

    it('should apply default values for optional fields', () => {
      const minimalConfig: LayoutConfig = {
        viewport: createViewportConfig(),
        grid: { columns: 12, gutter: 24 },
        regions: {},
      };

      const layoutConfig = new LayoutConfigClass(minimalConfig, logger);
      const result = layoutConfig.getConfig();

      expect(result.grid.margin).toBe(0);
      expect(result.grid.maxWidth).toBeNull();
      expect(result.breakpoints).toEqual({});
    });
  });

  describe('validation', () => {
    it('should throw ValidationError for invalid viewport dimensions', () => {
      const invalidConfig = createValidLayoutConfig({
        viewport: createViewportConfig({ width: 0, height: -100 }),
      });

      expect(() => new LayoutConfigClass(invalidConfig, logger)).toThrow(ValidationError);
      expect(() => new LayoutConfigClass(invalidConfig, logger)).toThrow(
        'Viewport dimensions must be positive numbers'
      );
    });

    it('should throw ValidationError for invalid grid configuration', () => {
      const invalidConfig = createValidLayoutConfig({
        grid: { columns: 0, gutter: -10 },
      });

      expect(() => new LayoutConfigClass(invalidConfig, logger)).toThrow(ValidationError);
    });

    it('should throw ValidationError for overlapping breakpoints', () => {
      const invalidConfig = createValidLayoutConfig({
        breakpoints: {
          mobile: { max: 800 },
          tablet: { min: 700, max: 1024 }, // Overlaps with mobile
          desktop: { min: 1025 },
        },
      });

      expect(() => new LayoutConfigClass(invalidConfig, logger)).toThrow(
        'Breakpoint ranges must not overlap'
      );
    });

    it('should validate region z-index ordering', () => {
      const invalidConfig = createValidLayoutConfig({
        regions: {
          header: { height: 64, sticky: true, zIndex: 100 },
          overlay: { height: 100, sticky: true, zIndex: 50 }, // Lower than header
        },
      });

      // Should warn but not throw - z-index conflicts are runtime concerns
      new LayoutConfigClass(invalidConfig, logger);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'LAYOUT_ZINDEX_CONFLICT' }),
        expect.stringContaining('z-index conflict detected')
      );
    });
  });

  describe('breakpoint resolution', () => {
    it('should correctly identify current breakpoint', () => {
      const config = createValidLayoutConfig();
      const layoutConfig = new LayoutConfigClass(config, logger);

      expect(layoutConfig.getBreakpointForWidth(500)).toBe('mobile');
      expect(layoutConfig.getBreakpointForWidth(900)).toBe('tablet');
      expect(layoutConfig.getBreakpointForWidth(1200)).toBe('desktop');
    });

    it('should return null for widths outside all breakpoints', () => {
      const config = createValidLayoutConfig({
        breakpoints: {
          desktop: { min: 1025 },
        },
      });
      const layoutConfig = new LayoutConfigClass(config, logger);

      expect(layoutConfig.getBreakpointForWidth(500)).toBeNull();
    });

    it('should handle edge cases at breakpoint boundaries', () => {
      const config = createValidLayoutConfig();
      const layoutConfig = new LayoutConfigClass(config, logger);

      // At exact boundary - mobile max is 768
      expect(layoutConfig.getBreakpointForWidth(768)).toBe('mobile');
      // Just above boundary
      expect(layoutConfig.getBreakpointForWidth(769)).toBe('tablet');
    });
  });
});

// ============================================================================
// Repository Layer Tests
// ============================================================================

describe('LayoutRepo', () => {
  let repo: LayoutRepo;
  let logger: ReturnType<typeof createMockLogger>;
  let mockStorage: Map<string, string>;

  beforeEach(() => {
    logger = createMockLogger();
    mockStorage = new Map();
    
    // Mock localStorage
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) => mockStorage.get(key) ?? null),
        setItem: jest.fn((key: string, value: string) => mockStorage.set(key, value)),
        removeItem: jest.fn((key: string) => mockStorage.delete(key)),
      },
      writable: true,
    });

    repo = new LayoutRepo(logger);
  });

  describe('persistence', () => {
    it('should save and retrieve layout state', async () => {
      const state = {
        sidebarCollapsed: true,
        activeBreakpoint: 'desktop',
        customRegions: { panel: { width: 300 } },
      };

      await repo.saveState('user-123', state);
      const retrieved = await repo.getState('user-123');

      expect(retrieved).toEqual(state);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'LAYOUT_STATE_SAVED', userId: 'user-123' }),
        'Layout state saved'
      );
    });

    it('should return null for non-existent state', async () => {
      const result = await repo.getState('unknown-user');
      expect(result).toBeNull();
    });

    it('should handle storage quota exceeded', async () => {
      const largeState = { data: 'x'.repeat(10 * 1024 * 1024) }; // 10MB
      
      (global.localStorage.setItem as jest.Mock).mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      await expect(repo.saveState('user-123', largeState)).rejects.toThrow(RuntimeError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ 
          event: 'LAYOUT_STORAGE_ERROR',
          error: 'QuotaExceededError',
        }),
        'Failed to save layout state'
      );
    });
  });

  describe('caching', () => {
    it('should cache frequently accessed configs', async () => {
      const config = createValidLayoutConfig();
      
      // First call - should hit storage
      await repo.getConfig('layout-main');
      // Second call - should hit cache
      await repo.getConfig('layout-main');

      expect(global.localStorage.getItem).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache on update', async () => {
      const config = createValidLayoutConfig();
      
      await repo.getConfig('layout-main');
      await repo.saveConfig('layout-main', config);
      await repo.getConfig('layout-main');

      expect(global.localStorage.getItem).toHaveBeenCalledTimes(2);
    });
  });
});

// ============================================================================
// Service Layer Tests
// ============================================================================

describe('LayoutService', () => {
  let service: LayoutService;
  let logger: ReturnType<typeof createMockLogger>;
  let mockRepo: jest.Mocked<LayoutRepo>;

  beforeEach(() => {
    logger = createMockLogger();
    mockRepo = {
      getState: jest.fn(),
      saveState: jest.fn(),
      getConfig: jest.fn(),
      saveConfig: jest.fn(),
    } as unknown as jest.Mocked<LayoutRepo>;

    service = new LayoutService(mockRepo, logger);
  });

  describe('viewport management', () => {
    it('should calculate responsive dimensions', () => {
      const viewport = createViewportConfig({ width: 1440 });
      const grid = { columns: 12, gutter: 24, margin: 48, maxWidth: 1200 };

      const dimensions = service.calculateResponsiveDimensions(viewport, grid);

      expect(dimensions).toEqual({
        containerWidth: 1200, // capped at maxWidth
        columnWidth: 88, // (1200 - 11*24) / 12
        totalGutterWidth: 264,
        effectiveMargin: 120, // (1440 - 1200) / 2
      });
    });

    it('should handle viewport smaller than maxWidth', () => {
      const viewport = createViewportConfig({ width: 800 });
      const grid = { columns: 12, gutter: 16, margin: 24, maxWidth: 1200 };

      const dimensions = service.calculateResponsiveDimensions(viewport, grid);

      // Should use available width minus margins
      expect(dimensions.containerWidth).toBe(752); // 800 - 2*24
      expect(dimensions.effectiveMargin).toBe(24);
    });

    it('should throw for invalid viewport in calculations', () => {
      expect(() => 
        service.calculateResponsiveDimensions(
          createViewportConfig({ width: -100 }),
          { columns: 12, gutter: 24 }
        )
      ).toThrow(ValidationError);
    });
  });

  describe('region calculations', () => {
    it('should calculate region layouts with sticky headers', () => {
      const config = createValidLayoutConfig();
      const regions = service.calculateRegionLayout(config, 'desktop');

      expect(regions.header).toEqual(expect.objectContaining({
        position: 'fixed',
        top: 0,
        height: 64,
        zIndex: 100,
      }));
    });

    it('should handle collapsible sidebar state', () => {
      const config = createValidLayoutConfig();
      
      // Expanded state
      const expanded = service.calculateRegionLayout(config, 'desktop', { sidebarCollapsed: false });
      expect(expanded.sidebar.width).toBe(280);

      // Collapsed state
      const collapsed = service.calculateRegionLayout(config, 'desktop', { sidebarCollapsed: true });
      expect(collapsed.sidebar.width).toBe(64); // collapsed width
    });

    it('should hide sidebar on mobile regardless of collapse state', () => {
      const config = createValidLayoutConfig();
      
      const mobile = service.calculateRegionLayout(config, 'mobile', { sidebarCollapsed: false });
      expect(mobile.sidebar.display).toBe('none');
    });
  });

  describe('subscription pattern', () => {
    it('should notify subscribers of layout changes', () => {
      const listener = jest.fn();
      const unsubscribe = service.subscribe(listener);

      service.updateViewport(createViewportConfig({ width: 500 }));

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'VIEWPORT_CHANGE',
          breakpoint: 'mobile',
        })
      );

      unsubscribe();
    });

    it('should not notify after unsubscribe', () => {
      const listener = jest.fn();
      const unsubscribe = service.subscribe(listener);
      
      unsubscribe();
      service.updateViewport(createViewportConfig({ width: 500 }));

      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle subscriber errors gracefully', () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Subscriber error');
      });
      const goodListener = jest.fn();

      service.subscribe(errorListener);
      service.subscribe(goodListener);

      // Should not throw, should log error and continue
      service.updateViewport(createViewportConfig({ width: 500 }));

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'LAYOUT_SUBSCRIBER_ERROR' }),
        expect.stringContaining('Subscriber error')
      );
      expect(goodListener).toHaveBeenCalled(); // Still called despite earlier error
    });
  });

  describe('async operations', () => {
    it('should persist state changes asynchronously', async () => {
      mockRepo.saveState.mockResolvedValue(undefined);

      await service.persistUserPreferences('user-123', {
        sidebarCollapsed: true,
        theme: 'dark',
      });

      expect(mockRepo.saveState).toHaveBeenCalledWith('user-123', {
        sidebarCollapsed: true,
        theme: 'dark',
      });
    });

    it('should handle persistence failures with retry', async () => {
      mockRepo.saveState
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      await service.persistUserPreferences('user-123', { sidebarCollapsed: true });

      expect(mockRepo.saveState).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'LAYOUT_PERSIST_RETRY', attempt: 1 }),
        'Retrying layout state persistence'
      );
    });

    it('should fail after max retries exceeded', async () => {
      mockRepo.saveState.mockRejectedValue(new Error('Persistent error'));

      await expect(
        service.persistUserPreferences('user-123', { sidebarCollapsed: true })
      ).rejects.toThrow(RuntimeError);

      expect(mockRepo.saveState).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Layout Edge Cases', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('extreme viewport values', () => {
    it('should handle very small viewports', () => {
      const config = createValidLayoutConfig({
        viewport: createViewportConfig({ width: 1, height: 1 }),
      });

      const layoutConfig = new LayoutConfigClass(config, logger);
      expect(layoutConfig.getConfig().viewport.width).toBe(1);
    });

    it('should handle very large viewports', () => {
      const config = createValidLayoutConfig({
        viewport: createViewportConfig({ 
          width: 100000, 
          height: 100000,
          devicePixelRatio: 3,
        }),
      });

      const layoutConfig = new LayoutConfigClass(config, logger);
      // Should cap at reasonable maximum to prevent overflow
      expect(layoutConfig.getConfig().viewport.width).toBeLessThanOrEqual(32767);
    });

    it('should handle non-integer pixel ratios', () => {
      const config = createValidLayoutConfig({
        viewport: createViewportConfig({ devicePixelRatio: 1.5 }),
      });

      expect(() => new LayoutConfigClass(config, logger)).not.toThrow();
    });
  });

  describe('malformed configurations', () => {
    it('should handle circular references in regions gracefully', () => {
      const regions: any = { a: { parent: null } };
      regions.a.parent = regions; // Circular

      // Should detect and break circular reference
      const config = createValidLayoutConfig({ regions });
      expect(() => new LayoutConfigClass(config, logger)).toThrow(ValidationError);
    });

    it('should handle NaN and Infinity in numeric fields', () => {
      const invalidConfigs = [
        createValidLayoutConfig({ viewport: createViewportConfig({ width: NaN }) }),
        createValidLayoutConfig({ viewport: createViewportConfig({ width: Infinity }) }),
        createValidLayoutConfig({ grid: { columns: NaN, gutter: 24 } }),
      ];

      invalidConfigs.forEach(config => {
        expect(() => new LayoutConfigClass(config, logger)).toThrow(ValidationError);
      });
    });

    it('should handle prototype pollution attempts', () => {
      const maliciousConfig = JSON.parse('{"__proto__": {"polluted": true}, "viewport": {"width": 100, "height": 100}}');
      
      expect(() => new LayoutConfigClass(maliciousConfig, logger)).toThrow(ValidationError);
      expect(({} as any).polluted).toBeUndefined(); // Ensure no pollution occurred
    });
  });

  describe('concurrent operations', () => {
    it('should handle rapid successive viewport updates', async () => {
      const service = new LayoutService(new LayoutRepo(logger), logger);
      const updates: number[] = [];

      service.subscribe((event) => {
        if (event.type === 'VIEWPORT_CHANGE') {
          updates.push(event.viewport.width);
        }
      });

      // Simulate rapid resize events
      const widths = [100, 200, 150, 300, 250, 400];
      widths.forEach(w => service.updateViewport(createViewportConfig({ width: w })));

      // Should debounce and only process last stable value
      await new Promise(r => setTimeout(r, 100));

      expect(updates.length).toBeLessThan(widths.length);
      expect(updates[updates.length - 1]).toBe(400);
    });

    it('should handle concurrent read/write operations', async () => {
      const repo = new LayoutRepo(logger);
      
      const operations = Array.from({ length: 10 }, (_, i) => 
        repo.saveState(`key-${i}`, { value: i })
      );

      await expect(Promise.all(operations)).resolves.not.toThrow();
    });
  });

  describe('memory pressure scenarios', () => {
    it('should limit subscription count to prevent memory leaks', () => {
      const service = new LayoutService(new LayoutRepo(logger), logger);
      const listeners = Array.from({ length: 1000 }, () => jest.fn());

      listeners.forEach(l => service.subscribe(l));

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'LAYOUT_SUBSCRIPTION_LIMIT' }),
        expect.stringContaining('Maximum subscription limit reached')
      );
    });

    it('should clean up orphaned region references on reconfiguration', () => {
      const service = new LayoutService(new LayoutRepo(logger), logger);
      
      const config1 = createValidLayoutConfig({
        regions: { a: { width: 100 }, b: { width: 200 } },
      });
      
      const config2 = createValidLayoutConfig({
        regions: { a: { width: 150 } }, // b removed
      });

      service.applyConfig(config1);
      const state1 = service.getRegionState();
      
      service.applyConfig(config2);
      const state2 = service.getRegionState();

      expect(state1).toHaveProperty('b');
      expect(state2).not.toHaveProperty('b');
    });
  });

  describe('timezone and locale edge cases', () => {
    it('should handle layout calculations independent of locale', () => {
      const originalLocale = Intl.DateTimeFormat().resolvedOptions().locale;
      
      // This is more relevant for time-based layouts, but included for completeness
      const config = createValidLayoutConfig();
      const layoutConfig = new LayoutConfigClass(config, logger);

      expect(layoutConfig.getConfig().grid.columns).toBe(12);
    });
  });

  describe('accessibility edge cases', () => {
    it('should maintain minimum touch target sizes', () => {
      const config = createValidLayoutConfig({
        regions: {
          button: { width: 20, height: 20 }, // Too small for touch
        },
      });

      const layoutConfig = new LayoutConfigClass(config, logger);
      const warnings = (logger.warn as jest.Mock).mock.calls.filter(
        call => call[0]?.event === 'LAYOUT_ACCESSIBILITY_WARNING'
      );

      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should enforce color contrast minimums in theme configs', () => {
      const config = createValidLayoutConfig({
        theme: {
          backgroundColor: '#ffffff',
          textColor: '#eeeeee', // Poor contrast
        },
      } as any);

      new LayoutConfigClass(config, logger);
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'LAYOUT_CONTRAST_WARNING' }),
        expect.stringContaining('contrast ratio')
      );
    });
  });
});