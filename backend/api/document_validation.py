import os
import re
import zipfile

from rest_framework.exceptions import ValidationError


MAX_DOCUMENT_SIZE = 10 * 1024 * 1024
CONTENT_TYPES = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
}


def sanitize_filename(value):
    name = os.path.basename(value.replace('\\', '/'))
    name = re.sub(r'[\x00-\x1f\x7f]+', '', name).strip()
    return name[:255] or 'document'


def validate_document_file(upload):
    filename = sanitize_filename(upload.name)
    extension = os.path.splitext(filename)[1].lower()
    if extension not in CONTENT_TYPES:
        raise ValidationError({'file': 'Upload a PDF, DOCX, or DOC document.'})
    if upload.size > MAX_DOCUMENT_SIZE:
        raise ValidationError({'file': 'Documents must be 10 MB or smaller.'})
    if upload.size == 0:
        raise ValidationError({'file': 'The document is empty.'})

    upload.seek(0)
    signature = upload.read(8)
    upload.seek(0)
    valid = False
    if extension == '.pdf':
        valid = signature.startswith(b'%PDF-')
    elif extension == '.doc':
        valid = signature == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'
    else:
        try:
            with zipfile.ZipFile(upload) as archive:
                names = set(archive.namelist())
                valid = (
                    '[Content_Types].xml' in names
                    and 'word/document.xml' in names
                )
        except (zipfile.BadZipFile, OSError):
            valid = False
        finally:
            upload.seek(0)
    if not valid:
        raise ValidationError({
            'file': f'The file contents do not match the {extension} format.'
        })
    return filename, CONTENT_TYPES[extension]
