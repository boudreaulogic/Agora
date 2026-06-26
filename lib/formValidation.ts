// Server-side validation for public form submissions.
//
// The public form page (app/forms/[slug]/page.tsx) does rich client-side
// validation, but anyone can POST straight to /api/public/forms/[slug] with
// curl and skip it. This mirrors the important client checks so the server is
// the real enforcement point — preventing garbage, oversized, or wrong-typed
// values from landing in the database.

var PATTERNS: Record<string, RegExp> = {
  letters_only: /^[a-zA-Z\s]+$/,
  numbers_only: /^\d+$/,
  alphanumeric: /^[a-zA-Z0-9\s]+$/,
  no_special: /^[a-zA-Z0-9\s.,'-]+$/,
  zip_us: /^\d{5}(-\d{4})?$/,
  ssn: /^\d{3}-\d{2}-\d{4}$/,
  tribal_id: /^[a-zA-Z0-9-]+$/,
};
var PHONE_PATTERNS: Record<string, RegExp> = {
  us: /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/,
  us_simple: /^\d{10}$/,
  international: /^\+?\d[\d\s-]{9,}$/,
  any: /^\d{10,}$/,
};

// Hard ceiling on any single string value — defends against multi-MB payloads
// bloating the DB even when a field sets no explicit maxLength.
var MAX_FIELD_LEN = 50000;

function label(field: any): string {
  return field.label || 'Field';
}

// Returns an error string, or null if the value is acceptable. Empty values are
// allowed here unless required (the required check is also enforced separately
// in the route so callers can short-circuit early).
export function validateSubmittedValue(field: any, value: any): string | null {
  var isEmpty = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
  if (isEmpty) {
    if (field.required) return label(field) + ' is required';
    return null;
  }

  if (typeof value === 'string' && value.length > MAX_FIELD_LEN) {
    return label(field) + ' is too long';
  }

  var v = field.validation || {};
  var colType = field.columnType || field.type;

  if (typeof value === 'string') {
    if (v.minLength && value.length < v.minLength) return label(field) + ' must be at least ' + v.minLength + ' characters';
    if (v.maxLength && value.length > v.maxLength) return label(field) + ' must be no more than ' + v.maxLength + ' characters';
  }

  if (colType === 'number' || colType === 'currency' || colType === 'percent') {
    var num = parseFloat(String(value));
    if (isNaN(num)) return label(field) + ' must be a number';
    if (v.min !== undefined && v.min !== '' && num < parseFloat(v.min)) return label(field) + ' must be at least ' + v.min;
    if (v.max !== undefined && v.max !== '' && num > parseFloat(v.max)) return label(field) + ' must be no more than ' + v.max;
  }

  if (typeof value === 'string') {
    if (colType === 'email' && v.emailFormat !== false && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Please enter a valid email';
    }
    if (colType === 'url' && v.urlFormat !== false && !/^https?:\/\/.+\..+/.test(value)) {
      return 'Please enter a valid URL';
    }
    if (colType === 'phone' && v.phoneFormat !== false) {
      var pat = PHONE_PATTERNS[v.phonePattern || 'us'] || PHONE_PATTERNS.us;
      var cleaned = value.replace(/\s/g, '');
      if (!pat.test(cleaned) && !pat.test(value)) return 'Please enter a valid phone number';
    }
    if (v.pattern && v.pattern !== 'none') {
      if (v.pattern === 'custom' && v.customRegex) {
        try { if (!new RegExp(v.customRegex).test(value)) return v.errorMessage || 'Invalid format'; } catch {}
      } else if (PATTERNS[v.pattern] && !PATTERNS[v.pattern].test(value)) {
        return v.errorMessage || 'Invalid format';
      }
    }
  }

  return null;
}

export { MAX_FIELD_LEN };
