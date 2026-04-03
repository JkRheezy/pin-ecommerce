import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import HomePage from '../page'
import { useUserService } from '@/layers/service/hooks/useUserService'
import type { User, UserInput } from '@/layers/types/user.types'

// Mock the service layer hook
vi.mock('@/layers/service/hooks/useUserService', () => ({
  useUserService: vi.fn(),
}))

// Mock structured logger
vi.mock('@/layers/runtime/logging/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('HomePage User Interactions', () => {
  const mockCreateUser = vi.fn()
  const mockUpdateUser = vi.fn()
  const mockDeleteUser = vi.fn()
  const mockFetchUsers = vi.fn()

  const mockUsers: User[] = [
    {
      id: 'user-001',
      email: 'alice@example.com',
      name: 'Alice Smith',
      role: 'admin',
      isActive: true,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
    },
    {
      id: 'user-002',
      email: 'bob@example.com',
      name: 'Bob Jones',
      role: 'user',
      isActive: true,
      createdAt: '2024-01-16T10:00:00Z',
      updatedAt: '2024-01-16T10:00:00Z',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementation
    ;(useUserService as Mock).mockReturnValue({
      users: mockUsers,
      isLoading: false,
      error: null,
      createUser: mockCreateUser,
      updateUser: mockUpdateUser,
      deleteUser: mockDeleteUser,
      fetchUsers: mockFetchUsers,
    })
  })

  describe('Form Interactions', () => {
    it('should update input values when user types', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      // Open create user modal
      const createButton = screen.getByRole('button', { name: /create user/i })
      await user.click(createButton)

      // Fill in form fields
      const nameInput = screen.getByLabelText(/name/i)
      const emailInput = screen.getByLabelText(/email/i)

      await user.type(nameInput, 'Charlie Brown')
      await user.type(emailInput, 'charlie@example.com')

      expect(nameInput).toHaveValue('Charlie Brown')
      expect(emailInput).toHaveValue('charlie@example.com')
    })

    it('should show validation errors for invalid inputs', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      // Open create user modal
      const createButton = screen.getByRole('button', { name: /create user/i })
      await user.click(createButton)

      // Submit form without filling required fields
      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Check for validation error messages
      expect(screen.getByText(/name is required/i)).toBeInTheDocument()
      expect(screen.getByText(/email is required/i)).toBeInTheDocument()
    })

    it('should clear form when modal is closed', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      // Open create user modal
      const createButton = screen.getByRole('button', { name: /create user/i })
      await user.click(createButton)

      // Fill in a field
      const nameInput = screen.getByLabelText(/name/i)
      await user.type(nameInput, 'Temporary Name')

      // Close modal using cancel button
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      // Reopen modal and verify field is cleared
      await user.click(createButton)
      const reopenedNameInput = screen.getByLabelText(/name/i)

      expect(reopenedNameInput).toHaveValue('')
    })
  })

  describe('Create User Flow', () => {
    it('should call createUser service when form is submitted with valid data', async () => {
      const user = userEvent.setup()
      mockCreateUser.mockResolvedValueOnce({
        id: 'user-003',
        email: 'charlie@example.com',
        name: 'Charlie Brown',
        role: 'user',
        isActive: true,
        createdAt: '2024-01-17T10:00:00Z',
        updatedAt: '2024-01-17T10:00:00Z',
      })

      render(<HomePage />)

      // Open create user modal
      const createButton = screen.getByRole('button', { name: /create user/i })
      await user.click(createButton)

      // Fill in valid form data
      const nameInput = screen.getByLabelText(/name/i)
      const emailInput = screen.getByLabelText(/email/i)
      const roleSelect = screen.getByLabelText(/role/i)

      await user.type(nameInput, 'Charlie Brown')
      await user.type(emailInput, 'charlie@example.com')
      await user.selectOptions(roleSelect, 'user')

      // Submit form
      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Verify service was called with correct data
      await waitFor(() => {
        expect(mockCreateUser).toHaveBeenCalledWith({
          name: 'Charlie Brown',
          email: 'charlie@example.com',
          role: 'user',
        } satisfies UserInput)
      })
    })

    it('should display error message when createUser fails', async () => {
      const user = userEvent.setup()
      const errorMessage = 'Email already exists'
      mockCreateUser.mockRejectedValueOnce(new Error(errorMessage))

      render(<HomePage />)

      // Open create user modal
      const createButton = screen.getByRole('button', { name: /create user/i })
      await user.click(createButton)

      // Fill and submit form
      const nameInput = screen.getByLabelText(/name/i)
      const emailInput = screen.getByLabelText(/email/i)

      await user.type(nameInput, 'Charlie Brown')
      await user.type(emailInput, 'existing@example.com')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await user.click(submitButton)

      // Verify error is displayed
      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument()
      })
    })

    it('should disable submit button while creating user', async () => {
      const user = userEvent.setup()
      let resolveCreate: (value: User) => void

      mockCreateUser.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCreate = resolve
          })
      )

      // Override to show loading state
      ;(useUserService as Mock).mockReturnValue({
        users: mockUsers,
        isLoading: true, // Simulate loading state
        error: null,
        createUser: mockCreateUser,
        updateUser: mockUpdateUser,
        deleteUser: mockDeleteUser,
        fetchUsers: mockFetchUsers,
      })

      render(<HomePage />)

      // Open create user modal
      const createButton = screen.getByRole('button', { name: /create user/i })
      await user.click(createButton)

      // Submit button should be disabled during loading
      const submitButton = screen.getByRole('button', { name: /submit/i })
      expect(submitButton).toBeDisabled()

      // Resolve the promise
      resolveCreate!({
        id: 'user-003',
        email: 'charlie@example.com',
        name: 'Charlie Brown',
        role: 'user',
        isActive: true,
        createdAt: '2024-01-17T10:00:00Z',
        updatedAt: '2024-01-17T10:00:00Z',
      })
    })
  })

  describe('Update User Flow', () => {
    it('should pre-populate form when editing existing user', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      // Find and click edit button for first user
      const editButtons = screen.getAllByRole('button', { name: /edit/i })
      await user.click(editButtons[0])

      // Verify form is pre-populated with user data
      const nameInput = screen.getByLabelText(/name/i)
      const emailInput = screen.getByLabelText(/email/i)

      expect(nameInput).toHaveValue('Alice Smith')
      expect(emailInput).toHaveValue('alice@example.com')
    })

    it('should call updateUser service with correct data', async () => {
      const user = userEvent.setup()
      mockUpdateUser.mockResolvedValueOnce({
        ...mockUsers[0],
        name: 'Alice Johnson',
      })

      render(<HomePage />)

      // Open edit modal for first user
      const editButtons = screen.getAllByRole('button', { name: /edit/i })
      await user.click(editButtons[0])

      // Modify the name
      const nameInput = screen.getByLabelText(/name/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'Alice Johnson')

      // Submit form
      const submitButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(submitButton)

      // Verify service was called with updated data
      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith('user-001', {
          name: 'Alice Johnson',
          email: 'alice@example.com',
          role: 'admin',
        })
      })
    })
  })

  describe('Delete User Flow', () => {
    it('should show confirmation dialog before deleting user', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      // Click delete button for first user
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
      await user.click(deleteButtons[0])

      // Verify confirmation dialog appears
      expect(screen.getByText(/confirm deletion/i)).toBeInTheDocument()
      expect(
        screen.getByText(/are you sure you want to delete alice smith/i)
      ).toBeInTheDocument()
    })

    it('should call deleteUser service when deletion is confirmed', async () => {
      const user = userEvent.setup()
      mockDeleteUser.mockResolvedValueOnce(undefined)

      render(<HomePage />)

      // Click delete button for first user
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
      await user.click(deleteButtons[0])

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: /confirm/i })
      await user.click(confirmButton)

      // Verify service was called with correct user ID
      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalledWith('user-001')
      })
    })

    it('should not call deleteUser when deletion is cancelled', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      // Click delete button for first user
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
      await user.click(deleteButtons[0])

      // Cancel deletion
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      // Verify service was not called
      expect(mockDeleteUser).not.toHaveBeenCalled()

      // Verify dialog is closed
      expect(screen.queryByText(/confirm deletion/i)).not.toBeInTheDocument()
    })

    it('should handle delete error gracefully', async () => {
      const user = userEvent.setup()
      mockDeleteUser.mockRejectedValueOnce(new Error('Network error'))

      render(<HomePage />)

      // Click delete button
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i })
      await user.click(deleteButtons[0])

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: /confirm/i })
      await user.click(confirmButton)

      // Verify error is displayed
      await waitFor(() => {
        expect(screen.getByText(/failed to delete user/i)).toBeInTheDocument()
      })
    })
  })

  describe('Search and Filter Interactions', () => {
    it('should filter users when search term is entered', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      const searchInput = screen.getByPlaceholderText(/search users/i)
      await user.type(searchInput, 'alice')

      // Only Alice should be visible
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
      expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument()
    })

    it('should clear search when clear button is clicked', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      const searchInput = screen.getByPlaceholderText(/search users/i)
      await user.type(searchInput, 'alice')

      // Click clear button
      const clearButton = screen.getByRole('button', { name: /clear search/i })
      await user.click(clearButton)

      expect(searchInput).toHaveValue('')
      // Both users should be visible again
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
      expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    })

    it('should filter by role when role filter is changed', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      const roleFilter = screen.getByLabelText(/filter by role/i)
      await user.selectOptions(roleFilter, 'admin')

      // Only admin should be visible
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
      expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument()
    })
  })

  describe('Accessibility Interactions', () => {
    it('should support keyboard navigation through user list', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      // Tab to first action button
      const firstRow = screen.getAllByRole('row')[1] // Skip header row
      const editButton = firstRow.querySelector('button')

      // Focus should be manageable via keyboard
      editButton?.focus()
      expect(document.activeElement).toBe(editButton)

      // Press Enter to activate
      await user.keyboard('{Enter}')
      expect(screen.getByText(/edit user/i)).toBeInTheDocument()
    })

    it('should trap focus within modal when open', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      // Open modal
      const createButton = screen.getByRole('button', { name: /create user/i })
      await user.click(createButton)

      // Tab through all focusable elements in modal
      const focusableElements = screen
        .getByRole('dialog')
        .querySelectorAll('button, input, select, textarea, [href]')

      // First element should be focused
      expect(document.activeElement).toBe(focusableElements[0])

      // Tab to last element
      for (let i = 0; i < focusableElements.length; i++) {
        await user.tab()
      }

      // Next tab should cycle back to first element (focus trap)
      await user.tab()
      expect(document.activeElement).toBe(focusableElements[0])
    })

    it('should close modal on Escape key press', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      // Open modal
      const createButton = screen.getByRole('button', { name: /create user/i })
      await user.click(createButton)

      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // Press Escape
      await user.keyboard('{Escape}')

      // Modal should be closed
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })

  describe('Loading and Error States', () => {
    it('should show loading skeleton while fetching users', () => {
      ;(useUserService as Mock).mockReturnValue({
        users: [],
        isLoading: true,
        error: null,
        createUser: mockCreateUser,
        updateUser: mockUpdateUser,
        deleteUser: mockDeleteUser,
        fetchUsers: mockFetchUsers,
      })

      render(<HomePage />)

      // Check for loading skeleton elements
      expect(screen.getAllByTestId('user-skeleton')).toHaveLength(3)
    })

    it('should show error state with retry button', () => {
      const errorMessage = 'Failed to load users'
      ;(useUserService as Mock).mockReturnValue({
        users: [],
        isLoading: false,
        error: new Error(errorMessage),
        createUser: mockCreateUser,
        updateUser: mockUpdateUser,
        deleteUser: mockDeleteUser,
        fetchUsers: mockFetchUsers,
      })

      render(<HomePage />)

      expect(screen.getByText(/error loading users/i)).toBeInTheDocument()
      expect(screen.getByText(errorMessage)).toBeInTheDocument()

      const retryButton = screen.getByRole('button', { name: /retry/i })
      expect(retryButton).toBeInTheDocument()
    })

    it('should call fetchUsers when retry button is clicked', async () => {
      const user = userEvent.setup()
      ;(useUserService as Mock).mockReturnValue({
        users: [],
        isLoading: false,
        error: new Error('Failed to load'),
        createUser: mockCreateUser,
        updateUser: mockUpdateUser,
        deleteUser: mockDeleteUser,
        fetchUsers: mockFetchUsers,
      })

      render(<HomePage />)

      const retryButton = screen.getByRole('button', { name: /retry/i })
      await user.click(retryButton)

      expect(mockFetchUsers).toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle rapid consecutive clicks on action buttons', async () => {
      const user = userEvent.setup()
      mockDeleteUser.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      render(<HomePage />)

      // Click delete button rapidly multiple times
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i })

      // Rapid clicks should not open multiple dialogs
      await user.click(deleteButtons[0])
      await user.click(deleteButtons[0])
      await user.click(deleteButtons[0])

      // Only one dialog should be present
      const dialogs = screen.getAllByRole('dialog')
      expect(dialogs).toHaveLength(1)
    })

    it('should handle very long user names gracefully', async () => {
      const longNameUser: User = {
        id: 'user-003',
        email: 'longname@example.com',
        name: 'A'.repeat(100),
        role: 'user',
        isActive: true,
        createdAt: '2024-01-17T10:00:00Z',
        updatedAt: '2024-01-17T10:00:00Z',
      }

      ;(useUserService as Mock).mockReturnValue({
        users: [...mockUsers, longNameUser],
        isLoading: false,
        error: null,
        createUser: mockCreateUser,
        updateUser: mockUpdateUser,
        deleteUser: mockDeleteUser,
        fetchUsers: mockFetchUsers,
      })

      render(<HomePage />)

      // Long name should be displayed (possibly truncated with CSS)
      const longNameCell = screen.getByText('A'.repeat(100))
      expect(longNameCell).toBeInTheDocument()
    })

    it('should handle special characters in search input', async () => {
      const user = userEvent.setup()
      render(<HomePage />)

      const searchInput = screen.getByPlaceholderText(/search users/i)

      // Type special regex characters
      await user.type(searchInput, '[.*+?^${}()|[]\\')

      // Should not throw error, just show no results
      expect(screen.getByText(/no users found/i)).toBeInTheDocument()
    })
  })
})