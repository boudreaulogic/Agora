'use client';

import { useState, useEffect, useRef } from 'react';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📑';
  if (mimeType.startsWith('text/')) return '📃';
  if (mimeType.includes('zip')) return '📦';
  return '📎';
}

export function AttachmentCell({
  tableId,
  rowId,
  columnId,
  readOnly = false,
  compact = false,
}: {
  tableId: string;
  rowId: string;
  columnId: string;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [showAll, setShowAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAttachments();
  }, [tableId, rowId, columnId]);

  async function fetchAttachments() {
    try {
      const res = await fetch(`/api/tables/${tableId}/rows/${rowId}/attachments?columnId=${columnId}`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data.attachments || []);
      }
    } catch {}
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Uploading ${file.name}...`);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('columnId', columnId);

        const res = await fetch(`/api/tables/${tableId}/rows/${rowId}/attachments`, {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const attachment = await res.json();
          setAttachments(prev => [attachment, ...prev]);
        } else {
          const err = await res.json();
          alert(err.error || `Failed to upload ${file.name}`);
        }
      }
    } finally {
      setIsUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(attachmentId: string) {
    if (!confirm('Delete this file?')) return;
    try {
      const res = await fetch(`/api/tables/${tableId}/rows/${rowId}/attachments?attachmentId=${attachmentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setAttachments(prev => prev.filter(a => a.id !== attachmentId));
      }
    } catch {}
  }

  // Compact mode for grid cells
  if (compact) {
    if (attachments.length === 0) {
      return <span className="text-gray-400 text-xs">📎 No files</span>;
    }
    return (
      <div className="flex items-center space-x-1">
        <span className="text-xs text-blue-600 font-medium">📎 {attachments.length} file{attachments.length !== 1 ? 's' : ''}</span>
      </div>
    );
  }

  // Full mode for Row Expand Panel
  return (
    <div className="space-y-2">
      {/* Upload button */}
      {!readOnly && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleUpload}
            className="hidden"
            accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{uploadProgress || 'Uploading...'}</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Attach files</span>
              </>
            )}
          </button>
          <p className="text-[10px] text-gray-400 mt-1">Max 10MB per file. Images, PDFs, Office docs, text, zip.</p>
        </div>
      )}

      {/* File list */}
      {attachments.length === 0 && readOnly && (
        <p className="text-xs text-gray-400">No attachments</p>
      )}

      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {(showAll ? attachments : attachments.slice(0, 3)).map(att => (
            <div key={att.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-100 group hover:bg-gray-100 transition-colors">
              <div className="flex items-center space-x-2.5 min-w-0">
                {/* Thumbnail for images */}
                {att.mimeType.startsWith('image/') ? (
                  <a href={`/api/files/${att.id}`} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                    <img
                      src={`/api/files/${att.id}`}
                      alt={att.originalName || att.originalname}
                      className="w-10 h-10 rounded object-cover border border-gray-200"
                    />
                  </a>
                ) : (
                  <span className="text-xl flex-shrink-0">{getFileIcon(att.mimeType || att.mimetype)}</span>
                )}
                <div className="min-w-0">
                  <a
                    href={`/api/files/${att.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-gray-900 hover:text-blue-600 truncate block"
                  >
                    {att.originalName || att.originalname}
                  </a>
                  <p className="text-[10px] text-gray-400">{formatFileSize(att.size)}</p>
                </div>
              </div>
              <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={`/api/files/${att.id}?download=true`}
                  className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
                  title="Download"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
                {!readOnly && (
                  <button
                    onClick={() => handleDelete(att.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                    title="Delete"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
          {attachments.length > 3 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-[10px] text-blue-600 hover:text-blue-800"
            >
              {showAll ? 'Show less' : `+${attachments.length - 3} more files`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}