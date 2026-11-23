import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentLibrary from './DocumentLibrary';

const apiMocks = vi.hoisted(() => ({
  deleteDocument: vi.fn(), getDocuments: vi.fn(), openDocument: vi.fn(),
  updateDocument: vi.fn(), uploadDocument: vi.fn(),
}));

vi.mock('../api/documents', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/documents')>(),
  ...apiMocks,
}));

const documents = [
  { id: 1, original_filename: 'resume.pdf', display_name: 'Fall Resume', category: 'resume', category_label: 'Resume', file_extension: 'pdf', file_size: 2048, content_type: 'application/pdf', uploaded_at: '2026-11-20T12:00:00Z', linked_applications: [] },
  { id: 2, original_filename: 'certificate.docx', display_name: 'Cloud Certificate', category: 'certificate', category_label: 'Certificate', file_extension: 'docx', file_size: 4096, content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', uploaded_at: '2026-11-21T12:00:00Z', linked_applications: [{ id: 4, job_title: 'Engineer', company: 'Example', attached_at: '2026-11-21T13:00:00Z' }] },
] as const;

describe('DocumentLibrary', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    apiMocks.getDocuments.mockResolvedValue(documents);
  });

  it('renders documents, associations, search, and category filters', async () => {
    const user = userEvent.setup(); render(<DocumentLibrary />);
    expect(await screen.findByText('Fall Resume')).toBeInTheDocument();
    expect(screen.getByText(/Linked to Engineer at Example/)).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search documents' }), 'cloud');
    expect(screen.queryByText('Fall Resume')).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search documents' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by category' }), 'resume');
    expect(screen.getByText('Fall Resume')).toBeInTheDocument();
    expect(screen.queryByText('Cloud Certificate')).not.toBeInTheDocument();
  });

  it('exposes loading and empty states', async () => {
    let resolveDocuments: (value: unknown) => void = () => undefined;
    apiMocks.getDocuments.mockReturnValue(new Promise((resolve) => { resolveDocuments = resolve; }));
    render(<DocumentLibrary />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your documents');
    resolveDocuments([]); await screen.findByText('Your library is ready.');
  });

  it('requires a selected file before submitting', async () => {
    const user = userEvent.setup(); render(<DocumentLibrary />);
    await user.click(screen.getByRole('button', { name: '+ Upload document' }));
    await user.click(screen.getByRole('button', { name: 'Upload document' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Choose a document to upload.');
    expect(apiMocks.uploadDocument).not.toHaveBeenCalled();
  });

  it('uses a modal dialog and dismisses it on cancel', async () => {
    const user = userEvent.setup(); render(<DocumentLibrary />);
    await user.click(screen.getByRole('button', { name: '+ Upload document' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('open');
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clears a missing-file error and submits a selected PDF', async () => {
    const user = userEvent.setup();
    const selected = new File(['%PDF-1.7 synthetic'], 'resume.pdf', { type: 'application/pdf' });
    apiMocks.uploadDocument.mockResolvedValue({
      ...documents[0],
      id: 3,
      display_name: 'Milestone 6 S3 Test',
    });
    render(<DocumentLibrary />);
    await user.click(screen.getByRole('button', { name: '+ Upload document' }));
    await user.click(screen.getByRole('button', { name: 'Upload document' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a document to upload.');

    await user.upload(screen.getByLabelText(/File/), selected);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const displayName = screen.getByRole('textbox', { name: 'Display name' });
    await user.clear(displayName);
    await user.type(displayName, 'Milestone 6 S3 Test');
    await user.click(screen.getByRole('button', { name: 'Upload document' }));

    expect(apiMocks.uploadDocument).toHaveBeenCalledWith(
      selected,
      'resume',
      'Milestone 6 S3 Test',
    );
  });

  it('rejects unsupported file types in application validation', async () => {
    const user = userEvent.setup({ applyAccept: false }); render(<DocumentLibrary />);
    await user.click(screen.getByRole('button', { name: '+ Upload document' }));
    await user.upload(
      screen.getByLabelText(/File/),
      new File(['plain text'], 'notes.txt', { type: 'text/plain' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a PDF, DOCX, or DOC file.');
  });

  it('renames and deletes with explicit confirmation', async () => {
    const user = userEvent.setup();
    apiMocks.updateDocument.mockImplementation(async (_id, changes) => ({ ...documents[0], ...changes }));
    apiMocks.deleteDocument.mockResolvedValue(undefined); render(<DocumentLibrary />);
    const card = (await screen.findByText('Fall Resume')).closest('li') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Edit' }));
    const name = screen.getByRole('textbox', { name: 'Display name' });
    await user.clear(name); await user.type(name, 'Updated Resume');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    const updatedCard = (await screen.findByText('Updated Resume')).closest('li') as HTMLElement;
    await user.click(within(updatedCard).getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('heading', { name: 'Delete document?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete document' }));
    expect(apiMocks.deleteDocument).toHaveBeenCalledWith(1);
  });
});
