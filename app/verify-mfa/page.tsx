'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function VerifyMfaPage() {
  var [code, setCode] = useState(['', '', '', '', '', '']);
  var [error, setError] = useState('');
  var [sending, setSending] = useState(false);
  var [verifying, setVerifying] = useState(false);
  var [sent, setSent] = useState(false);
  var [countdown, setCountdown] = useState(0);
  var inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  var router = useRouter();

  // Send code on mount
  useEffect(function() {
    sendCode();
  }, []);

  // Countdown timer
  useEffect(function() {
    if (countdown <= 0) return;
    var timer = setTimeout(function() { setCountdown(countdown - 1); }, 1000);
    return function() { clearTimeout(timer); };
  }, [countdown]);

  async function sendCode() {
    if (sending || countdown > 0) return;
    setSending(true);
    setError('');
    try {
      var res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      });
      if (res.ok) {
        setSent(true);
        setCountdown(60);
      } else {
        var data = await res.json();
        setError(data.error || 'Failed to send code');
      }
    } catch (e) {
      setError('Network error');
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    var fullCode = code.join('');
    if (fullCode.length !== 6) {
      setError('Please enter the full 6-digit code');
      return;
    }
    setVerifying(true);
    setError('');
    try {
      var res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', code: fullCode }),
      });
      if (res.ok) {
        // Set a cookie or session flag to mark MFA as verified
        router.push('/');
      } else {
        var data = await res.json();
        setError(data.error || 'Verification failed');
        setCode(['', '', '', '', '', '']);
        if (inputRefs.current[0]) inputRefs.current[0].focus();
      }
    } catch (e) {
      setError('Network error');
    } finally {
      setVerifying(false);
    }
  }

  function handleInput(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    var newCode = code.slice();
    newCode[index] = value.slice(-1);
    setCode(newCode);
    // Auto-advance
    if (value && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1]!.focus();
    }
    // Auto-submit when all 6 digits entered
    if (index === 5 && value) {
      var fullCode = newCode.join('');
      if (fullCode.length === 6) {
        setTimeout(function() { verifyCode(); }, 100);
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      if (inputRefs.current[index - 1]) inputRefs.current[index - 1]!.focus();
    }
    if (e.key === 'Enter') {
      verifyCode();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    var pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      var newCode = ['', '', '', '', '', ''];
      for (var i = 0; i < pasted.length; i++) {
        newCode[i] = pasted[i];
      }
      setCode(newCode);
      if (pasted.length === 6) {
        setTimeout(function() { verifyCode(); }, 100);
      } else if (inputRefs.current[pasted.length]) {
        inputRefs.current[pasted.length]!.focus();
      }
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '40px 32px', background: '#ffffff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' as const }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔐</div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>Verify your identity</h1>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '32px' }}>
          {sent ? "We sent a 6-digit code to your email. Enter it below." : "Sending verification code..."}
        </p>

        {/* Code inputs */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px' }} onPaste={handlePaste}>
          {code.map(function(digit, index) {
            return (
              <input
                key={index}
                ref={function(el) { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={function(e) { handleInput(index, e.target.value); }}
                onKeyDown={function(e) { handleKeyDown(index, e); }}
                style={{
                  width: '48px', height: '56px', textAlign: 'center' as const, fontSize: '24px', fontWeight: 700,
                  border: '2px solid ' + (error ? '#fecaca' : '#d1d5db'), borderRadius: '8px', outline: 'none',
                  color: '#111827', background: '#ffffff',
                  transition: 'border-color 0.15s',
                }}
                onFocus={function(e) { (e.target as HTMLInputElement).style.borderColor = '#3b82f6'; }}
                onBlur={function(e) { (e.target as HTMLInputElement).style.borderColor = error ? '#fecaca' : '#d1d5db'; }}
                autoFocus={index === 0}
              />
            );
          })}
        </div>

        {error && (
          <p style={{ fontSize: '13px', color: '#dc2626', marginBottom: '16px' }}>{error}</p>
        )}

        <button onClick={verifyCode} disabled={verifying || code.join('').length !== 6}
          style={{ width: '100%', padding: '12px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: verifying ? 0.7 : 1, marginBottom: '16px' }}>
          {verifying ? 'Verifying...' : 'Verify'}
        </button>

        <div style={{ fontSize: '12px', color: '#9ca3af' }}>
          {countdown > 0 ? (
            <span>Resend code in {countdown}s</span>
          ) : (
            <button onClick={sendCode} disabled={sending}
              style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>
              {sending ? 'Sending...' : 'Resend code'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}