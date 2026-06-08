import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiX, FiLogIn } from "react-icons/fi";
import { getApiBaseUrl } from "../../config/apiBase";
import { authApi } from "../../services/api";

const API_BASE = getApiBaseUrl();

export default function CitizenSignupModal() {
  const navigate = useNavigate();

  // ✅ close/back should go to register choice (not home)
  const closeToRegisterChoice = () => navigate("/register");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const handleGoogleSignup = () => {
    window.location.href = `${API_BASE}/auth/google?role=citizen`;
  };

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 3 &&
      password.length >= 6 &&
      confirmPassword === password
    );
  }, [email, password, confirmPassword]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (confirmPassword !== password) {
      setErrorMsg("Password and Confirm Password do not match.");
      return;
    }

    try {
      setLoading(true);

      // ✅ Use /auth/signup endpoint for citizen registration (default role is citizen)
      const data: any = await authApi.signup(email.trim().toLowerCase(), password);

      setSuccessMsg(data?.message || "Signup successful. Verify your email.");

      // ✅ move to verify-email screen
      // pass userId/email and isLawyer flag so verification works
      navigate("/auth/verify-email", {
        state: { 
          userId: data?.userId, 
          email: email.trim().toLowerCase(),
          isLawyer: false, // Citizen signup
        },
      });
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
          {/* Header */}
          <div className="relative bg-lk-navy px-6 py-5 text-white">
            <div className="text-2xl font-extrabold">Register as Citizen</div>
            <div className="text-white/80 text-sm">Create your account</div>

            {/* ✅ X close */}
            <button
              onClick={closeToRegisterChoice}
              className="absolute right-4 top-4 h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center"
              aria-label="Close"
              type="button"
            >
              <FiX size={22} />
            </button>
          </div>

          {/* Body */}
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
              {successMsg && (
                <div className="text-sm text-green-700">{successMsg}</div>
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
                className="w-full mt-3 rounded-xl border border-slate-200 py-3 text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2"
              >
                <FiLogIn /> Continue with Google
              </button>

              <div className="text-center text-sm text-slate-600">
                Already registered?{" "}
                <span
                  className="text-[#f0a31c] font-semibold cursor-pointer"
                  onClick={() => navigate("/auth/citizen/login")}
                >
                  Login here
                </span>
              </div>

              <div className="text-[12px] text-slate-500 text-center">
                Note: CNIC, contact info, payment info will be added after login
                on “Complete Profile”.
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
