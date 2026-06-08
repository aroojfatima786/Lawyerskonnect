import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiX, FiLogIn } from "react-icons/fi";
import { getApiBaseUrl } from "../../config/apiBase";
import { authApi } from "../../services/api";

const API_BASE = getApiBaseUrl();

export default function LawyerSignupModal() {
  const navigate = useNavigate();
  const closeToRegisterChoice = () => navigate("/register");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 3 &&
      password.length >= 6 &&
      confirmPassword === password
    );
  }, [email, password, confirmPassword]);

  const handleGoogleSignup = () => {
    window.location.href = `${API_BASE}/auth/google?role=lawyer`;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (confirmPassword !== password) {
      setErrorMsg("Password and Confirm Password do not match.");
      return;
    }

    try {
      setLoading(true);

      // ✅ Use /auth/lawyer/signup endpoint for lawyer registration
      const data: any = await authApi.lawyerSignup(email.trim().toLowerCase(), password);

      navigate('/auth/verify-email', {
        state: {
          userId: data?.userId,
          email: email.trim().toLowerCase(),
          isLawyer: true,
        },
      });
      sessionStorage.setItem('lk_lawyer_signup', '1');
    } catch (err: any) {
      setErrorMsg(err?.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-lk-navy via-slate-900 to-slate-950 p-4 sm:p-6">
      <div className="w-full max-w-[520px]">
        <button
          type="button"
          onClick={closeToRegisterChoice}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-white/80 transition-colors hover:text-white"
        >
          ← Back
        </button>

        <div className="overflow-hidden rounded-2xl border border-lk-border bg-lk-surface shadow-lk-card-lg">
          <div className="relative bg-lk-navy px-6 py-5 text-white">
            <div className="text-2xl font-extrabold">Join as Lawyer</div>
            <div className="text-white/80 text-sm">Create your account</div>

            <button
              onClick={closeToRegisterChoice}
              className="absolute right-4 top-4 h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center"
              aria-label="Close"
              type="button"
            >
              <FiX size={22} />
            </button>
          </div>

          <form
            onSubmit={onSubmit}
            className="px-6 py-6 max-h-[75vh] overflow-auto"
          >
            <div className="space-y-4">
              <Field label="Email Address">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  type="email"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#f0a31c]"
                />
              </Field>

              <Field label="Password">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create password"
                  type="password"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#f0a31c]"
                />
              </Field>

              <Field label="Confirm Password">
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  type="password"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-[#f0a31c]"
                />
              </Field>

              {confirmPassword.length > 0 && confirmPassword !== password && (
                <div className="text-sm text-red-600">
                  Password and Confirm Password do not match.
                </div>
              )}

              {errorMsg && (
                <div className="text-sm text-red-600">{errorMsg}</div>
              )}

              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="w-full mt-2 rounded-xl py-3 font-extrabold text-white disabled:opacity-60"
                style={{
                  backgroundColor: "#f0a31c",
                  boxShadow: "0 10px 22px rgba(240,163,28,.25)",
                }}
              >
                {loading ? "Creating..." : "Create Account →"}
              </button>

              <button
                type="button"
                onClick={handleGoogleSignup}
                className="w-full mt-3 rounded-xl border border-slate-200 bg-white py-3 font-extrabold text-slate-700 flex items-center justify-center gap-2 hover:bg-slate-50"
              >
                <FiLogIn size={18} />
                Sign up with Google
              </button>

              <div className="text-center text-sm text-slate-600">
                Already registered?{" "}
                <span
                  className="text-[#f0a31c] font-semibold cursor-pointer"
                  onClick={() => navigate("/auth/lawyer/login")}
                >
                  Login here
                </span>
              </div>

              <div className="text-[12px] text-slate-500 text-center">
                Verify your email first, then pay the one-time Rs. 2,000 registration fee. Profile
                details are completed after sign-in.
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-slate-700 mb-2">{label}</div>
      {children}
    </div>
  );
}
