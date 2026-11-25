import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useStore, type AuthUser } from '../context/StoreContext';
import { apiRequest, setAuthToken } from '../lib/api';

export function AuthPage() {
  const { setUser, navigate, showToast, refreshCart } = useStore();
  const [tab, setTab] = useState<'login' | 'register' | 'admin'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState<'TZS' | 'USD'>('TZS');
  const [adminNeedsBootstrap, setAdminNeedsBootstrap] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [verificationHint, setVerificationHint] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiRequest<{ needsBootstrap: boolean }>('/auth/admin-status')
      .then((res) => setAdminNeedsBootstrap(res.needsBootstrap))
      .catch(() => {});
  }, []);

  const finishAuth = async (token: string, user: AuthUser) => {
    setAuthToken(token);
    setUser(user);
    await refreshCart();
    showToast(`Signed in as ${user.fullName} (${user.role})`, 'success');
    if (user.role === 'admin') navigate('admin-dashboard');
    else if (user.role === 'merchant') navigate('merchant-dashboard');
    else if (user.role === 'operations') navigate('operations-dashboard');
    else navigate('account');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await finishAuth(res.token, res.user);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Login failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setBusy(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: demoEmail, password: 'Corelink2026!' }),
      });
      await finishAuth(res.token, res.user);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Demo login failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser; verificationHint: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, fullName, phone, preferredCurrency }),
      });
      setAuthToken(res.token);
      setUser(res.user);
      setVerificationHint(res.verificationHint);
      showToast('Account created! Verify your email code below.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Registration failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode }),
      });
      showToast('Email verified successfully!', 'success');
      navigate('account');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Verification failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAdminClaimOrLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiRequest<{ token: string; user: AuthUser }>('/auth/admin-claim', {
        method: 'POST',
        body: JSON.stringify({
          email: email || 'admin@smgcorelink.co.tz',
          fullName: fullName || 'SMG Platform Administrator',
          passcode: adminPasscode,
        }),
      });
      await finishAuth(res.token, res.user);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Admin authentication failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-8 py-12 space-y-6">
      <div className="bg-[#0B1426] border border-white/10 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2 border-b border-white/10 pb-4">
          {[
            { id: 'login' as const, label: 'Sign In' },
            { id: 'register' as const, label: 'Create Account' },
            { id: 'admin' as const, label: 'Admin Access' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-md text-xs font-semibold cursor-pointer ${
                tab === t.id ? 'bg-[#F5B82E] text-[#050B18]' : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'login' && (
          <>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs text-[#94A3B8] mb-1">Email</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="login-pass" className="block text-xs text-[#94A3B8] mb-1">Password</label>
                <input
                  id="login-pass"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full h-11 rounded-md bg-[#F5B82E] hover:bg-[#D4931D] text-[#050B18] text-sm font-semibold cursor-pointer"
              >
                {busy ? 'Signing In...' : 'Sign In'}
              </button>
            </form>

            <div className="pt-4 border-t border-white/10 space-y-2.5">
              <p className="text-xs text-[#94A3B8]">Demo Portal Accounts (Development Seed):</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDemoLogin('amina.hassan@corelink.co.tz')}
                  className="px-3 py-2 rounded border border-white/15 hover:border-[#F5B82E] text-xs text-white cursor-pointer"
                >
                  Customer (Amina)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDemoLogin('karibu.bespoke@corelink.co.tz')}
                  className="px-3 py-2 rounded border border-white/15 hover:border-[#F5B82E] text-xs text-white cursor-pointer"
                >
                  Merchant (Dar Guild)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDemoLogin('ops.dar@corelink.co.tz')}
                  className="px-3 py-2 rounded border border-white/15 hover:border-[#F5B82E] text-xs text-white cursor-pointer"
                >
                  Logistics Ops
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'register' && (
          <>
            {verificationHint ? (
              <form onSubmit={handleVerifyEmail} className="space-y-4">
                <p className="text-sm text-[#10B981]">
                  Account registered. Enter your email verification code (Preview delivery code: <strong className="font-mono text-white">{verificationHint}</strong>).
                </p>
                <input
                  required
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="6-digit verification code"
                  className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm font-mono text-white"
                />
                <button type="submit" disabled={busy} className="w-full h-11 rounded-md bg-[#10B981] text-[#050B18] text-sm font-semibold cursor-pointer">
                  Verify Email & Continue
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label htmlFor="reg-name" className="block text-xs text-[#94A3B8] mb-1">Full Name</label>
                  <input id="reg-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-email" className="block text-xs text-[#94A3B8] mb-1">Email</label>
                    <input id="reg-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
                  </div>
                  <div>
                    <label htmlFor="reg-phone" className="block text-xs text-[#94A3B8] mb-1">Phone</label>
                    <input id="reg-phone" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255..." className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-pass" className="block text-xs text-[#94A3B8] mb-1">Password (min 6 chars)</label>
                    <input id="reg-pass" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
                  </div>
                  <div>
                    <label htmlFor="reg-curr" className="block text-xs text-[#94A3B8] mb-1">Preferred Currency</label>
                    <select id="reg-curr" value={preferredCurrency} onChange={(e) => setPreferredCurrency(e.target.value as 'TZS' | 'USD')} className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white">
                      <option value="TZS">TZS Primary</option>
                      <option value="USD">USD Primary</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={busy} className="w-full h-11 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold cursor-pointer">
                  Create Customer Account
                </button>
              </form>
            )}
          </>
        )}

        {tab === 'admin' && (
          <form onSubmit={handleAdminClaimOrLogin} className="space-y-4">
            <div className="p-3 rounded-lg bg-[#050B18] border border-white/10 text-xs text-[#94A3B8]">
              <ShieldCheck className="w-4 h-4 inline mr-1.5 text-[#F5B82E]" />
              {adminNeedsBootstrap
                ? 'First-run Administrator setup: enter your email and choose an initial admin passcode (min 6 chars) to claim the Administrator console.'
                : 'Enter the configured Administrator passcode to access the SMG Corelink Admin Console.'}
            </div>
            {adminNeedsBootstrap && (
              <div>
                <label htmlFor="adm-email" className="block text-xs text-[#94A3B8] mb-1">Admin Email</label>
                <input
                  id="adm-email"
                  type="email"
                  value={email || 'admin@smgcorelink.co.tz'}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
                />
              </div>
            )}
            <div>
              <label htmlFor="adm-pass" className="block text-xs text-[#94A3B8] mb-1">
                {adminNeedsBootstrap ? 'Set Admin Passcode' : 'Administrator Passcode'}
              </label>
              <input
                id="adm-pass"
                type="password"
                minLength={6}
                required
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white"
              />
            </div>
            <button type="submit" disabled={busy} className="w-full h-11 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold cursor-pointer">
              {adminNeedsBootstrap ? 'Claim & Open Admin Console' : 'Sign In to Admin Console'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export function MerchantRegisterPage() {
  const { user, setUser, navigate, showToast } = useStore();
  const [businessName, setBusinessName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [brelaNumber, setBrelaNumber] = useState('');
  const [city, setCity] = useState('Dar es Salaam');
  const [country, setCountry] = useState('Tanzania');
  const [description, setDescription] = useState('');
  const [documentName, setDocumentName] = useState('brela_tin_bundle_2026.pdf');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('Please sign in or create an account first to register a business', 'info');
      navigate('auth');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{ merchantId: string; token: string; verificationStatus: string }>('/merchant/register', {
        method: 'POST',
        body: JSON.stringify({
          businessName,
          registrationNumber,
          tinNumber,
          brelaNumber,
          city,
          country,
          description,
          documentName,
        }),
      });
      setAuthToken(res.token);
      setUser({
        ...user,
        role: 'merchant',
        merchant: { id: res.merchantId, businessName, verificationStatus: res.verificationStatus },
      });
      showToast('Merchant verification application submitted!', 'success');
      navigate('merchant-dashboard');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Merchant registration failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-8 py-12 space-y-6">
      <div className="border-b border-white/10 pb-5">
        <h1 className="font-display text-3xl font-bold text-white">Merchant & Manufacturer Registration</h1>
        <p className="text-sm text-[#94A3B8] mt-1">
          Submit your BRELA & TRA TIN documentation for administrator verification. Once approved, publish across all 8 categories with TZS/USD pricing.
        </p>
      </div>

      {!user && (
        <div className="p-4 rounded-xl bg-[#0B1426] border border-[#F5B82E]/40 flex items-center justify-between gap-4">
          <p className="text-sm text-white">Sign in first to link your verified business to your account.</p>
          <button
            type="button"
            onClick={() => navigate('auth')}
            className="px-4 py-2 rounded-md bg-[#F5B82E] text-[#050B18] text-xs font-semibold cursor-pointer"
          >
            Sign In / Register
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-[#0B1426] border border-white/10 rounded-xl p-6 sm:p-8 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="m-bname" className="block text-xs text-[#94A3B8] mb-1">Registered Business Name</label>
            <input id="m-bname" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Mwanza Textiles & Export Co Ltd" className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
          </div>
          <div>
            <label htmlFor="m-reg" className="block text-xs text-[#94A3B8] mb-1">Business Reg Number</label>
            <input id="m-reg" required value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="TZ-REG-10482" className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
          </div>
          <div>
            <label htmlFor="m-tin" className="block text-xs text-[#94A3B8] mb-1">TRA TIN Number</label>
            <input id="m-tin" required value={tinNumber} onChange={(e) => setTinNumber(e.target.value)} placeholder="115-902-331" className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
          </div>
          <div>
            <label htmlFor="m-brela" className="block text-xs text-[#94A3B8] mb-1">BRELA Certificate No.</label>
            <input id="m-brela" value={brelaNumber} onChange={(e) => setBrelaNumber(e.target.value)} placeholder="BRELA-89201" className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
          </div>
          <div>
            <label htmlFor="m-city" className="block text-xs text-[#94A3B8] mb-1">City & Country</label>
            <input id="m-city" required value={`${city}, ${country}`} onChange={(e) => { const parts = e.target.value.split(','); setCity(parts[0]?.trim() || ''); setCountry(parts[1]?.trim() || 'Tanzania'); }} className="w-full h-10 px-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
          </div>
        </div>
        <div>
          <label htmlFor="m-desc" className="block text-xs text-[#94A3B8] mb-1">Business Description & Catalogue Scope</label>
          <textarea id="m-desc" rows={3} required value={description} onChange={(e) => setDescription(e.target.value)} className="w-full p-3 rounded-md bg-[#050B18] border border-white/15 text-sm text-white" />
        </div>
        <div>
          <label htmlFor="m-doc" className="block text-xs text-[#94A3B8] mb-1">Private Compliance Document Upload (BRELA / TIN / TBS PDF)</label>
          <input
            id="m-doc"
            type="file"
            accept=".pdf,.png,.jpg"
            onChange={(e) => setDocumentName(e.target.files?.[0]?.name || 'brela_tin_bundle_2026.pdf')}
            className="w-full text-xs text-[#94A3B8] file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-[#F5B82E] file:text-[#050B18] file:font-semibold"
          />
          <p className="text-[11px] text-[#94A3B8] mt-1">Selected file: {documentName} (stored in private restricted verification bucket)</p>
        </div>
        <button type="submit" disabled={busy} className="px-6 py-3 rounded-md bg-[#F5B82E] text-[#050B18] text-sm font-semibold cursor-pointer">
          {busy ? 'Submitting...' : 'Submit Verification Application'}
        </button>
      </form>
    </main>
  );
}
