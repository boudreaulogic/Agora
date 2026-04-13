'use client';

export function FormPreview({
  name,
  description,
  submitButtonText,
  pages,
  fields,
  formSlug,
}: {
  name: string;
  description: string;
  submitButtonText: string;
  pages: any[];
  fields: any[];
  formSlug: string;
}) {
  const isMultiPage = pages.length > 1;

  return (
    <div className="flex-1 bg-gray-50 dark:bg-gray-800 flex flex-col min-w-0 overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Live Preview</span>
        <a href={'/forms/' + formSlug} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-800">Open ↗</a>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{name || 'Untitled Form'}</h2>
            {description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>}
          </div>

          {/* Page stepper */}
          {isMultiPage && (
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center space-x-2">
                {pages.map((page, pi) => (
                  <div key={page.id} className="flex items-center">
                    {pi > 0 && <div className="w-6 h-px bg-gray-300 dark:bg-gray-600 mx-1" />}
                    <div className="flex items-center space-x-1.5">
                      <div className={'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ' + (pi === 0 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400')}>
                        {pi + 1}
                      </div>
                      <span className={'text-[10px] ' + (pi === 0 ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-400')}>{page.title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fields grouped by page */}
          {pages.map((page, pi) => {
            const pageFields = fields.filter(f => f.pageId === page.id && f.visible !== false);
            if (pageFields.length === 0 && !isMultiPage) return null;

            return (
              <div key={page.id} className="p-6 space-y-4">
                {isMultiPage && (
                  <div className="mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{page.title}</h3>
                    {page.description && <p className="text-xs text-gray-500 dark:text-gray-400">{page.description}</p>}
                  </div>
                )}
                {pageFields.map((field, fi) => {
                  if (field.type === 'divider') return <hr key={fi} className="border-gray-200 dark:border-gray-700" />;
				  if (field.type === 'repeating_group') {
                    const tableColMap: Record<string, any> = {};
                    (field.rows || []).forEach((r: any) => (r.fields || []).forEach((fid: string, idx: number) => {
                      tableColMap[fid] = r.labels?.[idx] || fid;
                    }));
                    const firstRow = field.rows?.[0];
                    return (
                      <div key={fi} className="border-2 border-teal-200 dark:border-teal-800 rounded-lg p-3 bg-teal-50/30 dark:bg-teal-900/10">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-teal-700 dark:text-teal-400">{field.label}</span>
                          <span className="text-[9px] text-teal-500">Row 1 of {field.rows?.length}</span>
                        </div>
                        {firstRow && (
                          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(' + (field.columnsPerRow?.length || 1) + ', 1fr)' }}>
                            {(field.columnsPerRow || []).map((colName: string, ci: number) => (
                              <div key={ci}>
                                <label className="block text-[9px] font-medium text-gray-500 mb-0.5">{colName}</label>
                                <input type="text" disabled placeholder={colName} className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800 text-gray-400" />
                              </div>
                            ))}
                          </div>
                        )}
                        <button disabled className="mt-2 text-[10px] text-teal-600 dark:text-teal-400 hover:text-teal-800 font-medium">+ Add Row</button>
                      </div>
                    );
                  }
                  if (field.type === 'section_header') {
                    return (
                      <div key={fi} className="pt-2">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{field.label}</h3>
                        {field.description && <p className="text-xs text-gray-500 dark:text-gray-400">{field.description}</p>}
                      </div>
                    );
                  }
                  return (
                    <div key={fi}>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      {field.description && <p className="text-[10px] text-gray-400 mb-1">{field.description}</p>}
                      {renderPreviewInput(field)}
                    </div>
                  );
                })}
                {isMultiPage && pi < pages.length - 1 && (
                  <div className="flex justify-between pt-4">
                    {pi > 0 && <button className="px-4 py-2 text-xs text-gray-600 border border-gray-300 rounded-lg" disabled>← Back</button>}
                    <button className="px-4 py-2 text-xs bg-blue-600 text-white rounded-lg ml-auto" disabled>Next →</button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Submit */}
          <div className="p-6 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
            <button className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg" disabled>
              {submitButtonText || 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderPreviewInput(field: any) {
  const base = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-400 text-gray-400";

  if (field.type === 'calculated') {
    const formula = field.formula || {};
    const prefix = formula.format === 'currency' ? (formula.prefix || '$') : (formula.prefix || '');
    const suffix = formula.format === 'percent' ? '%' : '';
    return (
      <div className="w-full px-3 py-2.5 text-sm border-2 border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 font-semibold">
        {prefix}0.{'0'.repeat(formula.decimals ?? 2)}{suffix}
        <span className="text-[9px] text-orange-400 dark:text-orange-600 ml-2 font-normal">ƒ calculated</span>
      </div>
    );
  }

  switch (field.columnType) {
    case 'textarea': return <textarea rows={3} placeholder={field.placeholder || ''} disabled className={base + ' resize-none'} />;
    case 'number': case 'currency': case 'percent': case 'rating':
      return <input type="number" placeholder={field.placeholder || ''} disabled className={base} />;
    case 'date': return <input type="date" disabled className={base} />;
    case 'datetime': return <input type="datetime-local" disabled className={base} />;
    case 'checkbox':
      return (
        <label className="flex items-center space-x-2">
          <input type="checkbox" disabled className="w-4 h-4 rounded border-gray-300 text-blue-600" />
          <span className="text-sm text-gray-400">{field.placeholder || 'Check this box'}</span>
        </label>
      );
    case 'select':
      return <select disabled className={base}><option>{field.placeholder || 'Select...'}</option></select>;
    case 'multi_select': return <div className="text-xs text-gray-400 p-2 border border-gray-200 dark:border-gray-700 rounded-lg">Multi-select</div>;
    case 'email': return <input type="email" placeholder={field.placeholder || 'email@example.com'} disabled className={base} />;
    case 'phone': return <input type="tel" placeholder={field.placeholder || '(555) 123-4567'} disabled className={base} />;
    case 'url': return <input type="url" placeholder={field.placeholder || 'https://...'} disabled className={base} />;
    default: return <input type="text" placeholder={field.placeholder || ''} disabled className={base} />;
  }
}