export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: any; // cleaned/formatted value
}
 
var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var URL_REGEX = /^https?:\/\/.+\..+/;
var PHONE_PATTERNS: Record<string, RegExp> = {
  us: /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/,
  us_simple: /^\d{10}$/,
  international: /^\+?\d[\d\s-]{9,}$/,
  any: /^\d{10,}$/,
};
var HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
 
export function validateColumnValue(
  value: any,
  columnType: string,
  columnSettings?: any
): ValidationResult {
  // Empty values are always valid (required check is separate)
  if (value === undefined || value === null || value === '') {
    return { valid: true, sanitized: value };
  }
 
  var strVal = String(value).trim();
 
  switch (columnType) {
    case 'email': {
      if (!EMAIL_REGEX.test(strVal)) {
        return { valid: false, error: 'Please enter a valid email address (e.g. name@example.com)' };
      }
      return { valid: true, sanitized: strVal.toLowerCase() };
    }
 
    case 'phone': {
      // Strip common formatting chars for validation
      var digits = strVal.replace(/[\s\-\.\(\)]/g, '');
      // Must have at least 7 digits
      if (!/^\+?\d{7,15}$/.test(digits)) {
        return { valid: false, error: 'Please enter a valid phone number (e.g. (555) 123-4567)' };
      }
      return { valid: true, sanitized: strVal };
    }
 
    case 'url': {
      // Auto-add https:// if missing protocol
      var urlVal = strVal;
      if (!/^https?:\/\//i.test(urlVal)) {
        urlVal = 'https://' + urlVal;
      }
      try {
        new URL(urlVal);
      } catch {
        return { valid: false, error: 'Please enter a valid URL (e.g. https://example.com)' };
      }
      if (!URL_REGEX.test(urlVal)) {
        return { valid: false, error: 'Please enter a valid URL (e.g. https://example.com)' };
      }
      return { valid: true, sanitized: urlVal };
    }
 
    case 'number': {
      if (strVal !== '' && isNaN(Number(strVal))) {
        return { valid: false, error: 'Please enter a valid number' };
      }
      return { valid: true, sanitized: strVal };
    }
 
    case 'currency': {
      // Strip $ and commas
      var cleaned = strVal.replace(/[$,]/g, '').trim();
      if (cleaned !== '' && isNaN(Number(cleaned))) {
        return { valid: false, error: 'Please enter a valid dollar amount (e.g. 99.99)' };
      }
      return { valid: true, sanitized: cleaned };
    }
 
    case 'percent': {
      var pctCleaned = strVal.replace(/%/g, '').trim();
      if (pctCleaned !== '' && isNaN(Number(pctCleaned))) {
        return { valid: false, error: 'Please enter a valid percentage' };
      }
      var pctNum = Number(pctCleaned);
      if (pctNum < 0 || pctNum > 100) {
        return { valid: false, error: 'Percentage must be between 0 and 100' };
      }
      return { valid: true, sanitized: pctCleaned };
    }
 
    case 'rating': {
      var ratingNum = parseInt(strVal);
      if (isNaN(ratingNum) || ratingNum < 0 || ratingNum > 5) {
        return { valid: false, error: 'Rating must be between 0 and 5' };
      }
      return { valid: true, sanitized: String(ratingNum) };
    }
 
    case 'progress': {
      var progNum = parseFloat(strVal);
      if (isNaN(progNum) || progNum < 0 || progNum > 100) {
        return { valid: false, error: 'Progress must be between 0 and 100' };
      }
      return { valid: true, sanitized: strVal };
    }
 
    case 'date': {
      if (strVal && isNaN(Date.parse(strVal))) {
        return { valid: false, error: 'Please enter a valid date' };
      }
      return { valid: true, sanitized: strVal };
    }
 
    case 'datetime': {
      if (strVal && isNaN(Date.parse(strVal))) {
        return { valid: false, error: 'Please enter a valid date and time' };
      }
      return { valid: true, sanitized: strVal };
    }
 
    case 'checkbox': {
      if (strVal !== 'true' && strVal !== 'false') {
        return { valid: true, sanitized: strVal === '1' || strVal === 'yes' ? 'true' : 'false' };
      }
      return { valid: true, sanitized: strVal };
    }
 
    case 'color': {
      if (!HEX_COLOR_REGEX.test(strVal)) {
        return { valid: false, error: 'Please enter a valid hex color (e.g. #3B82F6)' };
      }
      return { valid: true, sanitized: strVal };
    }
 
    case 'select': {
      var options = columnSettings?.options || [];
      if (options.length > 0) {
        var validOption = options.some(function(opt: any) { return opt.value === strVal; });
        if (!validOption) {
          return { valid: false, error: 'Please select a valid option' };
        }
      }
      return { valid: true, sanitized: strVal };
    }
 
    case 'multi_select': {
      var msOptions = columnSettings?.options || [];
      if (msOptions.length > 0) {
        var vals = strVal.split(',').filter(Boolean);
        var invalid = vals.filter(function(v: string) {
          return !msOptions.some(function(opt: any) { return opt.value === v.trim(); });
        });
        if (invalid.length > 0) {
          return { valid: false, error: 'Invalid option(s): ' + invalid.join(', ') };
        }
      }
      return { valid: true, sanitized: strVal };
    }
 
    case 'text':
    case 'long_text':
    case 'duration':
    case 'user':
    default:
      return { valid: true, sanitized: strVal };
  }
}
 
// Validate with column description for error messages
export function getColumnTypeLabel(type: string): string {
  var labels: Record<string, string> = {
    text: 'Text', long_text: 'Long Text', number: 'Number', currency: 'Currency',
    percent: 'Percent', date: 'Date', datetime: 'Date & Time', checkbox: 'Checkbox',
    select: 'Select', multi_select: 'Multi Select', email: 'Email', url: 'URL',
    phone: 'Phone', rating: 'Rating', progress: 'Progress', color: 'Color',
    duration: 'Duration', formula: 'Formula', lookup: 'Lookup', rollup: 'Rollup',
  };
  return labels[type] || type;
}
 