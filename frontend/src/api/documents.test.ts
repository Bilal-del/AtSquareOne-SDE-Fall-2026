import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDocument, uploadDocument, type LibraryDocument } from './documents';

const clientMocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock('./client', () => ({ default: clientMocks }));

describe('document uploads', () => {
  beforeEach(() => clientMocks.post.mockReset());

  it('sends the selected file as multipart form data', async () => {
    const selected = new File(['%PDF-1.7 synthetic'], 'resume.pdf', {
      type: 'application/pdf',
    });
    clientMocks.post.mockResolvedValue({ data: { id: 1 } });

    await uploadDocument(selected, 'resume', 'Milestone 6 S3 Test');

    expect(clientMocks.post).toHaveBeenCalledWith(
      '/documents/',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    const form = clientMocks.post.mock.calls[0][1] as FormData;
    expect(form.get('file')).toBe(selected);
    expect(form.get('category')).toBe('resume');
    expect(form.get('display_name')).toBe('Milestone 6 S3 Test');
  });

  it('uses each newly authorized URL without modifying it', async () => {
    const signedUrl = 'https://bucket.s3.us-east-2.amazonaws.com/object.pdf?X-Amz-Signature=abc%2B123';
    const replace = vi.fn();
    const close = vi.fn();
    const target = {
      opener: window,
      location: { replace },
      close,
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(target);
    clientMocks.post.mockResolvedValue({ data: { url: signedUrl } });
    const document = { id: 7 } as LibraryDocument;

    await openDocument(document, 'inline');

    expect(clientMocks.post).toHaveBeenCalledWith(
      '/documents/7/access/',
      { disposition: 'inline' },
    );
    expect(replace).toHaveBeenCalledWith(signedUrl);
    expect(close).not.toHaveBeenCalled();
  });
});
